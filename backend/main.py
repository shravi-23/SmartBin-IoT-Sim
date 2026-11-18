"""
main.py – FastAPI server that:
  1. Runs a SimPy simulation in a background thread.
  2. Streams live events over WebSocket /ws.
  3. Exposes REST endpoints to control the simulation.
"""

import asyncio
import json
import threading
import time
import numpy as np
import simpy
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from sim.node import BinNode
from sim.network import Network
from sim.experiments import run_experiments

# ──────────────────────────────────────────────────────────────────────────────
# App & CORS
# ──────────────────────────────────────────────────────────────────────────────

app = FastAPI(title="Smart Dustbin Simulation API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],    # open for local dev; restrict in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# ──────────────────────────────────────────────────────────────────────────────
# Global simulation state
# ──────────────────────────────────────────────────────────────────────────────

class SimState:
    """Container for all mutable simulation globals."""
    def __init__(self):
        self.env: simpy.Environment | None = None
        self.network: Network | None = None
        self.nodes: list[BinNode] = []
        self.thread: threading.Thread | None = None
        self.running = False
        self.paused = False
        self.mode = "OURS"          # "OLD" or "OURS"
        self.seed = 42
        self.n_nodes = 50
        self.n_dead = 15
        self.spike_size = 8
        self.speed = 10.0           # simulation-time / wall-time ratio
        self.event_queue: asyncio.Queue = None  # set on start
        self.loop: asyncio.AbstractEventLoop = None


sim = SimState()

# Connected WebSocket clients
ws_clients: list[WebSocket] = []


# ──────────────────────────────────────────────────────────────────────────────
# Event pipeline
# ──────────────────────────────────────────────────────────────────────────────

def _enqueue_event(event: dict):
    """Called from the SimPy thread; pushes event into the asyncio queue."""
    if sim.event_queue and sim.loop and sim.loop.is_running():
        sim.loop.call_soon_threadsafe(sim.event_queue.put_nowait, event)


# ──────────────────────────────────────────────────────────────────────────────
# Simulation thread
# ──────────────────────────────────────────────────────────────────────────────

def _build_simulation(mode: str):
    """Create a fresh SimPy environment with nodes and network."""
    env = simpy.Environment()
    net = Network(env, mode, _enqueue_event)

    rng = np.random.default_rng(sim.seed)
    positions = rng.uniform(0, 1000, size=(sim.n_nodes, 2))
    dead_ids = set(rng.choice(sim.n_nodes, size=sim.n_dead, replace=False).tolist())
    net.dead_node_ids = dead_ids

    nodes = []
    for i in range(sim.n_nodes):
        node_rng = np.random.default_rng(sim.seed + i * 100)
        n = BinNode(
            node_id=i,
            env=env,
            network=net,
            x=float(positions[i, 0]),
            y=float(positions[i, 1]),
            dead_zone=(i in dead_ids),
            rng=node_rng,
            mode=mode,
        )
        nodes.append(n)
        env.process(n.run())

    net.nodes = nodes
    return env, net, nodes


def _emit_node_states(env: simpy.Environment, nodes: list, net: Network):
    """Periodically emit a snapshot of all node states for the map."""
    _enqueue_event({
        "type": "node_states",
        "t": env.now,
        "kpi": net.get_kpi_snapshot(),
        "nodes": [
            {
                "id": n.node_id,
                "x": round(n.x, 1),
                "y": round(n.y, 1),
                "urgency": round(n.urgency, 3),
                "dead_zone": n.dead_zone,
                "sleeping": n.sleeping,
                "seq": n.seq,
                "sensors": {k: round(v, 3) if isinstance(v, float) else v
                            for k, v in n.sensors.items()},
                "urgency_history": n.urgency_history[-20:],
            }
            for n in nodes
        ],
    })


def _run_simulation(mode: str):
    """Main simulation loop – runs in a daemon thread."""
    env, net, nodes = _build_simulation(mode)
    sim.env = env
    sim.network = net
    sim.nodes = nodes

    # Immediately emit initial state snapshot to clients
    _emit_node_states(env, nodes, net)

    STEP = 5.0          # advance simulation this many seconds per wall-tick
    WALL_TICK = 0.1     # wall-clock seconds per tick

    step_counter = 0
    snapshot_every = 10  # emit node_states every 10 ticks ≈ 1 second wall time

    while sim.running:
        if sim.paused:
            time.sleep(0.1)
            continue

        # Advance simulation time
        target = env.now + STEP * sim.speed * WALL_TICK
        env.run(until=target)

        step_counter += 1
        if step_counter % snapshot_every == 0:
            _emit_node_states(env, nodes, net)

        time.sleep(WALL_TICK)

    print("[sim] Thread exiting.")


# ──────────────────────────────────────────────────────────────────────────────
# WebSocket endpoint
# ──────────────────────────────────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    ws_clients.append(ws)
    print(f"[ws] Client connected. Total: {len(ws_clients)}")

    # Immediately push current topology so the client has nodes without delay
    if sim.nodes and sim.network and sim.env:
        try:
            snapshot = {
                "type": "node_states",
                "t": sim.env.now,
                "kpi": sim.network.get_kpi_snapshot(),
                "nodes": [
                    {
                        "id": n.node_id,
                        "x": round(n.x, 1),
                        "y": round(n.y, 1),
                        "urgency": round(n.urgency, 3),
                        "dead_zone": n.dead_zone,
                        "sleeping": n.sleeping,
                        "seq": n.seq,
                        "sensors": {k: round(v, 3) if isinstance(v, float) else v
                                    for k, v in n.sensors.items()},
                        "urgency_history": n.urgency_history[-20:],
                    }
                    for n in sim.nodes
                ],
            }
            await ws.send_text(json.dumps(snapshot))
        except Exception as err:
            print(f"[ws] Initial snapshot send failed: {err}")

    try:
        while True:
            # Block briefly – we mainly push; also check for client disconnect
            try:
                await asyncio.wait_for(ws.receive_text(), timeout=0.05)
            except asyncio.TimeoutError:
                pass
    except WebSocketDisconnect:
        if ws in ws_clients:
            ws_clients.remove(ws)
        print(f"[ws] Client disconnected. Total: {len(ws_clients)}")


async def _broadcast_loop():
    """
    Asyncio task: drain the event queue and broadcast to all WS clients.
    Runs at ~10 events/second.
    """
    while True:
        if sim.event_queue:
            try:
                # Collect up to 20 events per cycle to batch them
                batch = []
                for _ in range(20):
                    try:
                        ev = sim.event_queue.get_nowait()
                        batch.append(ev)
                    except asyncio.QueueEmpty:
                        break

                for event in batch:
                    dead_clients = []
                    for ws in ws_clients:
                        try:
                            await ws.send_text(json.dumps(event))
                        except Exception:
                            dead_clients.append(ws)
                    for dc in dead_clients:
                        ws_clients.remove(dc)
            except Exception as e:
                print(f"[broadcast] Error: {e}")

        await asyncio.sleep(0.1)


@app.on_event("startup")
async def startup():
    sim.loop = asyncio.get_running_loop()
    sim.event_queue = asyncio.Queue()
    asyncio.create_task(_broadcast_loop())
    # Pre-generate initial topology so nodes exist before manual start
    env, net, nodes = _build_simulation(sim.mode)
    sim.env = env
    sim.network = net
    sim.nodes = nodes


# ──────────────────────────────────────────────────────────────────────────────
# Request models
# ──────────────────────────────────────────────────────────────────────────────

class StartSettings(BaseModel):
    mode: Optional[str] = "OURS"
    n_nodes: Optional[int] = 50
    n_dead: Optional[int] = 15
    spike_size: Optional[int] = 8
    speed: Optional[float] = 10.0
    seed: Optional[int] = 42


class UpdateSettings(BaseModel):
    speed: Optional[float] = None
    spike_size: Optional[int] = None
    n_nodes: Optional[int] = None
    n_dead: Optional[int] = None


class SpikeRequest(BaseModel):
    spike_size: Optional[int] = 8


class TamperRequest(BaseModel):
    node_id: Optional[int] = 0


class ReplayRequest(BaseModel):
    node_id: Optional[int] = 0


class MetalScanRequest(BaseModel):
    scan_size: Optional[int] = 5


# ──────────────────────────────────────────────────────────────────────────────
# REST endpoints
# ──────────────────────────────────────────────────────────────────────────────

@app.post("/params")
def update_params(settings: UpdateSettings):
    """Dynamically update simulation parameters (speed, spike_size, nodes, dead zones)."""
    rebuilt = False

    if settings.speed is not None:
        sim.speed = max(0.5, float(settings.speed))

    if settings.spike_size is not None:
        sim.spike_size = max(1, int(settings.spike_size))

    if settings.n_nodes is not None and int(settings.n_nodes) != sim.n_nodes:
        sim.n_nodes = max(5, int(settings.n_nodes))
        rebuilt = True

    if settings.n_dead is not None and int(settings.n_dead) != sim.n_dead:
        sim.n_dead = min(max(0, int(settings.n_dead)), sim.n_nodes)
        rebuilt = True

    if rebuilt:
        if sim.running:
            sim.running = False
            if sim.thread and sim.thread.is_alive():
                sim.thread.join(timeout=2.0)
            sim.running = True
            sim.thread = threading.Thread(target=_run_simulation, args=(sim.mode,), daemon=True)
            sim.thread.start()
        else:
            env, net, nodes = _build_simulation(sim.mode)
            sim.env = env
            sim.network = net
            sim.nodes = nodes
            _emit_node_states(env, nodes, net)

    return {
        "status": "updated",
        "speed": sim.speed,
        "spike_size": sim.spike_size,
        "n_nodes": sim.n_nodes,
        "n_dead": sim.n_dead,
        "rebuilt": rebuilt,
    }


@app.post("/start")
def start_sim(settings: StartSettings):
    """Start or restart the simulation with given settings."""
    if sim.running:
        sim.running = False
        if sim.thread and sim.thread.is_alive():
            sim.thread.join(timeout=2.0)

    sim.mode = settings.mode
    sim.n_nodes = settings.n_nodes
    sim.n_dead = settings.n_dead
    sim.spike_size = settings.spike_size
    sim.speed = settings.speed
    sim.seed = settings.seed
    sim.paused = False
    sim.running = True

    sim.thread = threading.Thread(target=_run_simulation, args=(settings.mode,), daemon=True)
    sim.thread.start()
    return {"status": "started", "mode": settings.mode}


@app.post("/pause")
def pause_sim():
    """Toggle pause/resume."""
    sim.paused = not sim.paused
    return {"paused": sim.paused}


@app.post("/reset")
def reset_sim():
    """Stop the simulation, rebuild a clean idle topology, and emit initial states."""
    sim.running = False
    if sim.thread and sim.thread.is_alive():
        sim.thread.join(timeout=2.0)
    sim.paused = False

    env, net, nodes = _build_simulation(sim.mode)
    sim.env = env
    sim.network = net
    sim.nodes = nodes
    _emit_node_states(env, nodes, net)

    return {"status": "reset"}


@app.post("/spike")
def trigger_spike(req: SpikeRequest):
    """Inject a methane spike affecting nearby nodes (auto-starts if needed)."""
    if not sim.running:
        sim.running = True
        sim.paused = False
        sim.thread = threading.Thread(target=_run_simulation, args=(sim.mode,), daemon=True)
        sim.thread.start()
        time.sleep(0.15)

    if sim.network:
        size = req.spike_size or sim.spike_size
        sim.network.trigger_spike(size)
        # Immediately emit states so UI turns spiked nodes Red with pulsing rings right away
        _emit_node_states(sim.env, sim.nodes, sim.network)
        return {"status": "spike triggered", "affected": len(sim.network.spike_node_ids)}
    return {"status": "simulation not running"}


@app.post("/tamper")
def tamper_packet(req: TamperRequest):
    """Flag the next packet for tag corruption (auto-starts if needed)."""
    if not sim.running:
        sim.running = True
        sim.paused = False
        sim.thread = threading.Thread(target=_run_simulation, args=(sim.mode,), daemon=True)
        sim.thread.start()
        time.sleep(0.15)

    if sim.network:
        sim.network._inject_tamper = True
        return {"status": "tamper injected"}
    return {"status": "simulation not running"}


@app.post("/replay")
def replay_packet(req: ReplayRequest):
    """Inject a replayed packet from the given node (auto-starts if needed)."""
    if not sim.running:
        sim.running = True
        sim.paused = False
        sim.thread = threading.Thread(target=_run_simulation, args=(sim.mode,), daemon=True)
        sim.thread.start()
        time.sleep(0.15)

    if sim.network and sim.nodes:
        node = sim.nodes[req.node_id % len(sim.nodes)]
        old_seq = node.seq
        sim.network._inject_replay = {"node_id": node.node_id, "seq": max(0, old_seq - 1)}
        return {"status": "replay injected", "seq": max(0, old_seq - 1)}
    return {"status": "simulation not running or no packets yet"}


@app.post("/metal_scan")
def metal_scan(req: MetalScanRequest):
    """Force metal detection scan on random nodes."""
    if not sim.running:
        sim.running = True
        sim.paused = False
        sim.thread = threading.Thread(target=_run_simulation, args=(sim.mode,), daemon=True)
        sim.thread.start()
        time.sleep(0.15)
    if sim.network:
        sim.network.trigger_metal_scan(req.scan_size or 5)
        _emit_node_states(sim.env, sim.nodes, sim.network)
        return {"status": "metal scan triggered", "affected": req.scan_size}
    return {"status": "simulation not running"}


@app.get("/status")
def get_status():
    """Return current simulation status and KPIs."""
    kpi = sim.network.get_kpi_snapshot() if sim.network else {}
    return {
        "running": sim.running,
        "paused": sim.paused,
        "mode": sim.mode,
        "sim_time": round(sim.env.now, 2) if sim.env else 0,
        "kpi": kpi,
    }


@app.get("/experiments")
def get_experiments():
    """
    Run the 3 batch experiments (30 runs each) and return results.
    Warning: takes ~30-60 seconds depending on hardware.
    """
    data = run_experiments(n_runs=30)
    return data


@app.get("/nodes")
def get_nodes():
    """Return current node states for initial UI load."""
    if not sim.nodes:
        return {"nodes": []}
    return {
        "nodes": [
            {
                "id": n.node_id,
                "x": round(n.x, 1),
                "y": round(n.y, 1),
                "urgency": round(n.urgency, 3),
                "dead_zone": n.dead_zone,
                "sleeping": n.sleeping,
            }
            for n in sim.nodes
        ]
    }

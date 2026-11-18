"""
network.py – The LoRa radio channel and gateway logic.

Responsibilities:
  - Manage a shared channel resource (simpy.Resource with capacity=1).
    If two packets arrive at the same moment both are "collided" and lost.
  - Route packets to the gateway.
  - Maintain KPI counters (delivered, lost, relayed, attacks caught, etc.).
  - Emit real-time events to the WebSocket layer via a callback.
  - Handle methane spikes, tamper attacks, and replay attacks.
"""

import simpy
import numpy as np
import math
from sim.security import verify_tag, is_replay, reset_replay_cache


class Network:
    """
    Shared network environment for all bin nodes.

    Parameters
    ----------
    env          : simpy.Environment
    nodes        : list[BinNode]   – all nodes (set after construction)
    mode         : str             – "OLD" or "OURS"
    event_cb     : callable        – async-safe callback to push events to the UI
    """

    CHANNEL_CAPACITY = 1        # only 1 packet on air at a time
    AIRTIME = 0.120             # seconds
    GATEWAY_X = 500.0           # centre of 1 km grid
    GATEWAY_Y = 500.0

    def __init__(self, env: simpy.Environment, mode: str, event_cb):
        self.env = env
        self.mode = mode
        self.event_cb = event_cb  # function(dict) – fire-and-forget

        self.nodes: list = []       # filled by the sim after node creation
        self.dead_node_ids: set = set()
        self.spike_active = False
        self.spike_node_ids: set = set()

        # Channel state: track active transmissions for exact ALOHA time-overlap collision
        self.channel_busy_until = 0.0
        self.active_transmissions: list[dict] = []
        self._collision_flag = False

        # KPI counters
        self.kpi = {
            "total_sent": 0,
            "delivered": 0,
            "collided": 0,
            "relayed": 0,
            "saved_sleep": 0,
            "attacks_caught": 0,
            "critical_sent": 0,
            "critical_delivered": 0,
            "delay_sum": 0.0,
            "delay_count": 0,
            "metal_alerts": 0,
        }

        # Tamper/replay injection flags (set via REST endpoints)
        self._inject_tamper = False
        self._inject_replay: dict | None = None   # stored packet to replay

    # ── Spike helpers ──────────────────────────────────────────────────────────

    def trigger_spike(self, spike_size: int = 8):
        """Mark `spike_size` random nodes as affected by a methane spike."""
        if not self.nodes:
            return
        chosen = np.random.choice(len(self.nodes), size=min(spike_size, len(self.nodes)),
                                   replace=False)
        self.spike_node_ids = set(int(i) for i in chosen)
        self.spike_active = True

        # Immediately update urgency for the spiked nodes
        from sim.node import compute_urgency
        for nid in self.spike_node_ids:
            if nid < len(self.nodes):
                node = self.nodes[nid]
                node.sensors = node.read_sensors(methane_spike=True)
                node.urgency = compute_urgency(
                    node.sensors["fill_speed"],
                    node.sensors["gas_rise"],
                    node.sensors["weight_change"]
                )
                node.sleeping = False
                node.urgency_history.append(round(node.urgency, 3))

        self.emit_event({"type": "spike_start", "nodes": list(self.spike_node_ids),
                         "t": self.env.now})

    def clear_spike(self):
        self.spike_active = False
        self.spike_node_ids.clear()

    def is_spike_node(self, node_id: int) -> bool:
        return node_id in self.spike_node_ids

    # ── Relay finder ───────────────────────────────────────────────────────────

    def find_relay(self, node) -> "BinNode | None":
        """
        Find the closest non-dead-zone node to `node` that can forward its packet.
        Returns None if no such node exists within 300 m.
        """
        best = None
        best_dist = 300.0  # max relay distance in metres
        for other in self.nodes:
            if other.node_id == node.node_id:
                continue
            if other.dead_zone:
                continue
            dist = math.sqrt((other.x - node.x) ** 2 + (other.y - node.y) ** 2)
            if dist < best_dist:
                best_dist = dist
                best = other
        return best

    # ── Transmission ───────────────────────────────────────────────────────────

    def transmit(self, node, frame: bytes, relayed: bool, via):
        """
        SimPy generator: try to occupy the channel for AIRTIME seconds.

        Collision detection:
          - If channel is already occupied (capacity full), we mark the
            in-progress packet AND this new packet as collided.
        """
        sent_time = self.env.now
        is_critical = node.urgency >= 0.75

        self.kpi["total_sent"] += 1
        if is_critical:
            self.kpi["critical_sent"] += 1

        # Emit "packet sent" event
        self.emit_event({
            "type": "packet_sent",
            "node_id": node.node_id,
            "seq": node.seq,
            "urgency": round(node.urgency, 3),
            "relayed": relayed,
            "via": via.node_id if via else None,
            "t": sent_time,
            "frame_hex": frame.hex(),
        })

        # Channel collision check:
        # If transmission starts while channel is still busy from an earlier packet,
        # or if another packet starts while this one is in flight -> collision!
        has_overlap = (self.env.now < self.channel_busy_until)
        tx_record = {"collided": has_overlap, "node_id": node.node_id}

        if has_overlap:
            for active in self.active_transmissions:
                active["collided"] = True

        self.active_transmissions.append(tx_record)
        self.channel_busy_until = max(self.channel_busy_until, self.env.now + self.AIRTIME)

        # Transmit for the airtime duration
        yield self.env.timeout(self.AIRTIME)

        if tx_record in self.active_transmissions:
            self.active_transmissions.remove(tx_record)

        if tx_record["collided"]:
            self.kpi["collided"] += 1
            self.emit_event({
                "type": "packet_collided",
                "node_id": node.node_id,
                "seq": node.seq,
                "urgency": round(node.urgency, 3),
                "t": self.env.now,
            })
            return

        # ── Optionally inject a tamper / replay attack ──────────────────────
        tag_ok = True
        replay_ok = True

        if self._inject_tamper:
            # Corrupt the tag (flip a byte)
            frame = bytearray(frame)
            frame[5] ^= 0xFF  # flip first byte of TAG field
            frame = bytes(frame)
            self._inject_tamper = False
            tag_ok = False

        # Parse tag from frame (bytes 5-8 inclusive)
        tag_bytes = frame[5:9]

        # Verify the tag
        # Urgency is at byte 24 if OURS mode (after 11-byte header + 16 bytes sensor)
        # For simplicity, use node.urgency directly (in real HW we'd parse the frame)
        urgency_for_verify = node.urgency if self.mode == "OURS" else 0.0
        if not verify_tag(node.node_id, node.seq, node.clock_drift,
                          urgency_for_verify, tag_bytes):
            tag_ok = False

        # Replay check
        if is_replay(node.node_id, node.seq):
            replay_ok = False

        if not tag_ok or not replay_ok:
            self.kpi["attacks_caught"] += 1
            self.emit_event({
                "type": "packet_rejected",
                "node_id": node.node_id,
                "seq": node.seq,
                "reason": "bad_tag" if not tag_ok else "replay",
                "urgency": round(node.urgency, 3),
                "t": self.env.now,
                "frame_hex": frame.hex(),
            })
            return

        # ── Delivered ──────────────────────────────────────────────────────
        delay = self.env.now - sent_time
        self.kpi["delivered"] += 1
        self.kpi["delay_sum"] += delay
        self.kpi["delay_count"] += 1
        if relayed:
            self.kpi["relayed"] += 1
        if is_critical:
            self.kpi["critical_delivered"] += 1

        if node.sensors.get("metal_detected"):
            self.kpi["metal_alerts"] += 1
            self.emit_event({
                "type": "metal_detected",
                "node_id": node.node_id,
                "seq": node.seq,
                "urgency": round(node.urgency, 3),
                "t": self.env.now,
            })

        self.emit_event({
            "type": "packet_delivered",
            "node_id": node.node_id,
            "seq": node.seq,
            "urgency": round(node.urgency, 3),
            "relayed": relayed,
            "via": via.node_id if via else None,
            "delay": round(delay, 4),
            "t": self.env.now,
        })

    # ── Metal scan ─────────────────────────────────────────────────────────────

    def trigger_metal_scan(self, scan_size: int = 5):
        """Force metal detection alert on random nodes."""
        if not self.nodes:
            return
        chosen = np.random.choice(len(self.nodes), size=min(scan_size, len(self.nodes)), replace=False)
        for nid in chosen:
            node = self.nodes[nid]
            node.sensors["metal_detected"] = True
        self.emit_event({"type": "metal_scan", "nodes": list(int(i) for i in chosen), "t": self.env.now})

    # ── KPI snapshot ───────────────────────────────────────────────────────────

    def get_kpi_snapshot(self) -> dict:
        """Return a clean dictionary of current KPIs for the UI."""
        delivered = self.kpi["delivered"]
        sent = max(self.kpi["total_sent"], 1)
        crit_sent = max(self.kpi["critical_sent"], 1)
        avg_delay = (self.kpi["delay_sum"] / max(self.kpi["delay_count"], 1))

        return {
            "delivery_rate": round(delivered / sent * 100, 1),
            "critical_delivery_rate": round(
                self.kpi["critical_delivered"] / crit_sent * 100, 1),
            "avg_delay_ms": round(avg_delay * 1000, 1),
            "relay_count": self.kpi["relayed"],
            "attacks_caught": self.kpi["attacks_caught"],
            "total_sent": self.kpi["total_sent"],
            "delivered": delivered,
            "collided": self.kpi["collided"],
            "metal_alerts": self.kpi["metal_alerts"],
        }

    # ── Event emitter ──────────────────────────────────────────────────────────

    def emit_event(self, event: dict):
        """Push an event dict to the callback (registered by main.py)."""
        if self.event_cb:
            self.event_cb(event)

    # ── Reset ──────────────────────────────────────────────────────────────────

    def reset_kpi(self):
        for k in self.kpi:
            self.kpi[k] = 0 if isinstance(self.kpi[k], int) else 0.0
        reset_replay_cache()
        self.spike_active = False
        self.spike_node_ids.clear()

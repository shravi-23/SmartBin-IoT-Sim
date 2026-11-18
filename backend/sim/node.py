"""
node.py – A single smart dustbin sensor node.

Each node:
  - Has a random position in a 1 km × 1 km grid.
  - Reads fake sensor values every 60 simulated seconds.
  - Computes the Urgency Index U.
  - Decides how to transmit (OLD mode vs OURS mode).
  - Builds the 11-byte header + up to 40 bytes sensor payload.
"""

import simpy
import numpy as np
import struct
import math
from collections import deque
from sim.security import make_tag

# ── Urgency sigmoid ────────────────────────────────────────────────────────────

def sigmoid(x: float) -> float:
    """Squash any real number into (0, 1). Used to cap the urgency index."""
    return 1.0 / (1.0 + math.exp(-x))


def compute_urgency(fill_speed: float, gas_rise: float, weight_change: float, metal_detected: bool = False) -> float:
    """
    Urgency Index U = sigmoid(scale * (0.40*fill_speed + 0.45*gas_rise + 0.15*weight_change - offset)).
    Normal calm conditions (gas ~0-0.2, fill ~0-0.5) yield U < 0.45 (Teal / Safe).
    Elevated conditions yield U in [0.45, 0.75) (Amber / Watch).
    Hazard / methane spikes (gas >= 0.8) yield U >= 0.75 (Red / Critical).
    """
    metal_boost = 0.15 if metal_detected else 0.0
    raw = 0.40 * fill_speed + 0.45 * gas_rise + 0.15 * weight_change + metal_boost
    u = sigmoid(6.0 * (raw - 0.35))
    return float(max(0.01, min(0.99, u)))


# ── Packet builder ─────────────────────────────────────────────────────────────

def build_frame(node_id: int, seq: int, clock_drift: float, urgency: float,
                sensors: dict, mode: str) -> bytes:
    """
    Build the 11-byte header + sensor payload.

    Header layout (11 bytes):
      HDR      1 byte  – 0xAB (magic)
      NODE-ID  2 bytes – unsigned short
      SEQ      2 bytes – unsigned short
      TAG      4 bytes – HMAC truncated
      STATUS   2 bytes – bits: bit0=dead_zone, bit1=relayed, bit2=critical

    Sensor payload (up to 40 bytes):
      fill_speed    4 bytes float
      gas_rise      4 bytes float
      weight_change 4 bytes float
      temperature   4 bytes float
      urgency       4 bytes float   (only included in OURS mode)
    """
    tag = make_tag(node_id, seq, clock_drift, urgency if mode == "OURS" else 0.0)

    status = 0
    if sensors.get("dead_zone"):
        status |= 1
    if sensors.get("relayed"):
        status |= 2
    if urgency >= 0.75:
        status |= 4

    header = struct.pack(">BHHH4sH",
                         0xAB,            # magic byte
                         node_id,
                         seq,
                         0,               # padding (reuse slot for status below)
                         tag,
                         status)

    # Rebuild without the padding slot (simpler flat pack)
    header = bytes([0xAB]) + \
             struct.pack(">HH", node_id, seq) + \
             tag + \
             struct.pack(">H", status)

    # Sensor data (20 bytes base, +4 if OURS mode)
    payload = struct.pack(">ffff",
                          sensors["fill_speed"],
                          sensors["gas_rise"],
                          sensors["weight_change"],
                          sensors["temperature"])
    if mode == "OURS":
        payload += struct.pack(">f", urgency)

    return header + payload


# ── Node class ─────────────────────────────────────────────────────────────────

class BinNode:
    """
    Represents one smart dustbin in the simulation.

    Parameters
    ----------
    node_id    : int   – unique 0-based index
    env        : simpy.Environment
    network    : Network object (handles channel & gateway)
    x, y       : float – position in metres (0-1000)
    dead_zone  : bool  – True if signal is too weak for direct uplink
    rng        : np.random.Generator – per-node reproducible RNG
    mode       : str   – "OLD" or "OURS"
    """

    AIRTIME = 0.120  # seconds of simulated time each packet occupies the channel
    SENSE_INTERVAL = 60  # sense every 60 simulated seconds

    def __init__(self, node_id, env, network, x, y, dead_zone, rng, mode="OURS"):
        self.node_id = node_id
        self.env = env
        self.network = network
        self.x = x
        self.y = y
        self.dead_zone = dead_zone
        self.rng = rng
        self.mode = mode

        # Running state
        self.seq = 0
        self.clock_drift = rng.uniform(-5.0, 5.0)  # ms

        # Dedup cache: list of (node_id, seq) forwarded recently (max 16 entries)
        self._dedup: deque = deque(maxlen=16)
        self._dedup_times: dict = {}   # (node_id, seq) -> env.now when added

        # Initial sensor reading and urgency
        self.sensors = self.read_sensors(methane_spike=False)
        self.urgency = compute_urgency(
            self.sensors["fill_speed"],
            self.sensors["gas_rise"],
            self.sensors["weight_change"],
            self.sensors.get("metal_detected", False),
        )
        self.sleeping = (self.mode == "OURS" and self.dead_zone and self.urgency < 0.75)

        # History for the UI
        self.urgency_history: list[float] = [round(self.urgency, 3)]
        self.packet_log: list[dict] = []

    # ── Sensor reading ─────────────────────────────────────────────────────

    def read_sensors(self, methane_spike: bool = False) -> dict:
        """
        Generate fake sensor readings.
        When methane_spike is True: gas_rise is severely elevated, causing U >= 0.75.
        """
        if methane_spike:
            fill_speed = float(self.rng.uniform(0.35, 0.85))
            gas_rise = float(self.rng.uniform(0.85, 1.30))
            weight_change = float(self.rng.uniform(0.20, 0.70))
            temperature = float(self.rng.uniform(48.0, 72.0))
            metal_detected = bool(self.rng.random() < 0.25)
        else:
            fill_speed = float(self.rng.uniform(0.05, 0.60))
            gas_rise = float(self.rng.uniform(0.01, 0.20))
            weight_change = float(self.rng.uniform(0.05, 0.40))
            temperature = float(self.rng.uniform(22.0, 34.0))
            metal_detected = bool(self.rng.random() < 0.05)

        return {
            "fill_speed": fill_speed,
            "gas_rise": gas_rise,
            "weight_change": weight_change,
            "temperature": temperature,
            "dead_zone": self.dead_zone,
            "relayed": False,
            "metal_detected": metal_detected,
        }

    # ── Backoff helpers ────────────────────────────────────────────────────

    def _backoff_window(self) -> int:
        """
        OLD mode: always 7 slots.
        OURS mode: floor(7 / (U + 1))  → urgent nodes wait less.
        """
        if self.mode == "OLD":
            return 7
        return max(1, int(7 / (self.urgency + 1)))

    def _random_backoff(self) -> float:
        """Draw a random delay in [0, window * AIRTIME] seconds."""
        window = self._backoff_window()
        return float(self.rng.integers(0, window)) * self.AIRTIME

    # ── SimPy process ──────────────────────────────────────────────────────

    def run(self):
        """Main loop: sense → decide → transmit, every SENSE_INTERVAL seconds."""
        # Stagger start so all nodes don't transmit at t=0
        yield self.env.timeout(self.rng.uniform(0, self.SENSE_INTERVAL))

        while True:
            # Check for methane spike flag from the network
            spike_active = self.network.spike_active and self.network.is_spike_node(self.node_id)
            self.sensors = self.read_sensors(methane_spike=spike_active)
            self.urgency = compute_urgency(
                self.sensors["fill_speed"],
                self.sensors["gas_rise"],
                self.sensors["weight_change"],
                self.sensors.get("metal_detected", False),
            )
            self.urgency_history.append(round(self.urgency, 3))
            if len(self.urgency_history) > 50:
                self.urgency_history.pop(0)

            self.seq = (self.seq + 1) % 65536

            # Decide transmission strategy
            if self.mode == "OURS":
                yield from self._ours_transmit()
            else:
                yield from self._old_transmit()

            yield self.env.timeout(self.SENSE_INTERVAL)

    def _old_transmit(self):
        """OLD mode: random backoff, then direct uplink only."""
        yield self.env.timeout(self._random_backoff())
        frame = build_frame(self.node_id, self.seq, self.clock_drift,
                            self.urgency, self.sensors, "OLD")
        yield from self.network.transmit(self, frame, relayed=False, via=None)

    def _ours_transmit(self):
        """
        OURS mode:
          - Dead zone + high urgency  → relay through nearest non-dead node.
          - Dead zone + low urgency   → save data and sleep (no transmission).
          - Good signal              → direct with smaller backoff.
        """
        if self.dead_zone:
            if self.urgency >= 0.75:
                # Find relay node
                relay = self.network.find_relay(self)
                if relay is not None:
                    yield self.env.timeout(self._random_backoff())
                    self.sensors["relayed"] = True
                    frame = build_frame(self.node_id, self.seq, self.clock_drift,
                                        self.urgency, self.sensors, "OURS")
                    yield from self.network.transmit(self, frame, relayed=True, via=relay)
                    return
            # Low urgency dead zone: sleep
            self.sleeping = True
            self.network.emit_event({
                "type": "node_sleep",
                "node_id": self.node_id,
                "urgency": round(self.urgency, 3),
                "t": self.env.now,
            })
            yield self.env.timeout(self.SENSE_INTERVAL)
            self.sleeping = False
            return

        # Good signal path
        yield self.env.timeout(self._random_backoff())
        frame = build_frame(self.node_id, self.seq, self.clock_drift,
                            self.urgency, self.sensors, "OURS")
        yield from self.network.transmit(self, frame, relayed=False, via=None)

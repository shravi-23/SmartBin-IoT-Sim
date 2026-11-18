"""
experiments.py – Run reproducible batch experiments and return statistics.

Three experiments (30 runs each, mean ± std):
  1. Delivery rate: OLD vs OURS across congestion levels (node count 20-80).
  2. Critical-alert delivery: OLD vs OURS when a methane spike is active.
  3. Average alert delay: OLD vs OURS as dead-zone count increases.
"""

import numpy as np
import simpy
from sim.network import Network
from sim.node import BinNode


def _single_run(seed: int, mode: str, n_nodes: int, n_dead: int,
                spike: bool, sim_duration: float = 600.0) -> dict:
    """
    Run one simulation trial and return KPIs.

    Parameters
    ----------
    seed         : int   – random seed for reproducibility
    mode         : str   – "OLD" or "OURS"
    n_nodes      : int   – number of bin nodes
    n_dead       : int   – how many are in dead zones
    spike        : bool  – whether to trigger a methane spike at t=100 s
    sim_duration : float – simulated seconds to run

    Returns
    -------
    dict with delivery_rate, critical_delivery_rate, avg_delay_ms
    """
    rng = np.random.default_rng(seed)
    events: list[dict] = []

    def collect(ev):
        events.append(ev)

    env = simpy.Environment()
    net = Network(env, mode, collect)

    # Place nodes randomly
    positions = rng.uniform(0, 1000, size=(n_nodes, 2))
    dead_ids = set(rng.choice(n_nodes, size=n_dead, replace=False).tolist())

    nodes = []
    for i in range(n_nodes):
        node_rng = np.random.default_rng(seed + i * 100)
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
    net.dead_node_ids = dead_ids

    # Trigger spike at t=100 if requested
    if spike:
        def spike_proc():
            yield env.timeout(100.0)
            net.trigger_spike(spike_size=8)
        env.process(spike_proc())

    env.run(until=sim_duration)
    return net.get_kpi_snapshot()


def run_experiments(n_runs: int = 30) -> dict:
    """
    Execute all three experiments and return mean ± std for each metric.

    Returns a dict suitable for direct JSON serialisation.
    """
    print(f"[experiments] Starting {n_runs} runs × 3 experiments …")

    # ── Experiment 1: Delivery rate vs node count ──────────────────────────
    exp1 = {"label": "Delivery Rate vs Node Count",
            "caption": ("As more bins are added, LoRa collisions increase. "
                        "Our urgency-aware backoff keeps delivery high."),
            "x_label": "Number of Nodes",
            "x": [], "old_mean": [], "old_std": [], "ours_mean": [], "ours_std": []}

    for n_nodes in [20, 35, 50, 65, 80]:
        old_vals, ours_vals = [], []
        for run in range(n_runs):
            old_vals.append(_single_run(run, "OLD",  n_nodes, 15, False)["delivery_rate"])
            ours_vals.append(_single_run(run, "OURS", n_nodes, 15, False)["delivery_rate"])
        exp1["x"].append(n_nodes)
        exp1["old_mean"].append(round(float(np.mean(old_vals)), 2))
        exp1["old_std"].append(round(float(np.std(old_vals)), 2))
        exp1["ours_mean"].append(round(float(np.mean(ours_vals)), 2))
        exp1["ours_std"].append(round(float(np.std(ours_vals)), 2))

    print("[experiments] Experiment 1 done.")

    # ── Experiment 2: Critical alert delivery during spike ─────────────────
    exp2 = {"label": "Critical Alert Delivery During Methane Spike",
            "caption": ("When gas is detected, OLD bins lose half their alerts "
                        "to collisions. Ours uses shorter backoffs and relays."),
            "x_label": "Run Index",
            "x": list(range(1, n_runs + 1)),
            "old": [], "ours": []}

    for run in range(n_runs):
        exp2["old"].append(_single_run(run, "OLD",  50, 15, True)["critical_delivery_rate"])
        exp2["ours"].append(_single_run(run, "OURS", 50, 15, True)["critical_delivery_rate"])

    print("[experiments] Experiment 2 done.")

    # ── Experiment 3: Average delay vs dead-zone count ─────────────────────
    exp3 = {"label": "Average Alert Delay vs Dead-Zone Count",
            "caption": ("Dead-zone bins relay through neighbours (OURS) "
                        "instead of failing silently. Average delay stays low."),
            "x_label": "Dead-Zone Nodes",
            "x": [], "old_mean": [], "old_std": [], "ours_mean": [], "ours_std": []}

    for n_dead in [5, 10, 15, 20, 25]:
        old_vals, ours_vals = [], []
        for run in range(n_runs):
            old_vals.append(_single_run(run, "OLD",  50, n_dead, False)["avg_delay_ms"])
            ours_vals.append(_single_run(run, "OURS", 50, n_dead, False)["avg_delay_ms"])
        exp3["x"].append(n_dead)
        exp3["old_mean"].append(round(float(np.mean(old_vals)), 2))
        exp3["old_std"].append(round(float(np.std(old_vals)), 2))
        exp3["ours_mean"].append(round(float(np.mean(ours_vals)), 2))
        exp3["ours_std"].append(round(float(np.std(ours_vals)), 2))

    print("[experiments] Experiment 3 done.")

    return {"exp1": exp1, "exp2": exp2, "exp3": exp3}

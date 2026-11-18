# SmartBin Sim: Urgency-Aware Smart Dustbin IoT Simulation & Live Dashboard

An end-to-end IoT network simulation and real-time visualization dashboard demonstrating **urgency-aware medium access (MAC)**, **cooperative relaying**, and **lightweight HMAC-SHA256 packet authentication** for smart city municipal waste management.

---

## 🌟 Key Features

1. **Urgency-Aware LoRa MAC Protocol (`OURS`)**:
   - Computes an Urgency Index $U \in [0, 1]$ based on sensor readings:
     $$U = \text{sigmoid}(0.40 \cdot \text{fill\_speed} + 0.45 \cdot \text{gas\_rise} + 0.15 \cdot \text{weight\_change})$$
   - Critical events ($U \ge 0.75$, e.g., methane leaks or fire) scale backoff windows dynamically:
     $$\text{Window} = \left\lfloor \frac{7}{U + 1} \right\rfloor$$
     allowing urgent packets to seize the radio channel faster.
   - Bins trapped in signal dead zones ($< -10\text{ dB}$) with $U \ge 0.75$ dynamically find non-dead neighbors within 300 meters and cooperative relay their alert with a 16-entry TTL-3 deduplication cache.
   - Non-urgent dead-zone bins ($U < 0.75$) save telemetry and enter low-power sleep, eliminating unnecessary radio collisions.

2. **Lightweight Cryptographic Security**:
   - 11-byte frame header with a 4-byte truncated HMAC-SHA256 tag calculated over:
     $$\text{Tag} = \text{HMAC-SHA256}(K, \text{NodeID} \parallel \text{Seq} \parallel \text{ClockDrift} \parallel U)[:4]$$
   - Monotonic sliding replay cache protects against unauthorized replay attacks.
   - Constant-time verification (`hmac.compare_digest`) guards against side-channel timing attacks.

3. **High-Performance Architecture**:
   - **Backend**: Python 3.10+, SimPy discrete-event simulation engine, FastAPI, WebSocket streaming (~10 Hz real-time event updates).
   - **Frontend**: React + Vite, Tailwind CSS, Recharts (time-series, bar, error-bar charts), Framer Motion animations, Lucide icons, responsive glassmorphism aesthetic.

---

## 📁 Repository Structure

```
IOT/
├── backend/
│   ├── main.py              # FastAPI server, WebSocket hub, REST endpoints
│   ├── requirements.txt     # Python dependencies (SimPy, FastAPI, uvicorn, etc.)
│   └── sim/
│       ├── __init__.py      # Sim package marker
│       ├── security.py      # HMAC-SHA256 tag creation and verification
│       ├── node.py          # BinNode agent, sensor modeling, backoff logic
│       ├── network.py       # LoRa physical/MAC channel, collision & gateway logic
│       └── experiments.py   # Automated Monte-Carlo batch experiments (30 runs each)
├── frontend/
│   ├── index.html           # HTML template with SEO tags & Google fonts
│   ├── package.json         # React 18, Vite, Tailwind, Recharts, Framer Motion
│   ├── vite.config.js       # Vite configuration with API & WebSocket proxies
│   ├── tailwind.config.js   # Tailwind theme extensions (colors, keyframes)
│   └── src/
│       ├── main.jsx         # React DOM mount point
│       ├── App.jsx          # Root application shell, tab router, state sync
│       ├── index.css        # Glassmorphism, glow effects, custom keyframes
│       ├── hooks/
│       │   └── useSimulation.js # WebSocket event pipeline & REST client hook
│       └── components/
│           ├── TopBar.jsx         # Header, simulation clock, mode switch, controls
│           ├── KPICards.jsx       # Real-time metrics with animated sparklines
│           ├── BinMap.jsx         # 1km² SVG canvas with animated packet flights
│           ├── AlertFeed.jsx      # Live event stream with severity badges
│           ├── ControlPanel.jsx   # Sliders & attack injection triggers
│           ├── SecurityPanel.jsx  # 11-byte frame visualizer & tamper demo
│           ├── CompareView.jsx    # Side-by-side OLD vs OURS comparison
│           ├── ExperimentsView.jsx# 3 Monte-Carlo benchmark charts with viva notes
│           ├── NodeDrawer.jsx     # Slide-out drawer for node telemetry & charts
│           └── AboutModal.jsx     # Mathematical formulas & viva study guide
└── README.md
```

---

## 🚀 Step-by-Step Run Instructions

### 1. Prerequisites
- **Python 3.10 or newer**
- **Node.js 18 or newer** (with `npm`)

---

### 2. Backend Setup & Run

Open a terminal and navigate to `backend/`:

```bash
cd /Users/shrav/Desktop/IOT/backend

# (Optional but recommended) Create and activate a virtual environment:
python3 -m venv venv
source venv/bin/activate

# Install required Python packages:
pip install -r requirements.txt

# Start the FastAPI server on port 8000:
uvicorn main:app --reload --port 8000
```

The backend server will start at:
- **REST API & Swagger docs**: `http://localhost:8000/docs`
- **WebSocket stream**: `ws://localhost:8000/ws`

---

### 3. Frontend Setup & Run

Open a second terminal and navigate to `frontend/`:

```bash
cd /Users/shrav/Desktop/IOT/frontend

# Install node dependencies:
npm install

# Start Vite development server:
npm run dev
```

Open your browser to:
👉 **`http://localhost:5173`**

Click the **Start** button in the top navigation bar to launch the live simulation!

---

## 📖 File-by-File & Function-by-Function Explanation (For Viva & Exams)

### Backend

#### 1. `backend/sim/security.py`
- **`make_tag(node_id, seq, clock_drift, urgency)`**:
  - Uses `struct.pack(">HHff", ...)` to serialize the bin ID, 16-bit sequence number, clock drift, and urgency float into binary format.
  - Computes `hmac.new(SECRET_KEY, payload, hashlib.sha256).digest()`.
  - Truncates and returns the first 4 bytes. This saves precious LoRa radio airtime while providing robust cryptographic integrity.
- **`verify_tag(node_id, seq, clock_drift, urgency, received_tag)`**:
  - Recalculates the expected 4-byte HMAC locally at the gateway.
  - Compares the received tag with `hmac.compare_digest()` to eliminate timing vulnerabilities.
- **`is_replay(node_id, seq)`**:
  - Checks if `(node_id, seq)` has already been seen in the current session. If seen, it returns `True` and flags a replay attack; otherwise, it registers it.
- **`reset_replay_cache()`**:
  - Clears the set of observed packets when resetting or restarting the simulation.

#### 2. `backend/sim/node.py`
- **`sigmoid(x)`**:
  - Standard logistic activation $1 / (1 + e^{-x})$ squashing linear inputs into the $[0, 1]$ interval.
- **`compute_urgency(fill_speed, gas_rise, weight_change)`**:
  - Calculates $U = \text{sigmoid}(0.40 \cdot \text{fill} + 0.45 \cdot \text{gas} + 0.15 \cdot \text{weight})$. Gas has the largest coefficient (0.45) because toxic methane and fires present an immediate safety hazard.
- **`build_frame(...)`**:
  - Formats the 11-byte header:
    - Byte 0: `0xAB` (magic sync byte)
    - Bytes 1-2: `node_id` (unsigned short)
    - Bytes 3-4: `seq` (sequence counter)
    - Bytes 5-8: `tag` (4-byte HMAC)
    - Bytes 9-10: `status` (bitmask: bit0=dead zone, bit1=relayed, bit2=critical)
    - Bytes 11+: Sensor telemetry payload (float readings for fill, gas, weight, temperature, and urgency).
- **`BinNode` Class**:
  - `read_sensors(methane_spike)`: Simulates real-world sensor fluctuations; when a methane spike hits, gas readings rise dramatically.
  - `_backoff_window()`: Implements adaptive backoff. In `OLD` mode, returns fixed `7`. In `OURS` mode, returns $\lfloor 7 / (U + 1) \rfloor$. High $U \implies$ smaller window $\implies$ higher transmission priority.
  - `run()`: The main SimPy generator loop executed periodically (every 60 simulated seconds).
  - `_old_transmit()`: Standard uncoordinated ALOHA direct uplink transmission.
  - `_ours_transmit()`: Urgency-aware logic. If in a dead zone:
    - If $U \ge 0.75$, queries the network for a neighbor relay within 300 meters and transmits via that proxy.
    - If $U < 0.75$, saves readings and sleeps to prevent unnecessary channel congestion.
    - If not in a dead zone, transmits directly with urgency-prioritized backoff.

#### 3. `backend/sim/network.py`
- **`Network` Class**:
  - Holds a `simpy.Resource(env, capacity=1)` representing the half-duplex shared LoRa radio channel.
  - `AIRTIME = 0.120` seconds: Standard transmission duration for typical LoRaWAN packets (SF7, 125 kHz bandwidth).
  - `find_relay(node)`: Geometric Euclidean search finding the closest active, non-dead-zone node within 300 meters.
  - `transmit(node, frame, relayed, via)`:
    - Attempts to acquire the shared radio channel.
    - **Collision Detection**: If another node attempts transmission during the 120 ms airtime window, both transmissions collide, and the packet is marked lost.
    - **Cryptographic Gate**: Inspects the 4-byte HMAC tag and replay register. If tampered or replayed, registers an `attack_caught` event.
    - Updates delivery rate, critical alert delivery rate, and average latency KPIs.
  - `trigger_spike(spike_size)`: Simulates a localized hazardous gas event affecting 5–10 adjacent nodes.
  - `get_kpi_snapshot()`: Returns real-time aggregate statistics for the UI.

#### 4. `backend/sim/experiments.py`
- **`run_experiments(n_runs=30)`**:
  - Executes 90 automated Monte-Carlo batch simulations across varying seeds.
  - **Experiment 1**: Evaluates overall packet delivery rate across node densities from 20 to 80 bins.
  - **Experiment 2**: Evaluates critical alert delivery rates during localized methane gas emergencies.
  - **Experiment 3**: Evaluates average alert latency as dead-zone node counts expand from 5 to 25.

#### 5. `backend/main.py`
- FastAPI server setup with CORS middleware.
- **WebSocket `/ws`**: Streams `node_states`, `packet_sent`, `packet_delivered`, `packet_collided`, `packet_rejected`, and KPI events at ~10 Hz.
- **REST Endpoints**:
  - `POST /start`: Starts/restarts the simulation in a background daemon thread.
  - `POST /pause`: Toggles simulation pause.
  - `POST /reset`: Halts simulation and clears network state.
  - `POST /spike`: Triggers a localized gas leak.
  - `POST /tamper`: Corrupts the next transmitted packet header byte to demonstrate HMAC integrity rejection.
  - `POST /replay`: Re-injects an old sequence number to demonstrate replay mitigation.
  - `GET /experiments`: Executes batch benchmark trials and returns JSON data.

---

### Frontend

- **`App.jsx`**: Coordinates global states (dark mode, active tab, selected node, KPI updates, simulation controls).
- **`useSimulation.js`**: Reusable React hook handling WebSocket reconnects, buffering up to 100 recent events, and providing clean REST mutation functions.
- **`TopBar.jsx`**: Header bar displaying simulated time clock, protocol mode toggles (`OLD`, `OURS`, `Compare`), run controls, and WebSocket status.
- **`KPICards.jsx`**: Cards showing animated counters and 20-point mini sparklines for delivery rate, critical alert delivery, average latency, relay hops, and attacks caught.
- **`BinMap.jsx`**: Scalable Vector Graphics (SVG) 1km × 1km map rendering nodes colored by urgency ($U < 0.45$: safe teal, $0.45 \le U < 0.75$: warning amber, $U \ge 0.75$: critical red), pulsing rings, dead-zone dashed borders, animated flying packet dots, and dynamic relay vectors.
- **`AlertFeed.jsx`**: Real-time sliding alert log with severity badges (`CRIT`, `WARN`, `SAFE`), transmission path indicators (direct vs relayed vs sleeping), and status chips (`Delivered`, `Collided`, `Bad Tag`, `Replay!`).
- **`ControlPanel.jsx`**: Sliders for node count, dead-zone proportion, spike size, and simulation speed, alongside interactive attack injection triggers.
- **`SecurityPanel.jsx`**: Visual breakdown of the 11-byte frame (`HDR`, `NODE-ID`, `SEQ`, `TAG`, `STATUS`), raw hex packet inspector, and HMAC rejection pipeline.
- **`CompareView.jsx`**: Side-by-side maps simultaneously contrasting baseline LoRaWAN (`OLD`) against urgency-aware adaptive relaying (`OURS`).
- **`ExperimentsView.jsx`**: Recharts graphs (line, bar, error-bar) for the 3 Monte-Carlo benchmark experiments with plain-language viva explanations.
- **`NodeDrawer.jsx`**: Slide-out inspection drawer detailing an individual dustbin's coordinates, fill speed, gas rise, weight change, temperature, and urgency trend history.
- **`AboutModal.jsx`**: Comprehensive modal summarizing the project's background, mathematical formulations, and engineering architecture.

---

## 🎯 Viva & Presentation Q&A Cheatsheet

1. **Q: Why not use standard LoRaWAN confirmed uplinks?**
   - *A*: LoRaWAN gateways have strict regional duty cycles (e.g., 1% in EU868) and can only transmit on one frequency at a time. If dozens of bins request ACKs during a crisis, the gateway becomes saturated, causing widespread downlink starvation. Our approach coordinates medium access client-side through dynamic urgency-aware backoff and cooperative relaying without requiring gateway ACKs.

2. **Q: Why does gas rise carry a 0.45 weight in the Urgency Index?**
   - *A*: Organic waste decomposes anaerobically into methane ($CH_4$), which is flammable at 5% concentration in air and highly explosive. A bin that is 90% full with normal waste is an operational inconvenience; a bin emitting gas or catching fire is an immediate public safety hazard.

3. **Q: How does the 4-byte HMAC prevent packet tampering?**
   - *A*: The bin signs the node ID, sequence number, clock drift, and urgency score with a shared secret key. If an adversary attempts to modify the urgency field or inject fake sensor data, the gateway recomputes the HMAC and drops the packet due to mismatched signatures.

4. **Q: How are relay storms prevented in OURS mode?**
   - *A*: Each node maintains a 16-entry deduplication cache of $(node\_id, seq)$ tuples with a Time-To-Live (TTL) of 3. If a node receives a packet it has already forwarded within the TTL window, it silently discards it, preventing infinite rebroadcast loops.

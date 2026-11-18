/**
 * ControlPanel.jsx – Real-time Simulation Parameters & Incident Injection:
 *  - Reactive sliders dynamically updating backend SimPy runtime parameters:
 *      * Nodes (15-80 bins) -> immediately updates network topology
 *      * Dead Zones (0-30 bins) -> dynamically adjusts signal shadows
 *      * Spike Cluster (3-15 bins) -> configures methane blast radius
 *      * Speed Multiplier (1x-30x) -> immediately speeds up or slows down SimPy clock
 *  - Real-time incident buttons (auto-starting simulation if needed):
 *      * "Trigger methane spike"
 *      * "Tamper with a packet"
 *      * "Replay a packet"
 */
import React, { useState, useRef } from 'react'
import { motion } from 'framer-motion'
import { Flame, ShieldAlert, Repeat, SlidersHorizontal, RefreshCw, Magnet } from 'lucide-react'

export default function ControlPanel({
  settings,
  setSettings,
  onApplySettings,
  onUpdateParams,
  onSpike,
  onTamper,
  onReplay,
  onMetalScan,
}) {
  const [toast, setToast] = useState('')
  const debounceTimerRef = useRef(null)

  const showToast = (msg) => {
    setToast(msg)
    setTimeout(() => setToast(''), 3000)
  }

  // Debounced parameter sync to backend
  const syncParams = (params, toastMsg) => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      if (onUpdateParams) {
        onUpdateParams(params)
      }
      if (toastMsg) showToast(toastMsg)
    }, 200)
  }

  const handleNodesChange = (val) => {
    const num = Number(val)
    const dead = Math.min(settings.n_dead, num)
    setSettings((prev) => ({ ...prev, n_nodes: num, n_dead: dead }))
    syncParams({ n_nodes: num, n_dead: dead }, `Reconfigured network to ${num} nodes`)
  }

  const handleDeadZonesChange = (val) => {
    const num = Number(val)
    setSettings((prev) => ({ ...prev, n_dead: num }))
    syncParams({ n_dead: num }, `Dead zones set to ${num} nodes`)
  }

  const handleSpikeSizeChange = (val) => {
    const num = Number(val)
    setSettings((prev) => ({ ...prev, spike_size: num }))
    syncParams({ spike_size: num }, `Spike cluster radius set to ${num} nodes`)
  }

  const handleSpeedChange = (val) => {
    const num = Number(val)
    setSettings((prev) => ({ ...prev, speed: num }))
    syncParams({ speed: num }, `Simulation speed set to ${num}x`)
  }

  const handleSpike = () => {
    onSpike(settings.spike_size)
    showToast(`Methane gas spike triggered on ${settings.spike_size} nodes!`)
  }

  const handleTamper = () => {
    onTamper(0)
    showToast('Injected 1-byte HMAC corrupt bit-flip into next transmission!')
  }

  const handleReplay = () => {
    onReplay(0)
    showToast('Injected duplicate sequence packet to test replay mitigation!')
  }

  const handleMetalScan = () => {
    if (onMetalScan) onMetalScan(5)
    showToast('Metal scan triggered on 5 random bins!')
  }

  const handleRestart = () => {
    onApplySettings()
    showToast(`Simulation restarted with ${settings.n_nodes} nodes at ${settings.speed}x speed!`)
  }

  return (
    <div className="glass rounded-2xl p-4 flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 border-b border-white/[0.08]">
        <div className="flex items-center gap-2">
          <SlidersHorizontal size={15} className="text-teal-400" />
          <h3 className="text-xs font-bold tracking-wide text-slate-200 uppercase">
            Simulation Parameters & Incident Injection
          </h3>
        </div>
        {toast && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-[11px] font-semibold text-teal-300 bg-teal-500/15 px-2.5 py-0.5 rounded-full border border-teal-500/30"
          >
            {toast}
          </motion.div>
        )}
      </div>

      {/* Sliders Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
        {/* Nodes */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">Nodes</span>
            <span className="font-mono font-bold text-teal-300">{settings.n_nodes}</span>
          </div>
          <input
            type="range"
            min={15}
            max={80}
            step={5}
            value={settings.n_nodes}
            onChange={(e) => handleNodesChange(e.target.value)}
            className="w-full accent-teal-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Dead Zones */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">Dead Zones</span>
            <span className="font-mono font-bold text-indigo-300">{settings.n_dead}</span>
          </div>
          <input
            type="range"
            min={0}
            max={Math.min(30, settings.n_nodes)}
            step={1}
            value={settings.n_dead}
            onChange={(e) => handleDeadZonesChange(e.target.value)}
            className="w-full accent-indigo-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Spike Size */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">Spike Cluster</span>
            <span className="font-mono font-bold text-amber-300">{settings.spike_size}</span>
          </div>
          <input
            type="range"
            min={3}
            max={15}
            step={1}
            value={settings.spike_size}
            onChange={(e) => handleSpikeSizeChange(e.target.value)}
            className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>

        {/* Speed */}
        <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col gap-2">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-400 font-medium">Speed Multiplier</span>
            <span className="font-mono font-bold text-purple-300">{settings.speed}x</span>
          </div>
          <input
            type="range"
            min={1}
            max={30}
            step={1}
            value={settings.speed}
            onChange={(e) => handleSpeedChange(e.target.value)}
            className="w-full accent-purple-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleSpike}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-semibold hover:bg-amber-500/25 transition-all glow-amber"
          >
            <Flame size={14} className="text-amber-400" />
            Trigger methane spike
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleTamper}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/25 transition-all glow-red"
          >
            <ShieldAlert size={14} className="text-rose-400" />
            Tamper with a packet
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleReplay}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-xs font-semibold hover:bg-indigo-500/25 transition-all"
          >
            <Repeat size={14} className="text-indigo-400" />
            Replay a packet
          </motion.button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={handleMetalScan}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-300 text-xs font-semibold hover:bg-purple-500/25 transition-all"
          >
            <Magnet size={14} className="text-purple-400" />
            Trigger metal scan
          </motion.button>
        </div>

        <button
          onClick={handleRestart}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-300 text-xs font-semibold hover:bg-white/[0.08] hover:text-white transition-all ml-auto"
        >
          <RefreshCw size={13} />
          Apply & Restart
        </button>
      </div>
    </div>
  )
}

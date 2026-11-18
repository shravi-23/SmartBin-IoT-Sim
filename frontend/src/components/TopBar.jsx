/**
 * TopBar.jsx – Slim top bar with sim clock, live connection dot, segmented mode switch,
 * simulation controls (Start, Pause, Reset), and theme toggle.
 */
import React from 'react'
import { motion } from 'framer-motion'
import { Play, Pause, RotateCcw, Sun, Moon, Clock } from 'lucide-react'

export default function TopBar({
  connected,
  mode,
  setMode,
  paused,
  setPaused,
  darkMode,
  setDarkMode,
  onStart,
  onReset,
  onPause,
  simTime,
}) {
  const formatTime = (s) => {
    const mins = Math.floor(s / 60)
    const secs = Math.floor(s % 60)
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }

  return (
    <header className="h-16 flex-shrink-0 bg-[#04091a]/80 backdrop-blur-xl border-b border-white/[0.08] px-6 flex items-center justify-between gap-4 sticky top-0 z-30">
      {/* Left: Connection Status & Sim Clock */}
      <div className="flex items-center gap-4">
        {/* Live connection dot */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
          <span
            className={`w-2 h-2 rounded-full ${
              connected ? 'bg-emerald-400 shadow-[0_0_8px_#34d399] animate-pulse' : 'bg-rose-500 shadow-[0_0_8px_#f43f5e]'
            }`}
          />
          <span className="text-xs font-medium text-slate-300">
            {connected ? 'Live WS' : 'Offline'}
          </span>
        </div>

        {/* Sim Clock */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
          <Clock size={13} className="text-teal-400" />
          <span className="text-xs text-slate-400 font-medium">SIM TIME</span>
          <span className="font-mono text-xs font-bold text-teal-300">
            {formatTime(simTime || 0)}
          </span>
        </div>
      </div>

      {/* Center: Mode Segmented Control (OLD | OURS | Compare) */}
      <div className="flex items-center p-1 rounded-xl bg-slate-900/80 border border-white/[0.08] shadow-inner">
        {['OLD', 'OURS', 'Compare'].map((m) => {
          const isSelected = mode === m
          return (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all relative ${
                isSelected
                  ? 'text-white bg-teal-500/20 border border-teal-500/40 glow-teal'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
              }`}
            >
              {m === 'OLD' ? 'OLD (Baseline)' : m === 'OURS' ? 'OURS (Urgency)' : 'Compare'}
            </button>
          )
        })}
      </div>

      {/* Right: Simulation Controls & Theme Toggle */}
      <div className="flex items-center gap-2.5">
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onStart}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-teal-500/20 text-teal-300 border border-teal-500/40 text-xs font-semibold hover:bg-teal-500/30 glow-teal transition-all"
        >
          <Play size={13} fill="currentColor" />
          Start
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={() => {
            setPaused((p) => !p)
            onPause()
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/15 text-amber-300 border border-amber-500/30 text-xs font-semibold hover:bg-amber-500/25 transition-all"
        >
          <Pause size={13} />
          {paused ? 'Resume' : 'Pause'}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] text-slate-300 border border-white/[0.08] text-xs font-semibold hover:bg-white/[0.08] hover:text-white transition-all"
        >
          <RotateCcw size={13} />
          Reset
        </motion.button>

        {/* Theme Toggle */}
        <button
          onClick={() => setDarkMode((d) => !d)}
          aria-label="Toggle Theme"
          className="p-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-slate-400 hover:text-slate-200 hover:bg-white/[0.08] transition-all ml-1"
        >
          {darkMode ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>
    </header>
  )
}

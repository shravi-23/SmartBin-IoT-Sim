/**
 * NodeDrawer.jsx – Slide-out inspection drawer for an individual dustbin node:
 *  - Node coordinates, sequence counter, dead-zone and sleep status
 *  - Urgency Index gauge and historical trend line chart
 *  - Sensor telemetry: Fill speed, Gas rise, Weight change, Temperature
 *  - Recent packet transmission log for this specific node
 */
import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Activity, Flame, Weight, Thermometer, Radio, Moon, Magnet } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

export default function NodeDrawer({ node, onClose, recentEvents = [] }) {
  if (!node) return null

  const nodeEvents = recentEvents.filter((e) => e.node_id === node.id).slice(0, 10)
  const sensors = node.sensors || {}
  const u = node.urgency ?? 0
  const isCritical = u >= 0.75
  const isWarn = u >= 0.45 && u < 0.75

  const historyData = (node.urgency_history || [u]).map((val, idx) => ({
    step: idx + 1,
    urgency: typeof val === 'number' ? val : Number(val) || 0,
  }))

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex justify-end"
      >
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 220 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md h-full bg-[#04091a]/95 border-l border-white/[0.08] p-6 flex flex-col gap-5 overflow-y-auto shadow-2xl text-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
            <div className="flex items-center gap-3">
              <div
                className={`w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-lg ${
                  isCritical
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 glow-red'
                    : isWarn
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 glow-amber'
                    : 'bg-teal-500/20 text-teal-300 border border-teal-500/40 glow-teal'
                }`}
              >
                #{node.id}
              </div>
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  Dustbin Node #{node.id}
                  {node.dead_zone && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                      Dead Zone
                    </span>
                  )}
                  {node.sleeping && (
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-300 border border-slate-500/30 flex items-center gap-1">
                      <Moon size={10} /> Sleeping
                    </span>
                  )}
                </h3>
                <p className="text-xs text-slate-400">
                  Coordinates: ({node.x}m, {node.y}m) • Seq #{node.seq ?? 0}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Urgency Gauge Card */}
          <div className="rounded-xl p-4 bg-white/[0.03] border border-white/[0.06] flex flex-col gap-2.5">
            <div className="flex justify-between items-center">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Activity size={14} className="text-teal-400" />
                Urgency Index (U)
              </span>
              <span
                className={`text-xs font-mono font-bold px-2.5 py-0.5 rounded-md ${
                  isCritical
                    ? 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    : isWarn
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                }`}
              >
                {u.toFixed(3)} • {isCritical ? 'CRITICAL' : isWarn ? 'WATCH' : 'NORMAL'}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full transition-all duration-500 rounded-full ${
                  isCritical ? 'bg-rose-500' : isWarn ? 'bg-amber-500' : 'bg-teal-400'
                }`}
                style={{ width: `${Math.min(100, Math.max(0, u * 100))}%` }}
              />
            </div>
            <span className="text-[11px] text-slate-400">
              Threshold for critical alert priority backoff and neighbor relaying: U ≥ 0.75
            </span>
          </div>

          {/* Sensor Telemetry Grid */}
          <div>
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2.5">
              Live Sensor Readings
            </h4>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                  <Activity size={13} className="text-teal-400" /> Fill Speed
                </div>
                <div className="text-base font-mono font-bold text-white">
                  {(sensors.fill_speed ?? 0).toFixed(2)}
                  <span className="text-xs text-slate-400 font-normal"> /s</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                  <Flame size={13} className="text-amber-400" /> Gas Rise
                </div>
                <div className="text-base font-mono font-bold text-white">
                  {(sensors.gas_rise ?? 0).toFixed(2)}
                  <span className="text-xs text-slate-400 font-normal"> ppm/s</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                  <Weight size={13} className="text-indigo-400" /> Weight Δ
                </div>
                <div className="text-base font-mono font-bold text-white">
                  {(sensors.weight_change ?? 0).toFixed(2)}
                  <span className="text-xs text-slate-400 font-normal"> kg/s</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                  <Thermometer size={13} className="text-rose-400" /> Temperature
                </div>
                <div className="text-base font-mono font-bold text-white">
                  {(sensors.temperature ?? 25).toFixed(1)}
                  <span className="text-xs text-slate-400 font-normal"> °C</span>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] col-span-2">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                  <Magnet size={13} className="text-purple-400" /> Metal Detector
                </div>
                <div className="text-base font-mono font-bold" style={{color: sensors.metal_detected ? '#a855f7' : 'inherit'}}>
                  {sensors.metal_detected ? '⚠ DETECTED' : '✓ Clear'}
                  <span className="text-xs text-slate-400 font-normal ml-2">{sensors.metal_detected ? 'Hazardous object found' : 'No metal hazard'}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Urgency Trend Chart */}
          <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06]">
            <h4 className="text-xs font-bold text-slate-400 mb-2">Urgency Trend (Recent Cycles)</h4>
            <div className="h-32 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={historyData}>
                  <XAxis dataKey="step" stroke="#64748b" fontSize={10} tickLine={false} />
                  <YAxis domain={[0, 1]} stroke="#64748b" fontSize={10} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#04091a',
                      borderColor: 'rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      fontSize: 11,
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="urgency"
                    stroke={isCritical ? '#ef4444' : '#2dd4bf'}
                    strokeWidth={2}
                    dot={{ r: 2 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Node Recent Packets */}
          <div className="flex-1 flex flex-col min-h-[140px]">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              Recent Activity Log
            </h4>
            <div className="flex-1 overflow-y-auto flex flex-col gap-1.5 pr-1 max-h-48">
              {nodeEvents.length === 0 ? (
                <p className="text-xs text-slate-400 italic p-2">
                  No transmissions logged for this node yet.
                </p>
              ) : (
                nodeEvents.map((ev, i) => (
                  <div
                    key={ev.id || i}
                    className="p-2.5 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs flex justify-between items-center"
                  >
                    <div>
                      <span className="font-mono text-teal-300 font-semibold">seq #{ev.seq}</span>
                      <span className="text-slate-300 ml-2">
                        {ev.type.replace('packet_', '')}
                        {ev.relayed ? ' (relayed)' : ''}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 font-mono">
                      t={Math.round(ev.t || 0)}s
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

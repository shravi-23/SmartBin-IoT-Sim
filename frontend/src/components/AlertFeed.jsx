/**
 * AlertFeed.jsx – Stable, high-precision Alert & Incident Feed:
 *  - Categorizes real network alerts (Critical hazards, Warnings, Relays, Collisions, Rejections, Sleep)
 *  - Includes a "Pause Stream" toggle so user can freeze and inspect cards without shifting
 *  - Rate-damped entrance with pure CSS hardware-accelerated transitions (no Framer Motion layout jitter)
 *  - Filter tabs: "All Alerts" | "Critical Only" | "Relayed / Blocked"
 */
import React, { useState, useMemo } from 'react'
import {
  ArrowUpRight,
  GitBranch,
  Moon,
  CheckCircle2,
  AlertTriangle,
  ShieldX,
  Zap,
  Pause,
  Play,
  Filter,
  Magnet,
} from 'lucide-react'

function getRouteIcon(ev) {
  if (ev.type === 'node_sleep') return <Moon size={13} className="text-slate-400" />
  if (ev.type === 'metal_detected' || ev.type === 'metal_scan') return <Magnet size={13} className="text-purple-400" />
  if (ev.relayed) return <GitBranch size={13} className="text-indigo-400" />
  return <ArrowUpRight size={13} className="text-teal-400" />
}

function getStatusBadge(ev) {
  const chip = 'flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide'
  switch (ev.type) {
    case 'packet_delivered':
      if (ev.urgency >= 0.75) {
        return (
          <span className={`${chip} bg-rose-500/20 text-rose-300 border border-rose-500/40`}>
            <Zap size={10} /> Critical Sent
          </span>
        )
      }
      return (
        <span className={`${chip} bg-emerald-500/15 text-emerald-300 border border-emerald-500/30`}>
          <CheckCircle2 size={10} /> Delivered
        </span>
      )
    case 'packet_collided':
      return (
        <span className={`${chip} bg-amber-500/15 text-amber-300 border border-amber-500/30`}>
          <AlertTriangle size={10} /> Collided
        </span>
      )
    case 'packet_rejected':
      return (
        <span className={`${chip} bg-rose-500/20 text-rose-300 border border-rose-500/40 font-mono font-bold`}>
          <ShieldX size={10} /> {ev.reason === 'replay' ? 'Replay Blocked' : 'Bad Tag Blocked'}
        </span>
      )
    case 'node_sleep':
      return (
        <span className={`${chip} bg-slate-500/15 text-slate-300 border border-slate-500/30`}>
          <Moon size={10} /> Saved
        </span>
      )
    case 'spike_start':
      return (
        <span className={`${chip} bg-orange-500/20 text-orange-300 border border-orange-500/40`}>
          <Zap size={10} /> Spike Event
        </span>
      )
    case 'metal_detected':
      return (
        <span className={`${chip} bg-purple-500/20 text-purple-300 border border-purple-500/40`}>
          <Magnet size={10} /> Metal Detected
        </span>
      )
    case 'metal_scan':
      return (
        <span className={`${chip} bg-purple-500/20 text-purple-300 border border-purple-500/40`}>
          <Magnet size={10} /> Metal Scan
        </span>
      )
    default:
      return null
  }
}

function getSeverityBadge(u) {
  if (u === undefined || u === null) return null
  if (u >= 0.75) {
    return (
      <span className="px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[9px] font-bold tracking-wider">
        CRIT
      </span>
    )
  }
  if (u >= 0.45) {
    return (
      <span className="px-1.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[9px] font-bold tracking-wider">
        WATCH
      </span>
    )
  }
  return (
    <span className="px-1.5 py-0.5 rounded-md bg-teal-500/20 text-teal-300 border border-teal-500/30 text-[9px] font-bold tracking-wider">
      SAFE
    </span>
  )
}

const AlertCard = React.memo(function AlertCard({ ev }) {
  const isSpike = ev.type === 'spike_start'
  const isSleep = ev.type === 'node_sleep'
  const isRejected = ev.type === 'packet_rejected'
  const isMetal = ev.type === 'metal_detected' || ev.type === 'metal_scan'
  const isCrit = (ev.urgency ?? 0) >= 0.75

  const title = isSpike
    ? 'Hazard: Methane Gas Spike Surge'
    : isSleep
    ? `Bin #${ev.node_id} Entering Channel Sleep`
    : isRejected
    ? `Intrusion Detected: Bin #${ev.node_id}`
    : isMetal
    ? ev.type === 'metal_scan' ? `Metal Scan Triggered: ${(ev.nodes || []).length} Bins` : `Metal Detected: Bin #${ev.node_id}`
    : `Bin #${ev.node_id} • Seq ${ev.seq ?? 0}`

  return (
    <div
      className={`alert-item-enter p-3 rounded-xl border flex items-start justify-between gap-2.5 transition-all ${
        isRejected
          ? 'bg-rose-500/15 border-rose-500/40 shadow-[0_0_12px_rgba(244,63,94,0.15)]'
          : isCrit
          ? 'bg-rose-500/[0.08] border-rose-500/30'
          : isSpike
          ? 'bg-amber-500/[0.08] border-amber-500/30'
          : isMetal
          ? 'bg-purple-500/[0.08] border-purple-500/30'
          : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.06]'
      }`}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        <div className="p-1 rounded-lg bg-white/[0.05] mt-0.5 flex-shrink-0">
          {getRouteIcon(ev)}
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-slate-200 truncate">{title}</span>
            {getSeverityBadge(ev.urgency)}
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-400 font-mono">
            {ev.via != null && (
              <span className="text-indigo-300 font-semibold">relay #{ev.via}</span>
            )}
            {ev.t != null && (
              <span>t={Math.round(ev.t)}s</span>
            )}
            {ev.delay != null && (
              <span>{(ev.delay * 1000).toFixed(0)}ms</span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-shrink-0">{getStatusBadge(ev)}</div>
    </div>
  )
})

export default function AlertFeed({ events }) {
  const [isPaused, setIsPaused] = useState(false)
  const [filterMode, setFilterMode] = useState('all') // 'all' | 'critical' | 'relayed'

  // Filter out routine calm raw pings so feed only displays meaningful events and alerts
  const processedAlerts = useMemo(() => {
    return events.filter((e) => {
      if (e.type === 'packet_sent') return false // Skip raw in-flight pings

      if (filterMode === 'critical') {
        return (e.urgency ?? 0) >= 0.75 || e.type === 'spike_start' || e.type === 'packet_rejected'
      }

      if (filterMode === 'relayed') {
        return e.relayed || e.type === 'packet_rejected' || e.type === 'node_sleep'
      }

      // 'all': Show all completed deliveries, collisions, security alerts, and spikes
      return true
    }).slice(0, 30)
  }, [events, filterMode])

  // Frozen view when user pauses stream
  const [frozenAlerts, setFrozenAlerts] = useState([])

  const handleTogglePause = () => {
    if (!isPaused) {
      setFrozenAlerts(processedAlerts)
      setIsPaused(true)
    } else {
      setIsPaused(false)
    }
  }

  const activeAlerts = isPaused ? frozenAlerts : processedAlerts

  return (
    <div className="glass rounded-2xl p-4 flex flex-col h-full select-none">
      {/* Header */}
      <div className="flex items-center justify-between pb-3 border-b border-white/[0.08] mb-2.5">
        <div className="flex items-center gap-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isPaused ? 'bg-amber-400' : 'bg-teal-400 animate-pulse'
            }`}
          />
          <h3 className="text-xs font-bold tracking-wide text-slate-200 uppercase">
            Live Alert Stream
          </h3>
        </div>

        {/* Stream Controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleTogglePause}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
              isPaused
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-white/[0.04] text-slate-400 border-white/[0.08] hover:text-white'
            }`}
          >
            {isPaused ? <Play size={10} fill="currentColor" /> : <Pause size={10} />}
            {isPaused ? 'Resume' : 'Freeze'}
          </button>
          <span className="text-[11px] font-mono text-slate-400">
            {activeAlerts.length}
          </span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-1 mb-3 p-1 rounded-lg bg-black/30 border border-white/[0.05] text-[10px]">
        {[
          { id: 'all', label: 'All Incidents' },
          { id: 'critical', label: 'Critical Only' },
          { id: 'relayed', label: 'Relayed / Blocked' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterMode(tab.id)}
            className={`flex-1 py-1 rounded-md font-medium transition-all ${
              filterMode === tab.id
                ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* List Container */}
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 pr-1 max-h-[500px]">
        {activeAlerts.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-slate-400 gap-2">
            <span className="text-xs font-medium">Awaiting network incidents...</span>
            <span className="text-[10px]">Start simulation or trigger a spike</span>
          </div>
        ) : (
          activeAlerts.map((ev) => <AlertCard key={ev.id} ev={ev} />)
        )}
      </div>
    </div>
  )
}

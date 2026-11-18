/**
 * SecurityPanel.jsx – Explains and visualizes the 11-byte radio frame & HMAC authentication:
 *  - 11-byte Header layout broken into colored blocks:
 *      [HDR 1B] [NODE-ID 2B] [SEQ 2B] [AUTH-TAG 4B] [STATUS 2B] + [PAYLOAD ~20B]
 *  - 4-Byte Tag Highlighted with glow and computation logic
 *  - Interactive Animation of a tampered packet or replayed packet being rejected by Gateway
 */
import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShieldCheck,
  ShieldAlert,
  Key,
  Lock,
  CheckCircle2,
  Cpu,
  Layers,
  ArrowRight,
} from 'lucide-react'

export default function SecurityPanel({ recentEvents = [] }) {
  const [activeTab, setActiveTab] = useState('structure') // 'structure' | 'test'

  const latestRejection = recentEvents.find((e) => e.type === 'packet_rejected')
  const latestDelivered = recentEvents.find((e) => e.type === 'packet_delivered')

  const sampleHex =
    latestRejection?.frame_hex ||
    latestDelivered?.frame_hex ||
    'ab000c0012e841f39a00043f8000003e400000'

  const headerFields = [
    {
      name: 'HDR',
      bytes: '1 Byte',
      hex: '0xAB',
      desc: 'Magic Protocol Sync Identifier',
      color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
      badge: 'Fixed 0xAB',
    },
    {
      name: 'NODE-ID',
      bytes: '2 Bytes',
      hex: '0x000C',
      desc: 'Originating Dustbin Identifier',
      color: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
      badge: 'uint16 (0-65535)',
    },
    {
      name: 'SEQ',
      bytes: '2 Bytes',
      hex: '0x0012',
      desc: 'Monotonic Sequence Number',
      color: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/35',
      badge: 'Replay Protection',
    },
    {
      name: 'AUTH-TAG',
      bytes: '4 Bytes',
      hex: '0xE841F39A',
      desc: 'Truncated HMAC-SHA256 Signature',
      color: 'bg-purple-500/25 text-purple-200 border-purple-500/50 glow-teal shadow-[0_0_15px_rgba(168,85,247,0.3)]',
      badge: 'HMAC(Key, ID||Seq||Drift||U)[:4]',
      highlight: true,
    },
    {
      name: 'STATUS',
      bytes: '2 Bytes',
      hex: '0x0004',
      desc: 'Bitmask (Dead-zone, Relayed, Crit)',
      color: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
      badge: 'Flags: Bit0-2',
    },
  ]

  return (
    <div className="glass rounded-2xl p-6 flex flex-col gap-6">
      {/* Title */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-white/[0.08]">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Lock size={18} className="text-teal-400" />
            11-Byte Frame Architecture & HMAC Authentication
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Compact cryptographic signature defending against urgent-status forgery, sensor payload tampering, and replay bursts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1 rounded-xl bg-purple-500/15 text-purple-300 border border-purple-500/30 font-mono font-medium">
            HMAC-SHA256 (Truncated 4B)
          </span>
        </div>
      </div>

      {/* Frame Visualizer Blocks */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
            <Cpu size={14} className="text-teal-400" />
            11-Byte Binary Header + Telemetry Payload
          </h3>
          <span className="text-[11px] font-mono text-slate-400">Total Frame: 31–35 Bytes</span>
        </div>

        {/* Visual Blocks */}
        <div className="flex flex-wrap items-center gap-2.5 p-4 rounded-xl bg-slate-950/80 border border-white/[0.08] shadow-inner">
          {headerFields.map((field) => (
            <motion.div
              key={field.name}
              whileHover={{ scale: 1.03 }}
              className={`flex-1 min-w-[100px] flex flex-col items-center justify-center p-3 rounded-xl border text-center relative transition-all ${
                field.color
              }`}
            >
              {field.highlight && (
                <span className="absolute -top-2.5 px-2 py-0.5 rounded-full bg-purple-500 text-white font-mono text-[9px] font-bold shadow-md">
                  KEY SECURITY TAG
                </span>
              )}
              <span className="font-mono text-xs font-bold tracking-wider">{field.name}</span>
              <span className="text-[10px] font-mono opacity-80 mt-0.5">{field.bytes}</span>
              <span className="text-[10px] font-mono font-semibold text-slate-200 mt-1">
                {field.hex}
              </span>
            </motion.div>
          ))}

          {/* Payload block */}
          <div className="flex-1 min-w-[120px] flex flex-col items-center justify-center p-3 rounded-xl border border-white/[0.1] bg-white/[0.03] text-slate-300 text-center">
            <span className="font-mono text-xs font-bold tracking-wider">SENSOR PAYLOAD</span>
            <span className="text-[10px] font-mono opacity-70 mt-0.5">16–20 Bytes</span>
            <span className="text-[10px] text-slate-400 mt-1">fill, gas, wt, temp, U</span>
          </div>
        </div>
      </div>

      {/* Detailed Field Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Verification Architecture */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col gap-3">
          <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wide">
            <ShieldCheck size={14} className="text-teal-400" />
            Gateway Verification Pipeline
          </h4>
          <div className="space-y-2.5 text-xs font-mono">
            <div className="p-3 rounded-xl bg-slate-950/80 border border-white/[0.06] flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Check 1: Replay Filter</span>
              <span className="text-slate-300">if (node_id, seq) in seen_cache:</span>
              <span className="text-rose-400 pl-4 font-semibold">→ REJECT (Replay Attack)</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-950/80 border border-white/[0.06] flex flex-col gap-1">
              <span className="text-[10px] font-bold text-slate-400 uppercase">Check 2: Constant-Time HMAC</span>
              <span className="text-slate-300">expected = HMAC_SHA256(Key, ID || Seq || Drift || U)[:4]</span>
              <span className="text-slate-300">if not hmac.compare_digest(expected, tag):</span>
              <span className="text-rose-400 pl-4 font-semibold">→ REJECT (Bit Tampering / Bad Tag)</span>
            </div>
          </div>
        </div>

        {/* Live Attack Observation Showcase */}
        <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5 uppercase tracking-wide">
              <Key size={14} className="text-purple-400" />
              Latest Radio Frame Hex Inspector
            </h4>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-white/[0.06] text-slate-400">
              PHYSICAL LAYER
            </span>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-white/[0.06] font-mono text-xs text-purple-300 break-all leading-relaxed">
            {sampleHex}
          </div>

          {/* Real-time Incident Box */}
          {latestRejection ? (
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/35 flex items-start gap-3"
            >
              <ShieldAlert size={18} className="text-rose-400 flex-shrink-0 mt-0.5 animate-bounce" />
              <div className="text-xs flex flex-col gap-0.5">
                <span className="font-bold text-rose-300">Intrusion Caught & Blocked</span>
                <p className="text-[11px] text-slate-300">
                  Node #{latestRejection.node_id} transmitted an unauthorized frame with reason:{' '}
                  <span className="font-mono text-rose-300 font-bold bg-rose-500/20 px-1.5 py-0.5 rounded">
                    {latestRejection.reason}
                  </span>
                  . The gateway dropped the packet immediately.
                </p>
              </div>
            </motion.div>
          ) : (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-start gap-3">
              <CheckCircle2 size={18} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs flex flex-col gap-0.5">
                <span className="font-bold text-emerald-300">Channel Integrity Validated</span>
                <p className="text-[11px] text-slate-300">
                  Transmissions arriving with verified 4-byte HMAC credentials and monotonic sequence counters.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Sidebar.jsx – Fixed left sidebar navigation.
 * Contains:
 *  - App branding with glowing icon
 *  - Primary navigation tabs (Live Simulation, Compare Mode, Batch Experiments, Security Inspector)
 *  - Network protocol indicator badge
 */
import React from 'react'
import { motion } from 'framer-motion'
import { Radio, Layers, FlaskConical, ShieldCheck, Cpu } from 'lucide-react'

export default function Sidebar({ activeTab, setActiveTab }) {
  const tabs = [
    { id: 'simulation', label: 'Live Simulation', icon: Radio, desc: 'Real-time LoRa Grid' },
    { id: 'compare', label: 'Compare Mode', icon: Layers, desc: 'OLD vs OURS MAC' },
    { id: 'experiments', label: 'Batch Experiments', icon: FlaskConical, desc: 'Monte-Carlo Benchmark' },
    { id: 'security', label: 'Security Inspector', icon: ShieldCheck, desc: 'HMAC & Frame Audit' },
  ]

  return (
    <aside className="w-64 flex-shrink-0 h-screen sticky top-0 bg-[#04091a]/90 backdrop-blur-xl border-r border-white/[0.08] p-5 flex flex-col justify-between z-40">
      <div className="flex flex-col gap-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-teal-500/20 to-sky-500/30 border border-teal-500/40 flex items-center justify-center glow-teal flex-shrink-0">
            <span className="text-xl">🗑️</span>
          </div>
          <div className="flex flex-col">
            <h1 className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              SmartBin Sim
              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
            </h1>
            <p className="text-[11px] font-medium text-slate-400">Urgency-Aware IoT</p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex flex-col gap-1.5">
          <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 px-3 mb-1">
            Navigation
          </span>
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all relative ${
                  isActive
                    ? 'bg-teal-500/15 text-white border border-teal-500/30 glow-teal font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className={`p-1.5 rounded-lg ${
                    isActive ? 'bg-teal-500/20 text-teal-300' : 'text-slate-400'
                  }`}
                >
                  <Icon size={18} />
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs truncate">{tab.label}</span>
                  <span className="text-[10px] text-slate-400 font-normal truncate">
                    {tab.desc}
                  </span>
                </div>
                {isActive && (
                  <motion.div
                    layoutId="activeTabIndicator"
                    className="absolute right-2 w-1.5 h-5 rounded-full bg-teal-400"
                  />
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Protocol Badge Footer */}
      <div className="p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center gap-2.5">
        <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
          <Cpu size={16} />
        </div>
        <div className="flex flex-col">
          <span className="text-[11px] font-semibold text-slate-300">LoRa 868 MHz PHY</span>
          <span className="text-[10px] text-slate-400 font-mono">120ms Airtime • SF7</span>
        </div>
      </div>
    </aside>
  )
}

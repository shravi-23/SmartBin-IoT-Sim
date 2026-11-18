/**
 * App.jsx – Main Application Shell for SmartBin Urgency-Aware IoT Dashboard.
 * Layout:
 *  - Fixed Left Sidebar (SmartBin Sim, 4 Tab Icons with labels, Active Tab Glow)
 *  - Slim Top Bar (Live dot, Sim Clock, Segmented Mode Switch, Start/Pause/Reset, Theme Toggle)
 *  - Main Content Area (Max-w-screen-2xl, responsive padding, ambient teal glow)
 *  - Single-row 5-card KPI Bar
 *  - Tab Views: Live Simulation, Compare Mode, Batch Experiments, Security Inspector
 *  - Node Drawer slide-out
 */
import React, { useState, useEffect } from 'react'
import { useSimulation } from './hooks/useSimulation'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import KPICards from './components/KPICards'
import BinMap from './components/BinMap'
import AlertFeed from './components/AlertFeed'
import ControlPanel from './components/ControlPanel'
import SecurityPanel from './components/SecurityPanel'
import CompareView from './components/CompareView'
import ExperimentsView from './components/ExperimentsView'
import NodeDrawer from './components/NodeDrawer'

export default function App() {
  const { nodes, events, kpi, connected, simTime, actions } = useSimulation()

  // App & Theme states
  const [darkMode, setDarkMode] = useState(false)
  const [mode, setMode] = useState('OURS') // 'OLD' | 'OURS' | 'Compare'
  const [activeTab, setActiveTab] = useState('simulation') // 'simulation' | 'compare' | 'experiments' | 'security'
  const [paused, setPaused] = useState(false)
  const [selectedNode, setSelectedNode] = useState(null)

  // Simulation settings
  const [settings, setSettings] = useState({
    n_nodes: 50,
    n_dead: 15,
    spike_size: 8,
    speed: 10,
    seed: 42,
  })

  // Synchronize mode switch with active tabs and backend
  useEffect(() => {
    if (mode === 'Compare') {
      setActiveTab('compare')
    } else {
      if (activeTab === 'compare') setActiveTab('simulation')
      actions.start({ ...settings, mode })
    }
  }, [mode])

  // Synchronize activeTab changes back to mode if Compare tab is clicked
  useEffect(() => {
    if (activeTab === 'compare' && mode !== 'Compare') {
      setMode('Compare')
    } else if (activeTab !== 'compare' && mode === 'Compare') {
      setMode('OURS')
    }
  }, [activeTab])

  // Toggle Dark/Light class on document root
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.remove('light')
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
      document.documentElement.classList.add('light')
    }
  }, [darkMode])

  // Controls
  const handleStart = () => {
    setPaused(false)
    actions.start({ ...settings, mode: mode === 'Compare' ? 'OURS' : mode })
  }

  const handleApplySettings = () => {
    setPaused(false)
    actions.start({ ...settings, mode: mode === 'Compare' ? 'OURS' : mode })
  }

  return (
    <div className={`min-h-screen flex relative overflow-x-hidden font-sans ${darkMode ? 'bg-[#020617] text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      {/* Ambient soft teal radial glow */}
      <div className="fixed top-0 right-0 w-[550px] h-[550px] bg-teal-500/[0.05] dark:bg-teal-500/[0.07] rounded-full blur-[140px] pointer-events-none -z-0" />
      <div className="fixed bottom-0 left-64 w-[400px] h-[400px] bg-indigo-500/[0.03] dark:bg-indigo-500/[0.04] rounded-full blur-[120px] pointer-events-none -z-0" />

      {/* Fixed Left Sidebar */}
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} />

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0 z-10">
        {/* Slim Top Bar */}
        <TopBar
          connected={connected}
          mode={mode}
          setMode={setMode}
          paused={paused}
          setPaused={setPaused}
          darkMode={darkMode}
          setDarkMode={setDarkMode}
          onStart={handleStart}
          onReset={actions.reset}
          onPause={actions.pause}
          simTime={simTime}
        />

        {/* Dashboard Content Container */}
        <main className="flex-1 max-w-screen-2xl w-full mx-auto p-5 md:p-6 flex flex-col gap-6">
          {/* KPI Row (5 Cards in 1 Row on desktop) */}
          <KPICards kpi={kpi} />

          {/* Tab 1: Live Simulation */}
          {activeTab === 'simulation' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              {/* Left 8 Cols (approx 2/3 width): Map & Controls */}
              <div className="lg:col-span-8 flex flex-col gap-5">
                <BinMap
                  nodes={nodes}
                  events={events}
                  onNodeClick={(node) => setSelectedNode(node)}
                  title={`1 km² Urban Grid — ${nodes.length} Bins (${nodes.filter((n) => n.dead_zone).length} in Dead Zones)`}
                />
                <ControlPanel
                  settings={settings}
                  setSettings={setSettings}
                  onApplySettings={handleApplySettings}
                  onUpdateParams={actions.updateParams}
                  onSpike={actions.spike}
                  onTamper={actions.tamper}
                  onReplay={actions.replay}
                  onMetalScan={actions.metalScan}
                />
              </div>

              {/* Right 4 Cols (approx 1/3 width): Alerts Feed */}
              <div className="lg:col-span-4 flex flex-col gap-5">
                <div className="h-[620px]">
                  <AlertFeed events={events} />
                </div>
              </div>
            </div>
          )}

          {/* Tab 2: Compare Mode */}
          {activeTab === 'compare' && (
            <CompareView
              nodes={nodes}
              events={events}
              kpi={kpi}
              onNodeClick={(node) => setSelectedNode(node)}
            />
          )}

          {/* Tab 3: Batch Experiments */}
          {activeTab === 'experiments' && (
            <ExperimentsView onRunExperiments={actions.getExperiments} />
          )}

          {/* Tab 4: Security Inspector */}
          {activeTab === 'security' && (
            <SecurityPanel recentEvents={events} />
          )}
        </main>
      </div>

      {/* Slide-out Node Detail Drawer */}
      <NodeDrawer
        node={selectedNode}
        onClose={() => setSelectedNode(null)}
        recentEvents={events}
      />
    </div>
  )
}

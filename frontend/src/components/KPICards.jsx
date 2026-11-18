/**
 * KPICards.jsx – Single-row 5-metric dashboard row:
 *  - Delivered %
 *  - Critical Delivered %
 *  - Avg Delay (ms)
 *  - Relay Hops (pkts)
 *  - Attacks Caught
 * Each card includes an icon in a colored circle, animated counter, label, and sparkline.
 */
import React, { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { PackageCheck, Flame, Clock, Radio, ShieldAlert, Magnet } from 'lucide-react'
import { LineChart, Line, ResponsiveContainer } from 'recharts'

function useAnimatedNumber(target, duration = 400) {
  const [current, setCurrent] = useState(target)
  const animRef = useRef()

  useEffect(() => {
    const startVal = current
    const startTime = performance.now()

    const step = (now) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3)
      setCurrent(startVal + (target - startVal) * ease)
      if (progress < 1) animRef.current = requestAnimationFrame(step)
    }

    animRef.current = requestAnimationFrame(step)
    return () => cancelAnimationFrame(animRef.current)
  }, [target])

  return current
}

function Sparkline({ data, stroke }) {
  if (!data || data.length < 2) {
    return <div className="h-7 w-full flex items-center justify-center text-[10px] text-slate-400">calibrating...</div>
  }
  const chartData = data.map((v, i) => ({ v, i }))
  return (
    <div className="h-7 w-full overflow-hidden">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData}>
          <Line
            type="monotone"
            dataKey="v"
            stroke={stroke}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, unit, color, sparkData, glowClass, iconBg }) {
  const num = parseFloat(value) || 0
  const animated = useAnimatedNumber(num)
  const isInteger = Number.isInteger(num)

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass rounded-2xl p-4 flex flex-col justify-between gap-2.5 relative overflow-hidden transition-all hover:border-white/20 ${glowClass}`}
    >
      {/* Top line: Icon and Label */}
      <div className="flex items-center gap-2.5">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
          <Icon size={16} style={{ color }} />
        </div>
        <span className="text-[11px] font-semibold tracking-wider uppercase text-slate-400 truncate">
          {label}
        </span>
      </div>

      {/* Metric Value */}
      <div className="flex items-baseline gap-1 mt-1">
        <span className="text-2xl font-bold font-mono tracking-tight" style={{color: 'inherit'}}>
          {isInteger ? Math.round(animated) : animated.toFixed(1)}
        </span>
        <span className="text-xs font-semibold text-slate-400">{unit}</span>
      </div>

      {/* Sparkline */}
      <Sparkline data={sparkData} stroke={color} />
    </motion.div>
  )
}

export default function KPICards({ kpi }) {
  const [history, setHistory] = useState({
    delivery: [],
    critical: [],
    delay: [],
    relay: [],
    attacks: [],
    metal: [],
  })

  useEffect(() => {
    if (!kpi || Object.keys(kpi).length === 0) return
    setHistory((prev) => ({
      delivery: [...prev.delivery, kpi.delivery_rate ?? 0].slice(-20),
      critical: [...prev.critical, kpi.critical_delivery_rate ?? 0].slice(-20),
      delay: [...prev.delay, kpi.avg_delay_ms ?? 0].slice(-20),
      relay: [...prev.relay, kpi.relay_count ?? 0].slice(-20),
      attacks: [...prev.attacks, kpi.attacks_caught ?? 0].slice(-20),
      metal: [...prev.metal, kpi.metal_alerts ?? 0].slice(-20),
    }))
  }, [kpi])

  const cards = [
    {
      icon: PackageCheck,
      label: 'Delivered',
      value: kpi?.delivery_rate ?? 0,
      unit: '%',
      color: '#2dd4bf',
      iconBg: 'bg-teal-500/15 text-teal-300 border border-teal-500/25',
      glowClass: 'hover:glow-teal',
      sparkData: history.delivery,
    },
    {
      icon: Flame,
      label: 'Critical Delivered',
      value: kpi?.critical_delivery_rate ?? 0,
      unit: '%',
      color: '#f59e0b',
      iconBg: 'bg-amber-500/15 text-amber-300 border border-amber-500/25',
      glowClass: 'hover:glow-amber',
      sparkData: history.critical,
    },
    {
      icon: Clock,
      label: 'Avg Delay',
      value: kpi?.avg_delay_ms ?? 0,
      unit: 'ms',
      color: '#818cf8',
      iconBg: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/25',
      glowClass: '',
      sparkData: history.delay,
    },
    {
      icon: Radio,
      label: 'Relay Hops',
      value: kpi?.relay_count ?? 0,
      unit: 'pkts',
      color: '#34d399',
      iconBg: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25',
      glowClass: '',
      sparkData: history.relay,
    },
    {
      icon: ShieldAlert,
      label: 'Attacks Caught',
      value: kpi?.attacks_caught ?? 0,
      unit: 'blocked',
      color: '#f43f5e',
      iconBg: 'bg-rose-500/15 text-rose-300 border border-rose-500/25',
      glowClass: 'hover:glow-red',
      sparkData: history.attacks,
    },
    {
      icon: Magnet,
      label: 'Metal Alerts',
      value: kpi?.metal_alerts ?? 0,
      unit: 'detections',
      color: '#a855f7',
      iconBg: 'bg-purple-500/15 text-purple-300 border border-purple-500/25',
      glowClass: 'hover:glow-purple',
      sparkData: history.metal,
    },
  ]

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((c) => (
        <MetricCard key={c.label} {...c} />
      ))}
    </div>
  )
}

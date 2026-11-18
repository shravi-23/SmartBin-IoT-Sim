/**
 * BinMap.jsx – High-definition SVG coverage map (1 km × 1 km physical space):
 *  - Gateway stationed at coordinate (500m, 500m)
 *  - 50 Dustbin nodes colored dynamically by urgency:
 *      * U < 0.45: Teal (Normal)
 *      * 0.45 <= U < 0.75: Amber (Watch)
 *      * U >= 0.75: Red (Critical hazard with pulsing wave rings)
 *  - Dead-zone nodes rendered with dashed outline rings
 *  - Smart-sleeping nodes dimmed to indicate channel conservation
 *  - Flying packet dots radiating towards the central gateway
 *  - Dashed relay hop vectors connecting dead-zone bins to neighbor relays
 *  - Fully clickable node targets that open the telemetry inspection drawer
 */
import React, { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Radio, ShieldAlert } from 'lucide-react'

const MAP_DIM = 500
const SCALE = MAP_DIM / 1000 // 1m = 0.5 SVG units
const GW_X = 500 * SCALE
const GW_Y = 500 * SCALE

function getUrgencyColor(u) {
  if (u >= 0.75) return '#ef4444' // Red Critical
  if (u >= 0.45) return '#f59e0b' // Amber Watch
  return '#2dd4bf'                 // Teal Safe
}

function getNodeIcon(n) {
  if (n.sensors?.metal_detected) return '⚙'
  return null
}

function PacketDot({ x, y, color, onDone }) {
  return (
    <motion.circle
      cx={x}
      cy={y}
      r={4.5}
      fill={color}
      initial={{ cx: x, cy: y, opacity: 1, scale: 1 }}
      animate={{ cx: GW_X, cy: GW_Y, opacity: 0.1, scale: 0.3 }}
      transition={{ duration: 0.85, ease: 'easeIn' }}
      onAnimationComplete={onDone}
      style={{ filter: `drop-shadow(0 0 6px ${color})` }}
    />
  )
}

function RelayLine({ x1, y1, x2, y2, onDone }) {
  return (
    <motion.line
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke="#818cf8"
      strokeWidth={1.8}
      strokeDasharray="4 3"
      initial={{ pathLength: 0, opacity: 0.9 }}
      animate={{ pathLength: 1, opacity: 0 }}
      transition={{ duration: 1.1, ease: 'easeOut' }}
      onAnimationComplete={onDone}
    />
  )
}

export default function BinMap({ nodes, events, onNodeClick, title }) {
  const [flyingPackets, setFlyingPackets] = useState([])
  const [relayHops, setRelayHops] = useState([])
  const nodeDict = useRef({})

  useEffect(() => {
    nodeDict.current = {}
    nodes.forEach((n) => {
      nodeDict.current[n.id] = n
    })
  }, [nodes])

  // Spawn visual particle animations on incoming packet events
  useEffect(() => {
    if (!events || events.length === 0) return
    const ev = events[0]
    if (!ev) return

    const src = nodeDict.current[ev.node_id]
    if (!src) return

    const particleId = `pkt-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`

    if (ev.type === 'packet_sent') {
      const color = getUrgencyColor(ev.urgency ?? 0)
      setFlyingPackets((prev) => [
        ...prev.slice(-8),
        { id: particleId, x: src.x * SCALE, y: src.y * SCALE, color },
      ])
    }

    if (ev.relayed && ev.via != null) {
      const relayNode = nodeDict.current[ev.via]
      if (relayNode) {
        const relayId = `rly-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
        setRelayHops((prev) => [
          ...prev.slice(-6),
          {
            id: relayId,
            x1: src.x * SCALE,
            y1: src.y * SCALE,
            x2: relayNode.x * SCALE,
            y2: relayNode.y * SCALE,
          },
        ])
      }
    }
  }, [events])

  return (
    <div className="glass rounded-2xl p-4 flex flex-col gap-3 relative overflow-hidden">
      {/* Map Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-teal-400 animate-pulse" />
          <h3 className="text-xs font-bold tracking-wide text-slate-200 uppercase">
            {title || 'LoRa Coverage Topology (1 km² Grid)'}
          </h3>
        </div>
        <div className="flex items-center gap-3 text-[11px] font-mono text-slate-400">
          <span>Center Gateway: (500m, 500m)</span>
          <span className="text-teal-400 font-bold">{nodes.length} Nodes</span>
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="w-full aspect-square max-h-[540px] rounded-xl overflow-hidden relative border border-white/[0.08] shadow-2xl">
        <svg
          viewBox={`0 0 ${MAP_DIM} ${MAP_DIM}`}
          className="w-full h-full select-none"
          style={{
            background: 'radial-gradient(circle at center, #071228 0%, #030712 100%)',
          }}
        >
          {/* Subtle Radar Concentric Rings from Gateway */}
          {[80, 160, 240, 320, 400].map((radius) => (
            <circle
              key={radius}
              cx={GW_X}
              cy={GW_Y}
              r={radius * SCALE}
              fill="none"
              stroke="rgba(45, 212, 191, 0.05)"
              strokeWidth={1}
            />
          ))}

          {/* Coordinate Grid lines */}
          {[100, 200, 300, 400].map((coord) => (
            <g key={coord}>
              <line
                x1={coord * SCALE}
                y1={0}
                x2={coord * SCALE}
                y2={MAP_DIM}
                stroke="rgba(255, 255, 255, 0.03)"
                strokeWidth={1}
              />
              <line
                x1={0}
                y1={coord * SCALE}
                x2={MAP_DIM}
                y2={coord * SCALE}
                stroke="rgba(255, 255, 255, 0.03)"
                strokeWidth={1}
              />
            </g>
          ))}

          {/* Relay lines */}
          <AnimatePresence>
            {relayHops.map((r) => (
              <RelayLine
                key={r.id}
                {...r}
                onDone={() => setRelayHops((prev) => prev.filter((x) => x.id !== r.id))}
              />
            ))}
          </AnimatePresence>

          {/* Nodes */}
          {nodes.map((n) => {
            const cx = n.x * SCALE
            const cy = n.y * SCALE
            const color = getUrgencyColor(n.urgency ?? 0)
            const isCritical = (n.urgency ?? 0) >= 0.75

            return (
              <g
                key={n.id}
                onClick={() => onNodeClick && onNodeClick(n)}
                className="cursor-pointer transition-transform hover:scale-125"
                style={{ transformOrigin: `${cx}px ${cy}px` }}
              >
                {/* Pulsing ring for critical nodes */}
                {isCritical && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={11}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.8}
                    opacity={0.8}
                    className="node-pulse"
                  />
                )}

                {/* Dashed outer ring for dead-zone nodes */}
                {n.dead_zone && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={8.5}
                    fill="none"
                    stroke={color}
                    strokeWidth={1.2}
                    strokeDasharray="2.5 2"
                    opacity={0.65}
                  />
                )}

                {/* Node center point */}
                <circle
                  cx={cx}
                  cy={cy}
                  r={5}
                  fill={color}
                  opacity={n.sleeping ? 0.25 : 0.9}
                  style={{ filter: `drop-shadow(0 0 ${isCritical ? 8 : 4}px ${color})` }}
                />

                {/* Node ID label */}
                <text
                  x={cx}
                  y={cy - 7}
                  textAnchor="middle"
                  fontSize="6.5"
                  fontWeight="600"
                  fill="rgba(255, 255, 255, 0.75)"
                >
                  {n.id}
                </text>

                {/* Metal detection indicator */}
                {n.sensors?.metal_detected && (
                  <>
                    <circle
                      cx={cx}
                      cy={cy}
                      r={9}
                      fill="none"
                      stroke="#a855f7"
                      strokeWidth={1.5}
                      opacity={0.9}
                      className="metal-pulse"
                    />
                    <text
                      x={cx + 7}
                      y={cy - 7}
                      fontSize="6"
                      fill="#a855f7"
                      fontWeight="bold"
                    >⚙</text>
                  </>
                )}
              </g>
            )
          })}

          {/* Flying packet particles */}
          <AnimatePresence>
            {flyingPackets.map((p) => (
              <PacketDot
                key={p.id}
                x={p.x}
                y={p.y}
                color={p.color}
                onDone={() =>
                  setFlyingPackets((prev) => prev.filter((x) => x.id !== p.id))
                }
              />
            ))}
          </AnimatePresence>

          {/* Central Gateway */}
          <g>
            <circle
              cx={GW_X}
              cy={GW_Y}
              r={16}
              fill="rgba(45, 212, 191, 0.12)"
              stroke="rgba(45, 212, 191, 0.7)"
              strokeWidth={1.8}
              style={{ filter: 'drop-shadow(0 0 12px rgba(45, 212, 191, 0.6))' }}
            />
            <circle
              cx={GW_X}
              cy={GW_Y}
              r={5}
              fill="#2dd4bf"
            />
            <text
              x={GW_X}
              y={GW_Y + 24}
              textAnchor="middle"
              fontSize="7"
              fontWeight="bold"
              fill="#2dd4bf"
            >
              GATEWAY
            </text>
          </g>

          {/* Clean Legend */}
          <g transform={`translate(10, ${MAP_DIM - 34})`}>
            {[
              ['#2dd4bf', 'Safe (U < 0.45)'],
              ['#f59e0b', 'Watch (0.45 ≤ U < 0.75)'],
              ['#ef4444', 'Critical (U ≥ 0.75)'],
            ].map(([c, label], idx) => (
              <g key={label} transform={`translate(${idx * 115}, 0)`}>
                <circle cx={5} cy={5} r={4} fill={c} />
                <text x={12} y={8.5} fontSize="7" fill="rgba(255, 255, 255, 0.7)">
                  {label}
                </text>
              </g>
            ))}
            <g transform="translate(355, 0)">
              <circle
                cx={5}
                cy={5}
                r={4.5}
                fill="none"
                stroke="rgba(255, 255, 255, 0.6)"
                strokeDasharray="2 1.5"
              />
              <text x={12} y={8.5} fontSize="7" fill="rgba(255, 255, 255, 0.7)">
                Dead Zone
              </text>
            </g>
            <g transform="translate(430, 0)">
              <circle cx={5} cy={5} r={4} fill="#a855f7" />
              <text x={12} y={8.5} fontSize="7" fill="rgba(255, 255, 255, 0.7)">Metal Det.</text>
            </g>
          </g>
        </svg>
      </div>
    </div>
  )
}

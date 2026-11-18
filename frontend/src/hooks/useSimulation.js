/**
 * useSimulation.js – Optimized, jitter-free WebSocket event hook.
 *
 * Performance fixes:
 *  - Throttled state flushing (100ms) to eliminate high-frequency UI jitter
 *  - simTime updated only with periodic snapshots, avoiding hundreds of re-renders per second
 *  - Guaranteed unique monotonic event IDs
 */

import { useState, useEffect, useRef, useCallback } from 'react'

const API = 'http://localhost:8000'
const WS_URL = 'ws://localhost:8000/ws'
const MAX_EVENTS = 50

let uniqueEventCounter = 0

export function useSimulation() {
  const [nodes, setNodes] = useState([])
  const [events, setEvents] = useState([])
  const [kpi, setKpi] = useState({})
  const [connected, setConnected] = useState(false)
  const [simTime, setSimTime] = useState(0)

  const wsRef = useRef(null)
  const reconnectTimer = useRef(null)
  const eventBufferRef = useRef([])
  const flushTimerRef = useRef(null)

  // Flush queued events in single unified batch at fixed intervals
  const flushQueue = useCallback(() => {
    if (eventBufferRef.current.length === 0) return
    const incoming = [...eventBufferRef.current]
    eventBufferRef.current = []

    setEvents((prev) => {
      // Prepend newest incoming events (newest on top)
      const merged = [...incoming, ...prev]
      return merged.slice(0, MAX_EVENTS)
    })
  }, [])

  const connect = useCallback(() => {
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return
    }

    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
    }

    ws.onclose = () => {
      setConnected(false)
      wsRef.current = null
      reconnectTimer.current = setTimeout(connect, 2000)
    }

    ws.onerror = () => {
      ws.close()
    }

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)

        if (event.type === 'node_states') {
          // Bulk topology and KPI update
          setNodes(event.nodes || [])
          if (event.kpi) setKpi(event.kpi)
          if (event.t !== undefined) setSimTime(event.t)
          return
        }

        // Discrete packet / network event
        uniqueEventCounter += 1
        const item = {
          ...event,
          id: `${event.type}-${event.node_id ?? 0}-${event.seq ?? 0}-${uniqueEventCounter}`,
        }

        eventBufferRef.current.unshift(item)

        // Throttle flush to 100ms
        if (!flushTimerRef.current) {
          flushTimerRef.current = setTimeout(() => {
            flushTimerRef.current = null
            flushQueue()
          }, 100)
        }
      } catch (err) {
        console.error('[WS] Error processing message:', err)
      }
    }
  }, [flushQueue])

  useEffect(() => {
    connect()
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current)
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
        wsRef.current = null
      }
    }
  }, [connect])

  const post = (path, body = {}) =>
    fetch(`${API}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch((err) => console.error(`[API] ${path} failed:`, err))

  const actions = {
    start: (settings) => {
      eventBufferRef.current = []
      setEvents([])
      setKpi({})
      setSimTime(0)
      post('/start', settings)
    },
    pause: () => post('/pause'),
    reset: () => {
      eventBufferRef.current = []
      setEvents([])
      setKpi({})
      setSimTime(0)
      post('/reset')
    },
    updateParams: (params) => post('/params', params),
    spike: (spike_size) => post('/spike', { spike_size }),
    tamper: (node_id = 0) => post('/tamper', { node_id }),
    replay: (node_id = 0) => post('/replay', { node_id }),
    metalScan: (scan_size = 5) => post('/metal_scan', { scan_size }),
    getExperiments: () => fetch(`${API}/experiments`).then((r) => r.json()),
  }

  return { nodes, events, kpi, connected, simTime, actions }
}

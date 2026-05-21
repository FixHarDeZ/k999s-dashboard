import { useEffect, useState, useRef, useCallback } from 'react'
import { X, Download, ChevronDown } from 'lucide-react'
import { podLogsWsUrl } from '@/lib/api'

interface LogViewerProps {
  namespace: string
  podName: string
  containers: string[]
  onClose: () => void
}

export function LogViewer({ namespace, podName, containers, onClose }: LogViewerProps) {
  const [container, setContainer] = useState(containers[0] ?? '')
  const [previous, setPrevious] = useState(false)
  const [tail, setTail] = useState<number>(0)
  const [lines, setLines] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  const connect = useCallback(() => {
    wsRef.current?.close()
    setLines([])
    setConnected(false)

    const ws = new WebSocket(podLogsWsUrl(namespace, podName, container, true, previous, tail || undefined))
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    ws.onmessage = (e) => {
      setLines((prev) => {
        const next = [...prev, e.data as string]
        return next.length > 5000 ? next.slice(-5000) : next
      })
      if (autoScrollRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' })
      }
    }
  }, [namespace, podName, container, previous, tail])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  const handleDownload = () => {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${podName}-${container}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '60%', minWidth: 480,
      background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
      zIndex: 50, display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        background: '#1e1b4b', color: '#c7d2fe', padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>
            {namespace}/{podName}
          </span>
          <span style={{ fontSize: 10, color: connected ? '#86efac' : '#fca5a5' }}>
            ● {connected ? 'streaming' : 'disconnected'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {containers.length > 1 && (
            <select
              value={container}
              onChange={(e) => setContainer(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.1)', color: '#c7d2fe', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}
            >
              {containers.map((c) => <option key={c} value={c} style={{ color: '#000' }}>{c}</option>)}
            </select>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={previous} onChange={(e) => setPrevious(e.target.checked)} />
            Previous
          </label>
          <select
            value={tail}
            onChange={(e) => setTail(Number(e.target.value))}
            style={{ background: 'rgba(255,255,255,0.1)', color: '#c7d2fe', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}
          >
            <option value={0} style={{ color: '#000' }}>All lines</option>
            <option value={100} style={{ color: '#000' }}>Last 100</option>
            <option value={200} style={{ color: '#000' }}>Last 200</option>
            <option value={300} style={{ color: '#000' }}>Last 300</option>
            <option value={400} style={{ color: '#000' }}>Last 400</option>
            <option value={500} style={{ color: '#000' }}>Last 500</option>
          </select>
          <button onClick={handleDownload} title="Download logs"
            style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Download size={14} />
          </button>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Log output */}
      <div
        onScroll={(e) => {
          const el = e.currentTarget
          autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50
        }}
        style={{
          flex: 1, overflowY: 'auto', background: '#0f0e1a', padding: '8px 12px',
          fontFamily: '"Fira Code", "Cascadia Code", monospace', fontSize: 11,
          lineHeight: 1.6, color: '#c7d2fe',
        }}
      >
        {lines.length === 0 && !connected && (
          <div style={{ color: '#6366f1', padding: 16 }}>Connecting...</div>
        )}
        {lines.map((line, i) => (
          <div key={i} style={{
            whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            color: line.includes('ERROR') || line.includes('error') ? '#fca5a5'
              : line.includes('WARN') || line.includes('warn') ? '#fcd34d'
              : '#c7d2fe',
          }}>
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      <button
        onClick={() => { autoScrollRef.current = true; bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
        style={{ position: 'absolute', bottom: 20, right: 20, background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      >
        <ChevronDown size={16} />
      </button>
    </div>
  )
}

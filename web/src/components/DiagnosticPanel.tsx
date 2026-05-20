import { useEffect, useState, useRef } from 'react'
import { X } from 'lucide-react'
import { diagnosticWsUrl } from '@/lib/api'

interface DiagnosticPanelProps {
  namespace: string
  podName: string
  onClose: () => void
}

export function DiagnosticPanel({ namespace, podName, onClose }: DiagnosticPanelProps) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'connecting' | 'streaming' | 'done' | 'error'>('connecting')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setText('')
    setStatus('connecting')
    const ws = new WebSocket(diagnosticWsUrl(namespace, podName))

    ws.onopen = () => setStatus('streaming')
    ws.onerror = () => setStatus('error')
    ws.onclose = () => setStatus((s) => s === 'streaming' ? 'done' : s)
    ws.onmessage = (e) => {
      setText((prev) => prev + (e.data as string))
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    return () => ws.close()
  }, [namespace, podName])

  const statusColor = { connecting: '#818cf8', streaming: '#22c55e', done: '#6366f1', error: '#ef4444' }[status]
  const statusLabel = { connecting: 'Connecting...', streaming: 'Analyzing...', done: 'Analysis complete', error: 'Error' }[status]

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '55%', minWidth: 420,
      background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
      zIndex: 60, display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        background: '#1e1b4b', padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <span style={{ color: '#c7d2fe', fontSize: 12, fontWeight: 600 }}>
            AI Diagnose: {namespace}/{podName}
          </span>
          <span style={{ fontSize: 10, color: statusColor }}>● {statusLabel}</span>
        </div>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: 20,
        fontFamily: 'system-ui', fontSize: 13, lineHeight: 1.7, color: '#1e293b',
        whiteSpace: 'pre-wrap',
      }}>
        {status === 'connecting' && (
          <div style={{ color: '#818cf8', fontSize: 12 }}>Collecting pod logs and events...</div>
        )}
        {text || null}
        <div ref={bottomRef} />
      </div>

      {/* Footer */}
      {status === 'done' && (
        <div style={{ borderTop: '1px solid #e0e7ff', padding: '8px 16px', fontSize: 11, color: '#6366f1', background: '#f0f4ff' }}>
          Analysis complete · Configure provider in <code style={{ background: '#e0e7ff', padding: '1px 4px', borderRadius: 3 }}>~/.k999s/config.yaml</code>
        </div>
      )}
    </div>
  )
}

import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { podExecWsUrl } from '@/lib/api'

interface ExecTerminalProps {
  namespace: string
  podName: string
  container: string
  onClose: () => void
}

export function ExecTerminal({ namespace, podName, container, onClose }: ExecTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Fira Code", "Cascadia Code", "Courier New", monospace',
      theme: {
        background: '#0f0e1a',
        foreground: '#c7d2fe',
        cursor: '#818cf8',
        selectionBackground: 'rgba(129,140,248,0.3)',
      },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    const ws = new WebSocket(podExecWsUrl(namespace, podName, container))
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => term.write('\r\n\x1b[1;34mConnected to ' + podName + '\x1b[0m\r\n')
    ws.onclose = () => term.write('\r\n\x1b[1;31m[session ended]\x1b[0m\r\n')
    ws.onerror = () => term.write('\r\n\x1b[1;31m[connection error]\x1b[0m\r\n')

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data))
      } else {
        term.write(e.data as string)
      }
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    })

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      ws.close()
      term.dispose()
      window.removeEventListener('resize', handleResize)
    }
  }, [namespace, podName, container])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      zIndex: 100, display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        background: '#1e1b4b', padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ color: '#818cf8', fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>
          💻 exec: {namespace}/{podName}{container ? ` — ${container}` : ''}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#c7d2fe', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 12 }}
        >
          ✕ Close
        </button>
      </div>
      <div ref={containerRef} style={{ flex: 1, padding: 4, background: '#0f0e1a', minHeight: 0 }} />
    </div>
  )
}

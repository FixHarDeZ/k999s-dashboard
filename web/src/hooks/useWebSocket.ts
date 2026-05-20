import { useEffect, useRef, useCallback } from 'react'

export interface WsMessage<T = unknown> {
  type: string
  data: T
}

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WsMessage
        onMessageRef.current(msg)
      } catch { /* ignore malformed */ }
    }

    ws.onclose = () => {
      setTimeout(connect, 3000)
    }

    wsRef.current = ws
  }, [])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])
}

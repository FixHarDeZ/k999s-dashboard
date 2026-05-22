import { useState } from 'react'
import { startPortForward } from '@/lib/api'

interface Props {
  namespace: string
  targetKind: 'Pod' | 'Service'
  targetName: string
  defaultRemotePort?: number
  onClose: () => void
}

export function PortForwardModal({ namespace, targetKind, targetName, defaultRemotePort = 80, onClose }: Props) {
  const [localPort, setLocalPort] = useState(defaultRemotePort)
  const [remotePort, setRemotePort] = useState(defaultRemotePort)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStart = async () => {
    setLoading(true)
    setError('')
    try {
      await startPortForward({ namespace, targetKind, targetName, localPort, remotePort })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start port-forward')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 shadow-xl w-72">
        <h3 className="font-bold text-sm text-primary-900 mb-1">Port Forward</h3>
        <p className="text-[11px] text-gray-500 mb-3">{targetKind}: {targetName}</p>
        <label className="text-xs text-gray-600 block mb-1">Local Port</label>
        <input
          type="number"
          min={1024}
          max={65535}
          value={localPort}
          onChange={(e) => setLocalPort(parseInt(e.target.value))}
          className="border border-primary-200 rounded px-3 py-1.5 text-sm w-full mb-3 outline-none focus:border-primary-400"
        />
        <label className="text-xs text-gray-600 block mb-1">Remote Port</label>
        <input
          type="number"
          min={1}
          max={65535}
          value={remotePort}
          onChange={(e) => setRemotePort(parseInt(e.target.value))}
          className="border border-primary-200 rounded px-3 py-1.5 text-sm w-full mb-4 outline-none focus:border-primary-400"
        />
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-gray-200">Cancel</button>
          <button onClick={handleStart} disabled={loading} className="text-xs px-3 py-1.5 rounded bg-primary-600 text-white disabled:opacity-50">
            {loading ? 'Starting...' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  )
}

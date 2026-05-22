import { useEffect, useState } from 'react'
import { listPortForwards, stopPortForward } from '@/lib/api'
import type { PortForwardEntry } from '@/lib/types'
import { X } from 'lucide-react'

export function PortForwardPanel() {
  const [entries, setEntries] = useState<PortForwardEntry[]>([])

  const refresh = () => {
    listPortForwards().then(setEntries).catch(console.error)
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [])

  if (entries.length === 0) return null

  const handleStop = async (id: string) => {
    await stopPortForward(id).catch(console.error)
    refresh()
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 bg-white border border-primary-100 rounded-xl shadow-lg w-72">
      <div className="px-3 py-2 border-b border-primary-50">
        <span className="text-[11px] font-bold text-primary-700">Active Port-Forwards ({entries.length})</span>
      </div>
      <div className="divide-y divide-primary-50">
        {entries.map((e) => (
          <div key={e.id} className="px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary-900 truncate">{e.targetName}</p>
              <a
                href={`http://localhost:${e.localPort}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary-500 hover:text-primary-700 underline"
              >
                localhost:{e.localPort} → :{e.remotePort}
              </a>
            </div>
            <button
              onClick={() => handleStop(e.id)}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
              title="Stop"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

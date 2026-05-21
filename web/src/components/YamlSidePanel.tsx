import { useEffect, useState } from 'react'
import { fetchResourceGet } from '@/lib/api'
import yaml from 'js-yaml'
import { X } from 'lucide-react'

interface YamlSidePanelProps {
  group: string
  version: string
  resource: string
  namespace: string
  name: string
  onClose: () => void
}

function cleanResource(json: unknown): unknown {
  if (typeof json !== 'object' || json === null) return json
  const obj = { ...(json as Record<string, unknown>) }
  delete obj.status
  const meta = obj.metadata as Record<string, unknown> | undefined
  if (meta) {
    const cleanMeta = { ...meta }
    delete cleanMeta.managedFields
    obj.metadata = cleanMeta
  }
  return obj
}

export function YamlSidePanel({ group, version, resource, namespace, name, onClose }: YamlSidePanelProps) {
  const [rawJson, setRawJson] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewClean, setViewClean] = useState(false)

  useEffect(() => {
    fetchResourceGet(group, version, resource, namespace, name)
      .then(json => { setRawJson(json); setLoading(false) })
      .catch(e => { setError((e as Error).message); setLoading(false) })
  }, [group, version, resource, namespace, name])

  const displayYaml = (() => {
    if (!rawJson) return ''
    try {
      const parsed = JSON.parse(rawJson)
      const data = viewClean ? cleanResource(parsed) : parsed
      return yaml.dump(data, { indent: 2, lineWidth: -1 })
    } catch {
      return rawJson
    }
  })()

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[600px] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-primary-100">
          <div>
            <span className="text-xs font-bold text-primary-900">{name}</span>
            <span className="text-[10px] text-primary-400 ml-2">{namespace}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewClean(v => !v)}
              className="text-[10px] px-2 py-1 rounded border border-primary-200 text-primary-600 hover:bg-primary-50"
            >
              {viewClean ? '[Clean]' : '[Full]'}
            </button>
            <button onClick={onClose} className="p-1 hover:bg-primary-50 rounded">
              <X size={14} className="text-primary-500" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading && <p className="text-xs text-primary-400">Loading...</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {!loading && !error && (
            <pre className="text-[11px] font-mono text-primary-800 whitespace-pre-wrap">{displayYaml}</pre>
          )}
        </div>
      </div>
    </>
  )
}

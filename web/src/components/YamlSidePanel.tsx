import { useEffect, useState } from 'react'
import { fetchResourceGet, applyResource } from '@/lib/api'
import yaml from 'js-yaml'
import { X } from 'lucide-react'

interface YamlSidePanelProps {
  group: string
  version: string
  resource: string
  namespace: string
  name: string
  onClose: () => void
  editable?: boolean
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

export function YamlSidePanel({ group, version, resource, namespace, name, onClose, editable = false }: YamlSidePanelProps) {
  const [rawJson, setRawJson] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewClean, setViewClean] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState<string>('')
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchResourceGet(group, version, resource, namespace, name)
      .then(json => { setRawJson(json); setLoading(false) })
      .catch(e => { setError((e as Error).message); setLoading(false) })
  }, [group, version, resource, namespace, name, reloadKey])

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

  const handleEdit = () => {
    setEditContent(displayYaml)
    setEditMode(true)
    setApplyError(null)
    setApplySuccess(false)
  }

  const handleCancel = () => {
    setEditMode(false)
    setApplyError(null)
  }

  const handleApply = async () => {
    setApplying(true)
    setApplyError(null)
    try {
      const parsed = yaml.load(editContent)
      await applyResource(group, version, resource, namespace, name, parsed)
      setApplySuccess(true)
      setEditMode(false)
      setTimeout(() => {
        setApplySuccess(false)
        setReloadKey(k => k + 1)
      }, 1500)
    } catch (e) {
      setApplyError((e as Error).message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[600px] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-primary-100">
          <div>
            <span className="text-xs font-bold text-primary-900">{name}</span>
            <span className="text-[10px] text-primary-400 ml-2">{namespace}</span>
            {applySuccess && (
              <span className="text-[10px] text-green-600 ml-2 font-medium">✓ Applied</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="text-[10px] px-2 py-1 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {applying ? 'Applying...' : 'Apply'}
                </button>
                <button
                  onClick={handleCancel}
                  className="text-[10px] px-2 py-1 rounded border border-primary-200 text-primary-600 hover:bg-primary-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {editable && (
                  <button
                    onClick={handleEdit}
                    className="text-[10px] px-2 py-1 rounded border border-primary-200 text-primary-600 hover:bg-primary-50"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => setViewClean(v => !v)}
                  className="text-[10px] px-2 py-1 rounded border border-primary-200 text-primary-600 hover:bg-primary-50"
                >
                  {viewClean ? '[Clean]' : '[Full]'}
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1 hover:bg-primary-50 rounded">
              <X size={14} className="text-primary-500" />
            </button>
          </div>
        </div>

        {applyError && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600">
            {applyError}
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {loading && <p className="text-xs text-primary-400">Loading...</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {!loading && !error && (
            editMode ? (
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="w-full h-full text-[11px] font-mono text-primary-800 border border-primary-200 rounded p-2 outline-none focus:border-primary-400 resize-none"
                spellCheck={false}
              />
            ) : (
              <pre className="text-[11px] font-mono text-primary-800 whitespace-pre-wrap">{displayYaml}</pre>
            )
          )}
        </div>
      </div>
    </>
  )
}

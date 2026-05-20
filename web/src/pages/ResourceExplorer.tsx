import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fetchAPIResources, fetchResourceList, fetchResourceGet } from '@/lib/api'
import type { APIResourceInfo } from '@/lib/types'

function extractName(item: Record<string, unknown>): string {
  const meta = item.metadata as Record<string, unknown> | undefined
  return (meta?.name as string) ?? '(unknown)'
}

function extractAge(item: Record<string, unknown>): string {
  const meta = item.metadata as Record<string, unknown> | undefined
  const ts = meta?.creationTimestamp as string | undefined
  if (!ts) return ''
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (d < 60) return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

function groupResources(resources: APIResourceInfo[]): Record<string, APIResourceInfo[]> {
  const groups: Record<string, APIResourceInfo[]> = {}
  for (const r of resources) {
    const groupName = r.group || 'core (v1)'
    if (!groups[groupName]) groups[groupName] = []
    groups[groupName].push(r)
  }
  return groups
}

export function ResourceExplorer() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''

  const [allResources, setAllResources] = useState<APIResourceInfo[]>([])
  const [selected, setSelected] = useState<APIResourceInfo | null>(null)
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [yaml, setYaml] = useState<string>('')
  const [loadingItems, setLoadingItems] = useState(false)
  const [loadingYaml, setLoadingYaml] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    fetchAPIResources().then(setAllResources).catch(console.error)
  }, [])

  const handleSelectResource = useCallback(async (res: APIResourceInfo) => {
    setSelected(res)
    setItems([])
    setSelectedItem(null)
    setYaml('')
    setLoadingItems(true)
    try {
      const raw = await fetchResourceList(res.group, res.version, res.name, namespace)
      setItems(raw)
    } catch {
      setItems([])
    } finally {
      setLoadingItems(false)
    }
  }, [namespace])

  const handleGetYaml = useCallback(async (itemName: string) => {
    if (!selected) return
    setSelectedItem(itemName)
    setYaml('')
    setLoadingYaml(true)
    try {
      const result = await fetchResourceGet(selected.group, selected.version, selected.name, namespace, itemName)
      setYaml(result)
    } catch (e) {
      setYaml(`Error: ${(e as Error).message}`)
    } finally {
      setLoadingYaml(false)
    }
  }, [selected, namespace])

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml).catch(console.error)
  }

  const grouped = groupResources(allResources)
  const filteredGroups: Record<string, APIResourceInfo[]> = {}
  for (const [group, resources] of Object.entries(grouped)) {
    const filtered = resources.filter((r) =>
      filter === '' || r.kind.toLowerCase().includes(filter.toLowerCase()) || r.name.toLowerCase().includes(filter.toLowerCase())
    )
    if (filtered.length > 0) {
      filteredGroups[group] = filtered
    }
  }

  return (
    <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Resource Explorer</h1>
          <p className="text-[11px] text-primary-500">{allResources.length} resource types</p>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: 12, overflow: 'hidden' }}>

        {/* Left: kind list */}
        <div style={{ width: 220, flexShrink: 0, border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #e0e7ff', background: '#f0f4ff' }}>
            <input
              placeholder="Filter kinds..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, outline: 'none', color: '#374151' }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {Object.entries(filteredGroups).map(([group, resources]) => (
              <div key={group}>
                <div style={{ padding: '6px 10px 2px', fontSize: 9, fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {group}
                </div>
                {resources.map((r) => {
                  const isActive = selected?.name === r.name && selected?.group === r.group
                  return (
                    <button
                      key={`${r.group}/${r.version}/${r.name}`}
                      onClick={() => handleSelectResource(r)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '5px 10px',
                        fontSize: 11, background: isActive ? '#eef2ff' : 'transparent',
                        color: isActive ? '#4338ca' : '#374151',
                        border: 'none', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                        fontWeight: isActive ? 600 : 400,
                      }}
                    >
                      {r.kind}
                      <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 4 }}>{r.name}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Middle: resource list */}
        <div style={{ width: 280, flexShrink: 0, border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!selected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9ca3af', fontSize: 12 }}>
              ← Select a resource kind
            </div>
          ) : (
            <>
              <div style={{ padding: '8px 12px', background: '#f0f4ff', borderBottom: '1px solid #e0e7ff', fontSize: 11, fontWeight: 600, color: '#4338ca' }}>
                {selected.kind}
                <span style={{ fontSize: 9, color: '#818cf8', marginLeft: 6 }}>
                  {loadingItems ? 'loading...' : `${items.length} items`}
                </span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {items.map((item) => {
                  const itemName = extractName(item)
                  const isActive = selectedItem === itemName
                  return (
                    <button
                      key={itemName}
                      onClick={() => handleGetYaml(itemName)}
                      style={{
                        width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 11,
                        background: isActive ? '#eef2ff' : 'transparent',
                        color: isActive ? '#4338ca' : '#374151',
                        border: 'none', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                        fontWeight: isActive ? 600 : 400,
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{itemName}</span>
                      <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0, marginLeft: 4 }}>{extractAge(item)}</span>
                    </button>
                  )
                })}
              </div>
            </>
          )}
        </div>

        {/* Right: YAML/JSON viewer */}
        <div style={{ flex: 1, border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!selectedItem ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9ca3af', fontSize: 12 }}>
              ← Select a resource to view
            </div>
          ) : (
            <>
              <div style={{ padding: '6px 12px', background: '#f0f4ff', borderBottom: '1px solid #e0e7ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#4338ca', fontFamily: 'monospace' }}>
                  {selected?.kind}/{selectedItem}
                </span>
                <button onClick={handleCopy}
                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca', cursor: 'pointer' }}>
                  📋 Copy
                </button>
              </div>
              <pre style={{
                flex: 1, overflowY: 'auto', margin: 0, padding: 12,
                background: '#0f0e1a', color: '#c7d2fe',
                fontFamily: '"Fira Code", monospace', fontSize: 11, lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {loadingYaml ? 'Loading...' : yaml}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import yaml from 'js-yaml'
import { fetchAPIResources, fetchResourceList, fetchResourceGet, applyResource } from '@/lib/api'
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
  const ctx = useOutletContext<{ namespace: string; context?: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const context = ctx?.context ?? ''

  const [allResources, setAllResources] = useState<APIResourceInfo[]>([])
  const [selected, setSelected] = useState<APIResourceInfo | null>(null)
  const [items, setItems] = useState<Record<string, unknown>[]>([])
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [selectedItemNs, setSelectedItemNs] = useState<string>('')  // actual namespace of selected item
  const [rawJson, setRawJson] = useState<string>('')        // raw JSON from backend
  const [editContent, setEditContent] = useState<string>('') // editable YAML in editor
  const [editMode, setEditMode] = useState(false)
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState(false)
  const [loadingItems, setLoadingItems] = useState(false)
  const [loadingYaml, setLoadingYaml] = useState(false)
  const [filter, setFilter] = useState('')
  const [itemsError, setItemsError] = useState<string | null>(null)
  const [viewClean, setViewClean] = useState(false)

  // Effect 1: context changes → reset everything + re-fetch API resources
  useEffect(() => {
    fetchAPIResources().then(setAllResources).catch(console.error)
    setSelected(null)
    setItems([])
    setSelectedItem(null)
    setRawJson('')
    setEditMode(false)
    setItemsError(null)
  }, [context])

  // Effect 2: namespace changes → re-fetch items if a resource kind is selected
  useEffect(() => {
    if (!selected) return
    setItems([])
    setSelectedItem(null)
    setRawJson('')
    setEditMode(false)
    setItemsError(null)
    setLoadingItems(true)
    fetchResourceList(selected.group, selected.version, selected.name, namespace)
      .then(setItems)
      .catch((e) => { setItemsError((e as Error).message); setItems([]) })
      .finally(() => setLoadingItems(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [namespace])

  const handleSelectResource = useCallback(async (res: APIResourceInfo) => {
    setSelected(res)
    setItems([])
    setSelectedItem(null)
    setRawJson('')
    setEditMode(false)
    setItemsError(null)
    setLoadingItems(true)
    try {
      const raw = await fetchResourceList(res.group, res.version, res.name, namespace)
      setItems(raw)
    } catch (e) {
      setItemsError((e as Error).message)
      setItems([])
    } finally {
      setLoadingItems(false)
    }
  }, [namespace])

  const handleGetYaml = useCallback(async (itemName: string, itemNamespace?: string) => {
    if (!selected) return
    setSelectedItem(itemName)
    const ns = itemNamespace ?? namespace
    setSelectedItemNs(ns)  // remember for Apply
    setRawJson('')
    setEditMode(false)
    setApplyError(null)
    setApplySuccess(false)
    setLoadingYaml(true)
    // Use the item's own namespace (from metadata) when global namespace is empty (All Namespaces)
    try {
      const jsonStr = await fetchResourceGet(selected.group, selected.version, selected.name, ns, itemName)
      setRawJson(jsonStr)
    } catch (e) {
      setRawJson(`// Error: ${(e as Error).message}`)
    } finally {
      setLoadingYaml(false)
    }
  }, [selected, namespace])

  function stripServerFields(jsonStr: string): string {
    const obj = JSON.parse(jsonStr) as Record<string, unknown>
    const editable: Record<string, unknown> = { ...obj }
    delete editable.status
    if (editable.metadata && typeof editable.metadata === 'object') {
      const meta = { ...(editable.metadata as Record<string, unknown>) }
      delete meta.managedFields
      editable.metadata = meta
    }
    return yaml.dump(editable, { indent: 2, lineWidth: -1 })
  }

  // Convert JSON to YAML for display/editing
  const yamlContent = (() => {
    if (!rawJson || rawJson.startsWith('// Error')) return rawJson
    try { return yaml.dump(JSON.parse(rawJson), { indent: 2, lineWidth: -1 }) }
    catch { return rawJson }
  })()

  const displayContent = (() => {
    if (!rawJson || rawJson.startsWith('// Error')) return yamlContent
    if (!viewClean) return yamlContent
    try { return stripServerFields(rawJson) }
    catch { return yamlContent }
  })()

  const handleEdit = () => {
    let content = yamlContent
    if (rawJson && !rawJson.startsWith('// Error')) {
      try { content = stripServerFields(rawJson) }
      catch { content = yamlContent }
    }
    setEditContent(content)
    setEditMode(true)
    setApplyError(null)
    setApplySuccess(false)
  }

  const handleCancelEdit = () => {
    setEditMode(false)
    setApplyError(null)
  }

  const handleApply = async () => {
    if (!selected || !selectedItem) return
    setApplying(true)
    setApplyError(null)
    setApplySuccess(false)
    try {
      const parsed = yaml.load(editContent)
      await applyResource(selected.group, selected.version, selected.name, selectedItemNs, selectedItem, parsed)
      setApplySuccess(true)
      setEditMode(false)
      // Refresh the resource view using the actual item namespace
      const jsonStr = await fetchResourceGet(selected.group, selected.version, selected.name, selectedItemNs, selectedItem)
      setRawJson(jsonStr)
    } catch (e) {
      setApplyError((e as Error).message)
    } finally {
      setApplying(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(displayContent).catch(console.error)
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
                <span style={{ fontSize: 9, color: itemsError ? '#ef4444' : '#818cf8', marginLeft: 6 }}>
                  {loadingItems ? 'loading...' : itemsError ? 'error' : `${items.length} items`}
                </span>
              </div>
              {itemsError && (
                <div style={{ padding: '10px 12px', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontSize: 10, color: '#dc2626', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  {itemsError}
                </div>
              )}
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {items.map((item) => {
                  const itemName = extractName(item)
                  const itemMeta = item.metadata as Record<string, unknown> | undefined
                  const itemNs = (itemMeta?.namespace as string) ?? ''
                  const isActive = selectedItem === itemName
                  return (
                    <button
                      key={`${itemNs}/${itemName}`}
                      onClick={() => handleGetYaml(itemName, itemNs)}
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

        {/* Right: YAML viewer + editor */}
        <div style={{ flex: 1, border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!selectedItem ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9ca3af', fontSize: 12 }}>
              ← Select a resource to view
            </div>
          ) : (
            <>
              {/* Header */}
              <div style={{ padding: '6px 12px', background: '#f0f4ff', borderBottom: '1px solid #e0e7ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#4338ca', fontFamily: 'monospace' }}>
                  {selected?.kind}/{selectedItem}
                  {editMode && <span style={{ color: '#f59e0b', marginLeft: 6 }}>● editing</span>}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {!editMode ? (
                    <>
                      {/* View mode toggle */}
                      <div style={{ display: 'flex', border: '1px solid #c7d2fe', borderRadius: 4, overflow: 'hidden' }}>
                        <button onClick={() => setViewClean(false)}
                          style={{ fontSize: 10, padding: '2px 7px', border: 'none', background: !viewClean ? '#c7d2fe' : '#fff', color: !viewClean ? '#3730a3' : '#6b7280', cursor: 'pointer', fontWeight: !viewClean ? 600 : 400 }}>
                          Full
                        </button>
                        <button onClick={() => setViewClean(true)}
                          style={{ fontSize: 10, padding: '2px 7px', border: 'none', background: viewClean ? '#c7d2fe' : '#fff', color: viewClean ? '#3730a3' : '#6b7280', cursor: 'pointer', fontWeight: viewClean ? 600 : 400 }}>
                          Clean
                        </button>
                      </div>
                      <button onClick={handleCopy}
                        style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca', cursor: 'pointer' }}>
                        📋 Copy
                      </button>
                      <button onClick={handleEdit}
                        style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid #6366f1', background: '#6366f1', color: '#fff', cursor: 'pointer' }}>
                        ✏️ Edit
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={handleCancelEdit}
                        style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid #e5e7eb', background: '#fff', color: '#6b7280', cursor: 'pointer' }}>
                        Cancel
                      </button>
                      <button onClick={handleApply} disabled={applying}
                        style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: 'none', background: applying ? '#a5b4fc' : '#4f46e5', color: '#fff', cursor: applying ? 'not-allowed' : 'pointer' }}>
                        {applying ? 'Applying...' : '✓ Apply'}
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Feedback bar */}
              {applySuccess && (
                <div style={{ padding: '6px 12px', background: '#f0fdf4', borderBottom: '1px solid #bbf7d0', fontSize: 10, color: '#16a34a' }}>
                  ✓ Applied successfully
                </div>
              )}
              {applyError && (
                <div style={{ padding: '6px 12px', background: '#fef2f2', borderBottom: '1px solid #fecaca', fontSize: 10, color: '#dc2626', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                  ✗ {applyError}
                </div>
              )}

              {/* Content */}
              {editMode ? (
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  spellCheck={false}
                  style={{
                    flex: 1, margin: 0, padding: 12, resize: 'none',
                    background: '#0f0e1a', color: '#c7d2fe', border: 'none', outline: 'none',
                    fontFamily: '"Fira Code", monospace', fontSize: 11, lineHeight: 1.6,
                    whiteSpace: 'pre',
                  }}
                />
              ) : (
                <pre style={{
                  flex: 1, overflowY: 'auto', margin: 0, padding: 12,
                  background: '#0f0e1a', color: '#c7d2fe',
                  fontFamily: '"Fira Code", monospace', fontSize: 11, lineHeight: 1.6,
                  whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                }}>
                  {loadingYaml ? 'Loading...' : displayContent}
                </pre>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}

import { RefreshButton } from '@/components/RefreshButton'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createColumnHelper, flexRender, getCoreRowModel,
  getFilteredRowModel, getSortedRowModel, useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { fetchAPIResources, fetchResourceList } from '@/lib/api'
import type { CRDPresence } from '@/lib/types'
import { cn } from '@/lib/utils'

type Row = Record<string, unknown>
const col = createColumnHelper<Row>()

function getMeta(r: Row): Record<string, unknown> { return (r.metadata as Record<string, unknown>) ?? {} }
function getSpec(r: Row): Record<string, unknown> { return (r.spec as Record<string, unknown>) ?? {} }
function getStatus(r: Row): Record<string, unknown> { return (r.status as Record<string, unknown>) ?? {} }

function getAge(r: Row): string {
  const ts = getMeta(r).creationTimestamp as string | undefined
  if (!ts) return ''
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (d < 60) return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

const PHASE_COLORS: Record<string, string> = {
  Initialized: 'bg-gray-100 text-gray-600',
  Waiting: 'bg-yellow-100 text-yellow-700',
  Progressing: 'bg-blue-100 text-blue-700',
  Promoting: 'bg-purple-100 text-purple-700',
  Finalising: 'bg-teal-100 text-teal-700',
  Succeeded: 'bg-green-100 text-green-700',
  Failed: 'bg-red-100 text-red-600',
  Healthy: 'bg-green-100 text-green-700',
  Paused: 'bg-yellow-100 text-yellow-700',
  Degraded: 'bg-red-100 text-red-600',
}

function PhaseBadge({ phase }: { phase: string }) {
  const cls = PHASE_COLORS[phase] ?? 'bg-gray-100 text-gray-600'
  return <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', cls)}>{phase}</span>
}

function WeightBar({ weight, max }: { weight: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (weight / max) * 100) : 0
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-500">{weight}%</span>
    </div>
  )
}

const flaggerColumns = [
  col.accessor(r => getMeta(r).name as string ?? '', { id: 'name', header: 'Name',
    cell: i => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor(r => getMeta(r).namespace as string ?? '', { id: 'namespace', header: 'Namespace',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor(r => (getSpec(r).targetRef as { name: string } | undefined)?.name ?? '—', { id: 'target', header: 'Target',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getStatus(r).phase as string ?? '—', { id: 'phase', header: 'Phase',
    cell: i => <PhaseBadge phase={i.getValue()} /> }),
  col.display({ id: 'weight', header: 'Weight',
    cell: ({ row }) => {
      const weight = getStatus(row.original).canaryWeight as number ?? 0
      const spec = getSpec(row.original)
      const analysis = (spec.analysis ?? spec.canaryAnalysis) as { maxWeight?: number } | undefined
      return <WeightBar weight={weight} max={analysis?.maxWeight ?? 100} />
    },
  }),
  col.accessor(r => getAge(r), { id: 'age', header: 'Age',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

const argoColumns = [
  col.accessor(r => getMeta(r).name as string ?? '', { id: 'name', header: 'Name',
    cell: i => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor(r => getMeta(r).namespace as string ?? '', { id: 'namespace', header: 'Namespace',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor(r => (getSpec(r).strategy as { canary?: unknown } | undefined)?.canary ? 'Canary' : 'BlueGreen', { id: 'strategy', header: 'Strategy',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getStatus(r).phase as string ?? '—', { id: 'phase', header: 'Phase',
    cell: i => <PhaseBadge phase={i.getValue()} /> }),
  col.accessor(r => `${getStatus(r).readyReplicas ?? 0}/${getSpec(r).replicas ?? '?'}`, { id: 'ready', header: 'Ready',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => String(getStatus(r).currentStepIndex ?? '—'), { id: 'step', header: 'Step',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getAge(r), { id: 'age', header: 'Age',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

type TabId = 'flagger' | 'argo'

export function Canary() {
  const ctx = useOutletContext<{ namespace: string; detectedCRDs?: CRDPresence } | null>()
  const namespace = ctx?.namespace ?? ''
  const crds = ctx?.detectedCRDs

  const availableTabs: TabId[] = [
    ...(crds?.flaggerCanary !== false ? ['flagger' as const] : []),
    ...(crds?.argoRollouts === true ? ['argo' as const] : []),
  ]
  const tabs = availableTabs.length > 0 ? availableTabs : ['flagger' as const, 'argo' as const]

  const [activeTab, setActiveTab] = useState<TabId>(tabs[0])
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [globalFilter, setGlobalFilter] = useState('')
  const [sorting, setSorting] = useState<SortingState>([])
  const [selected, setSelected] = useState<Row | null>(null)
  const [versions, setVersions] = useState({ flagger: 'v1beta1', argo: 'v1alpha1' })

  useEffect(() => {
    fetchAPIResources().then(resources => {
      setVersions({
        flagger: resources.find(r => r.group === 'flagger.app' && r.name === 'canaries')?.version ?? 'v1beta1',
        argo: resources.find(r => r.group === 'argoproj.io' && r.name === 'rollouts')?.version ?? 'v1alpha1',
      })
    }).catch(() => {})
  }, [])

  const load = useCallback(() => {
    const [group, version, resource] = activeTab === 'flagger'
      ? ['flagger.app', versions.flagger, 'canaries']
      : ['argoproj.io', versions.argo, 'rollouts']
    setLoading(true)
    setError(null)
    fetchResourceList(group, version, resource, namespace)
      .then(setItems)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [activeTab, namespace, versions])

  useEffect(() => { load() }, [load])

  const table = useReactTable({
    data: items,
    columns: activeTab === 'flagger' ? flaggerColumns : argoColumns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const tabLabel = (tab: TabId) => tab === 'flagger' ? 'Flagger Canary' : 'Argo Rollouts'

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Canary</h1>
          <p className="text-[11px] text-primary-500">{items.length} resources</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton onRefresh={load} />
          <input
            placeholder="Filter..."
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-40"
          />
        </div>
      </div>

      <div className="flex gap-1 mb-3">
        {tabs.map(tab => (
          <button key={tab}
            onClick={() => { setActiveTab(tab); setGlobalFilter(''); setSorting([]) }}
            className={cn(
              'text-xs px-3 py-1.5 rounded-md font-medium transition-colors',
              activeTab === tab ? 'bg-primary-600 text-white' : 'text-primary-600 hover:bg-primary-50'
            )}>
            {tabLabel(tab)}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      {loading && <p className="text-xs text-primary-400 mb-3">Loading...</p>}

      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider cursor-pointer select-none">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}
                onClick={() => setSelected(row.original)}
                className="border-t border-primary-50 hover:bg-primary-50/50 transition-colors cursor-pointer">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && !error && (
          <p className="text-xs text-primary-400 text-center py-8">No resources found</p>
        )}
      </div>

      {selected && (
        <YamlSidePanel
          group={activeTab === 'flagger' ? 'flagger.app' : 'argoproj.io'}
          version={activeTab === 'flagger' ? versions.flagger : versions.argo}
          resource={activeTab === 'flagger' ? 'canaries' : 'rollouts'}
          namespace={getMeta(selected).namespace as string ?? ''}
          name={getMeta(selected).name as string ?? ''}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

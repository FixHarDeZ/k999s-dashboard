import { RefreshButton } from '@/components/RefreshButton'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createColumnHelper, flexRender, getCoreRowModel,
  getFilteredRowModel, useReactTable,
} from '@tanstack/react-table'
import { fetchAPIResources, fetchResourceList } from '@/lib/api'
import { cn } from '@/lib/utils'

type Row = Record<string, unknown>
const col = createColumnHelper<Row>()

function getMeta(r: Row): Record<string, unknown> { return (r.metadata as Record<string, unknown>) ?? {} }
function getSpec(r: Row): Record<string, unknown> { return (r.spec as Record<string, unknown>) ?? {} }

function getAge(r: Row): string {
  const ts = getMeta(r).creationTimestamp as string | undefined
  if (!ts) return ''
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (d < 60) return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

const vsColumns = [
  col.accessor(r => getMeta(r).name as string ?? '', { id: 'name', header: 'Name',
    cell: i => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor(r => getMeta(r).namespace as string ?? '', { id: 'namespace', header: 'Namespace',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor(r => (getSpec(r).hosts as string[])?.join(', ') ?? '—', { id: 'hosts', header: 'Hosts',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => String((getSpec(r).gateways as unknown[])?.length ?? 0), { id: 'gateways', header: 'Gateways',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => String((getSpec(r).http as unknown[])?.length ?? 0), { id: 'http', header: 'HTTP Routes',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getAge(r), { id: 'age', header: 'Age',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

const drColumns = [
  col.accessor(r => getMeta(r).name as string ?? '', { id: 'name', header: 'Name',
    cell: i => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor(r => getMeta(r).namespace as string ?? '', { id: 'namespace', header: 'Namespace',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor(r => getSpec(r).host as string ?? '—', { id: 'host', header: 'Host',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => (getSpec(r).subsets as Array<{ name: string }>)?.map(s => s.name).join(', ') ?? '—', { id: 'subsets', header: 'Subsets',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getSpec(r).trafficPolicy ? 'Configured' : '—', { id: 'traffic', header: 'Traffic Policy',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getAge(r), { id: 'age', header: 'Age',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

export function Istio() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [activeTab, setActiveTab] = useState<'vs' | 'dr'>('vs')
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [globalFilter, setGlobalFilter] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)
  const [versions, setVersions] = useState({ vs: 'v1beta1', dr: 'v1beta1' })

  useEffect(() => {
    fetchAPIResources().then(resources => {
      setVersions({
        vs: resources.find(r => r.group === 'networking.istio.io' && r.name === 'virtualservices')?.version ?? 'v1beta1',
        dr: resources.find(r => r.group === 'networking.istio.io' && r.name === 'destinationrules')?.version ?? 'v1beta1',
      })
    }).catch(() => {})
  }, [])

  const load = useCallback(() => {
    const [group, version, resource] = activeTab === 'vs'
      ? ['networking.istio.io', versions.vs, 'virtualservices']
      : ['networking.istio.io', versions.dr, 'destinationrules']
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
    columns: activeTab === 'vs' ? vsColumns : drColumns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Istio</h1>
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
        {(['vs', 'dr'] as const).map(tab => (
          <button key={tab}
            onClick={() => { setActiveTab(tab); setGlobalFilter('') }}
            className={cn(
              'text-xs px-3 py-1.5 rounded-md font-medium transition-colors',
              activeTab === tab ? 'bg-primary-600 text-white' : 'text-primary-600 hover:bg-primary-50'
            )}>
            {tab === 'vs' ? 'VirtualService' : 'DestinationRule'}
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
                  <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">
                    {flexRender(h.column.columnDef.header, h.getContext())}
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
          group="networking.istio.io"
          version={activeTab === 'vs' ? versions.vs : versions.dr}
          resource={activeTab === 'vs' ? 'virtualservices' : 'destinationrules'}
          namespace={getMeta(selected).namespace as string ?? ''}
          name={getMeta(selected).name as string ?? ''}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}

import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { FileCode2, SlidersHorizontal } from 'lucide-react'
import { fetchHPAs, patchHPALimits } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { HPASummary } from '@/lib/types'

const col = createColumnHelper<HPASummary>()

export function HPA() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<HPASummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [yamlTarget, setYamlTarget] = useState<HPASummary | null>(null)
  const [editTarget, setEditTarget] = useState<HPASummary | null>(null)
  const [editMin, setEditMin] = useState(1)
  const [editMax, setEditMax] = useState(10)

  const load = useCallback(() => {
    fetchHPAs(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const handleEditLimits = async () => {
    if (!editTarget) return
    await patchHPALimits(editTarget.namespace, editTarget.name, editMin, editMax).catch(console.error)
    setEditTarget(null)
    load()
  }

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'target',
      header: 'Target',
      cell: ({ row }) => <span className="text-xs">{row.original.targetKind}/{row.original.targetName}</span>,
    }),
    col.accessor('minReplicas', { header: 'Min', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('maxReplicas', { header: 'Max', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('currentReplicas', { header: 'Current', cell: (i) => <span className="text-xs font-medium">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button onClick={() => setYamlTarget(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded" title="View/Edit YAML"><FileCode2 size={13} /></button>
          <button
            onClick={() => {
              setEditTarget(row.original)
              setEditMin(row.original.minReplicas)
              setEditMax(row.original.maxReplicas)
            }}
            className="p-1 text-primary-600 hover:bg-primary-50 rounded"
            title="Edit Limits"
          >
            <SlidersHorizontal size={13} />
          </button>
        </div>
      ),
    }),
  ]

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">HPA</h1>
          <p className="text-[11px] text-primary-500">{items.length} horizontal pod autoscalers</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton onRefresh={load} />
          <input placeholder="Filter..." value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)} className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-40" />
        </div>
      </div>
      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} onClick={h.column.getToggleSortingHandler()} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider cursor-pointer">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="border-t border-primary-50 hover:bg-primary-50/50">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-72">
            <h3 className="font-bold text-sm text-primary-900 mb-3">Edit Limits: {editTarget.name}</h3>
            <label className="text-xs text-gray-600 block mb-1">Min Replicas</label>
            <input type="number" min={1} max={editMax} value={editMin} onChange={(e) => setEditMin(parseInt(e.target.value))} className="border border-primary-200 rounded px-3 py-1.5 text-sm w-full mb-3 outline-none focus:border-primary-400" />
            <label className="text-xs text-gray-600 block mb-1">Max Replicas</label>
            <input type="number" min={editMin} max={200} value={editMax} onChange={(e) => setEditMax(parseInt(e.target.value))} className="border border-primary-200 rounded px-3 py-1.5 text-sm w-full mb-4 outline-none focus:border-primary-400" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditTarget(null)} className="text-xs px-3 py-1.5 rounded border border-gray-200">Cancel</button>
              <button onClick={handleEditLimits} className="text-xs px-3 py-1.5 rounded bg-primary-600 text-white">Apply</button>
            </div>
          </div>
        </div>
      )}

      {yamlTarget && (
        <YamlSidePanel group="autoscaling" version="v2" resource="horizontalpodautoscalers" namespace={yamlTarget.namespace} name={yamlTarget.name} onClose={() => setYamlTarget(null)} editable />
      )}
    </div>
  )
}

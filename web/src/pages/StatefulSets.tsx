import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { FileCode2 } from 'lucide-react'
import { fetchStatefulSets } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { StatefulSetSummary } from '@/lib/types'

const col = createColumnHelper<StatefulSetSummary>()

export function StatefulSets() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<StatefulSetSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [yamlTarget, setYamlTarget] = useState<StatefulSetSummary | null>(null)

  const load = useCallback(() => {
    fetchStatefulSets(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('ready', { header: 'Ready', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <button
          onClick={() => setYamlTarget(row.original)}
          className="p-1 text-primary-600 hover:bg-primary-50 rounded"
          title="View/Edit YAML"
        >
          <FileCode2 size={13} />
        </button>
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
          <h1 className="text-base font-bold text-primary-900">StatefulSets</h1>
          <p className="text-[11px] text-primary-500">{items.length} statefulsets</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton onRefresh={load} />
          <input
            placeholder="Filter..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-40"
          />
        </div>
      </div>
      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th
                    key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider cursor-pointer"
                  >
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
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {yamlTarget && (
        <YamlSidePanel
          group="apps"
          version="v1"
          resource="statefulsets"
          namespace={yamlTarget.namespace}
          name={yamlTarget.name}
          onClose={() => setYamlTarget(null)}
          editable
        />
      )}
    </div>
  )
}

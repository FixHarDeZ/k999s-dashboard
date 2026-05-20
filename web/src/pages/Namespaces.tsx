import { useEffect, useState, useCallback } from 'react'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { fetchNamespaceSummaries } from '@/lib/api'
import type { NamespaceSummary } from '@/lib/types'

const col = createColumnHelper<NamespaceSummary>()
const columns = [
  col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor('status', { header: 'Status', cell: (i) => <span className="text-xs text-green-600">● {i.getValue()}</span> }),
  col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

export function Namespaces() {
  const [items, setItems] = useState<NamespaceSummary[]>([])
  const load = useCallback(() => { fetchNamespaceSummaries().then(setItems).catch(console.error) }, [])
  useEffect(() => { load() }, [load])
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">Namespaces</h1><p className="text-[11px] text-primary-500">{items.length} namespaces</p></div>
        <button onClick={load} className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-primary-200">↻ Refresh</button>
      </div>
      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">{table.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map(row => <tr key={row.id} className="border-t border-primary-50 hover:bg-primary-50/50">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}

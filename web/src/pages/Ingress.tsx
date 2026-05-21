import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { fetchIngresses } from '@/lib/api'
import type { IngressSummary } from '@/lib/types'

const col = createColumnHelper<IngressSummary>()

export function Ingress() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<IngressSummary[]>([])

  const load = useCallback(() => { fetchIngresses(namespace).then(setItems).catch(console.error) }, [namespace])
  useEffect(() => { load() }, [load])

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('hosts', { header: 'Hosts', cell: (i) => <span className="text-xs font-mono text-gray-700">{i.getValue() || '-'}</span> }),
    col.accessor('address', { header: 'Address', cell: (i) => <span className="text-xs font-mono text-gray-600">{i.getValue() || '<pending>'}</span> }),
    col.accessor('ports', { header: 'Ports', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  ]

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Ingresses</h1>
          <p className="text-[11px] text-primary-500">{items.length} ingresses</p>
        </div>
        <RefreshButton onRefresh={load} />
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

import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { fetchEvents } from '@/lib/api'
import type { EventSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const col = createColumnHelper<EventSummary>()

const columns = [
  col.accessor('type', {
    header: 'Type',
    cell: (i) => (
      <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded',
        i.getValue() === 'Warning' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
      )}>
        {i.getValue()}
      </span>
    ),
  }),
  col.accessor('reason', { header: 'Reason', cell: (i) => <span className="text-xs font-medium text-primary-900">{i.getValue()}</span> }),
  col.accessor('object', { header: 'Object', cell: (i) => <span className="text-xs font-mono text-gray-600">{i.getValue()}</span> }),
  col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor('message', { header: 'Message', cell: (i) => <span className="text-xs text-gray-700 max-w-xs truncate block">{i.getValue()}</span> }),
  col.accessor('count', { header: 'Count', cell: (i) => <span className={cn('text-xs', i.getValue() > 1 ? 'text-orange-600 font-medium' : '')}>{i.getValue()}</span> }),
  col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

export function Events() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<EventSummary[]>([])
  const [filter, setFilter] = useState<'all' | 'Warning' | 'Normal'>('all')
  const [sorting, setSorting] = useState<SortingState>([])

  const load = useCallback(() => {
    fetchEvents(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const filtered = filter === 'all' ? items : items.filter((e) => e.type === filter)

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const warningCount = items.filter((e) => e.type === 'Warning').length

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Events</h1>
          <p className="text-[11px] text-primary-500">
            {items.length} events{warningCount > 0 ? ` · ${warningCount} warnings` : ''}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {(['all', 'Warning', 'Normal'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('text-xs px-2 py-1 rounded border transition-colors',
                filter === f ? 'bg-primary-600 text-white border-primary-600' : 'text-primary-600 border-primary-200 hover:bg-primary-50'
              )}>
              {f === 'all' ? 'All' : f}
            </button>
          ))}
          <RefreshButton onRefresh={load} />
        </div>
      </div>

      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} onClick={h.column.getToggleSortingHandler()}
                    className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider cursor-pointer">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className={cn('border-t border-primary-50 hover:bg-primary-50/50',
                row.original.type === 'Warning' ? 'bg-red-50/20' : '')}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

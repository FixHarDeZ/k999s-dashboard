import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { fetchHelmReleases, uninstallHelmRelease } from '@/lib/api'
import { ConfirmModal } from '@/components/ConfirmModal'
import type { HelmReleaseSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const col = createColumnHelper<HelmReleaseSummary>()

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'deployed' ? 'text-green-600 bg-green-50' :
    status === 'failed' ? 'text-red-600 bg-red-50' :
    status.startsWith('pending') ? 'text-yellow-600 bg-yellow-50' :
    status === 'uninstalling' ? 'text-orange-600 bg-orange-50' :
    'text-gray-600 bg-gray-50'
  return <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', color)}>{status}</span>
}

export function Helm() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<HelmReleaseSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<HelmReleaseSummary | null>(null)

  const load = useCallback(() => {
    fetchHelmReleases(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const handleConfirm = async () => {
    if (!confirmTarget) return
    const target = confirmTarget
    setConfirmTarget(null)
    await uninstallHelmRelease(target.namespace, target.name).catch(console.error)
    load()
  }

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('chart', { header: 'Chart', cell: (i) => <span className="text-xs font-mono text-gray-700">{i.getValue()}</span> }),
    col.accessor('appVersion', { header: 'App Version', cell: (i) => <span className="text-xs font-mono text-gray-600">{i.getValue()}</span> }),
    col.accessor('status', { header: 'Status', cell: (i) => <StatusBadge status={i.getValue()} /> }),
    col.accessor('revision', { header: 'Rev', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('updated', { header: 'Updated', cell: (i) => <span className="text-xs text-gray-400">{i.getValue().split('.')[0]}</span> }),
    col.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={() => setConfirmTarget(row.original)}
          className="text-xs px-2 py-0.5 rounded text-red-600 hover:bg-red-50"
        >
          Delete
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
          <h1 className="text-base font-bold text-primary-900">Helm Releases</h1>
          <p className="text-[11px] text-primary-500">{items.length} releases</p>
        </div>
        <div className="flex gap-2 items-center">
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
        {items.length === 0 && (
          <div className="text-center py-8 text-xs text-primary-400">No Helm releases found</div>
        )}
      </div>
      {confirmTarget && (
        <ConfirmModal
          title={`Delete release "${confirmTarget.name}"?`}
          message={`This will run helm uninstall ${confirmTarget.name} -n ${confirmTarget.namespace}. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  )
}

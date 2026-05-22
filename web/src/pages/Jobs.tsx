import { RefreshButton } from '@/components/RefreshButton'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { FileCode2, Trash2 } from 'lucide-react'
import { fetchJobs, deleteJob } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { JobSummary } from '@/lib/types'

const col = createColumnHelper<JobSummary>()

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'Complete' ? 'text-green-600 bg-green-50' :
    status === 'Failed' ? 'text-red-600 bg-red-50' :
    'text-blue-600 bg-blue-50'
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`}>{status}</span>
}

export function Jobs() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<JobSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [yamlTarget, setYamlTarget] = useState<JobSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JobSummary | null>(null)

  const load = useCallback(() => {
    fetchJobs(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteTarget(null)
    await deleteJob(deleteTarget.namespace, deleteTarget.name).catch(console.error)
    load()
  }

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('completions', { header: 'Completions', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('status', { header: 'Status', cell: (i) => <StatusBadge status={i.getValue()} /> }),
    col.accessor('duration', { header: 'Duration', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button onClick={() => setYamlTarget(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded" title="View/Edit YAML"><FileCode2 size={13} /></button>
          <button onClick={() => setDeleteTarget(row.original)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Delete"><Trash2 size={13} /></button>
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
          <h1 className="text-base font-bold text-primary-900">Jobs</h1>
          <p className="text-[11px] text-primary-500">{items.length} jobs</p>
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
      {yamlTarget && (
        <YamlSidePanel group="batch" version="v1" resource="jobs" namespace={yamlTarget.namespace} name={yamlTarget.name} onClose={() => setYamlTarget(null)} editable />
      )}
      {deleteTarget && (
        <ConfirmModal
          title={`Delete job "${deleteTarget.name}"?`}
          message="This will delete the Job and its associated pods."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

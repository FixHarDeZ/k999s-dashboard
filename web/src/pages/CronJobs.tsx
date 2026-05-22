import { RefreshButton } from '@/components/RefreshButton'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { FileCode2, Play, Trash2 } from 'lucide-react'
import { fetchCronJobs, deleteCronJob, triggerCronJob } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { CronJobSummary } from '@/lib/types'

const col = createColumnHelper<CronJobSummary>()

export function CronJobs() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<CronJobSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [yamlTarget, setYamlTarget] = useState<CronJobSummary | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'trigger'; item: CronJobSummary } | null>(null)

  const load = useCallback(() => {
    fetchCronJobs(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const handleConfirm = async () => {
    if (!confirmAction) return
    const { type, item } = confirmAction
    setConfirmAction(null)
    if (type === 'delete') {
      await deleteCronJob(item.namespace, item.name).catch(console.error)
    } else {
      await triggerCronJob(item.namespace, item.name).catch(console.error)
    }
    load()
  }

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('schedule', { header: 'Schedule', cell: (i) => <span className="text-xs font-mono">{i.getValue()}</span> }),
    col.accessor('suspend', {
      header: 'Status',
      cell: (i) => (
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${i.getValue() ? 'text-yellow-700 bg-yellow-50' : 'text-green-600 bg-green-50'}`}>
          {i.getValue() ? 'Suspended' : 'Active'}
        </span>
      ),
    }),
    col.accessor('active', { header: 'Running', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('lastSchedule', { header: 'Last Schedule', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button onClick={() => setYamlTarget(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded" title="View/Edit YAML"><FileCode2 size={13} /></button>
          <button onClick={() => setConfirmAction({ type: 'trigger', item: row.original })} className="p-1 text-green-600 hover:bg-green-50 rounded" title="Trigger Now"><Play size={13} /></button>
          <button onClick={() => setConfirmAction({ type: 'delete', item: row.original })} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Delete"><Trash2 size={13} /></button>
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
          <h1 className="text-base font-bold text-primary-900">CronJobs</h1>
          <p className="text-[11px] text-primary-500">{items.length} cronjobs</p>
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
        <YamlSidePanel group="batch" version="v1" resource="cronjobs" namespace={yamlTarget.namespace} name={yamlTarget.name} onClose={() => setYamlTarget(null)} editable />
      )}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.type === 'delete' ? `Delete cronjob "${confirmAction.item.name}"?` : `Trigger "${confirmAction.item.name}" now?`}
          message={confirmAction.type === 'delete' ? 'This will delete the CronJob.' : "This will create a new Job immediately from this CronJob's template."}
          confirmLabel={confirmAction.type === 'delete' ? 'Delete' : 'Trigger'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}

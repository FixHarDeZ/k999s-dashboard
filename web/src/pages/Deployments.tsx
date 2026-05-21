import { RefreshButton } from '@/components/RefreshButton'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { FileCode2 } from 'lucide-react'
import { fetchDeployments, scaleDeployment, rolloutRestartDeployment, deleteDeployment } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { DeploymentSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const columnHelper = createColumnHelper<DeploymentSummary>()

export function Deployments() {
  const outletContext = useOutletContext<{ namespace: string } | null>()
  const namespace = outletContext?.namespace ?? ''
  const [items, setItems] = useState<DeploymentSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [scaleTarget, setScaleTarget] = useState<DeploymentSummary | null>(null)
  const [scaleValue, setScaleValue] = useState(1)
  const [yamlTarget, setYamlTarget] = useState<DeploymentSummary | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'restart'; deployment: DeploymentSummary } | null>(null)

  const load = useCallback(() => {
    fetchDeployments(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => {
    load()
  }, [load])

  const handleScale = async () => {
    if (!scaleTarget) return
    await scaleDeployment(scaleTarget.namespace, scaleTarget.name, scaleValue).catch(console.error)
    setScaleTarget(null)
    load()
  }

  const handleConfirm = async () => {
    if (!confirmAction) return
    const { type, deployment } = confirmAction
    setConfirmAction(null)
    if (type === 'delete') {
      await deleteDeployment(deployment.namespace, deployment.name).catch(console.error)
    } else {
      await rolloutRestartDeployment(deployment.namespace, deployment.name).catch(console.error)
    }
    load()
  }

  const columns = [
    columnHelper.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    columnHelper.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    columnHelper.accessor('ready', { header: 'Ready', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    columnHelper.accessor('upToDate', { header: 'Up-to-date', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    columnHelper.accessor('available', { header: 'Available', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    columnHelper.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button
            onClick={() => {
              setScaleTarget(row.original)
              setScaleValue(parseInt(row.original.ready.split('/')[1] || '1'))
            }}
            className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs">⚖️ Scale</button>
          <button
            onClick={() => setConfirmAction({ type: 'restart', deployment: row.original })}
            className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs">↻ Restart</button>
          <button
            onClick={() => setYamlTarget(row.original)}
            className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs"
            title="View/Edit YAML"
          >
            <FileCode2 size={11} />
          </button>
          <button
            onClick={() => setConfirmAction({ type: 'delete', deployment: row.original })}
            className="p-1 text-red-500 hover:bg-red-50 rounded text-xs">🗑 Delete</button>
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
          <h1 className="text-base font-bold text-primary-900">Deployments</h1>
          <p className="text-[11px] text-primary-500">{items.length} deployments</p>
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

      {scaleTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-72">
            <h3 className="font-bold text-sm text-primary-900 mb-3">Scale: {scaleTarget.name}</h3>
            <label className="text-xs text-gray-600 block mb-1">Replicas</label>
            <input
              type="number"
              min={0}
              max={50}
              value={scaleValue}
              onChange={(e) => setScaleValue(parseInt(e.target.value))}
              className="border border-primary-200 rounded px-3 py-1.5 text-sm w-full mb-4 outline-none focus:border-primary-400"
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setScaleTarget(null)} className="text-xs px-3 py-1.5 rounded border border-gray-200">Cancel</button>
              <button onClick={handleScale} className="text-xs px-3 py-1.5 rounded bg-primary-600 text-white">Apply</button>
            </div>
          </div>
        </div>
      )}

      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
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
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={cn('border-t border-primary-50 hover:bg-primary-50/50 transition-colors')}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
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
          resource="deployments"
          namespace={yamlTarget.namespace}
          name={yamlTarget.name}
          onClose={() => setYamlTarget(null)}
          editable
        />
      )}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.type === 'delete' ? `Delete deployment "${confirmAction.deployment.name}"?` : `Rollout restart "${confirmAction.deployment.name}"?`}
          message="This action cannot be undone."
          confirmLabel={confirmAction.type === 'delete' ? 'Delete' : 'Restart'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}

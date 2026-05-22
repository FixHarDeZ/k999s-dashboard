import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { fetchNodes, cordonNode, uncordonNode, drainNode, fetchNodeMetrics } from '@/lib/api'
import { ConfirmModal } from '@/components/ConfirmModal'
import type { NodeSummary, NodeMetricsSummary } from '@/lib/types'
import { cn } from '@/lib/utils'
import { parseMillicores, parseMiB, pct } from '@/lib/resourceUtils'

const col = createColumnHelper<NodeSummary>()

export function Nodes() {
  const [items, setItems] = useState<NodeSummary[]>([])
  const [nodeMetrics, setNodeMetrics] = useState<NodeMetricsSummary[]>([])
  const [confirmAction, setConfirmAction] = useState<{ type: 'cordon' | 'uncordon' | 'drain'; node: NodeSummary } | null>(null)

  const load = useCallback(() => {
    Promise.all([
      fetchNodes(),
      fetchNodeMetrics().catch(() => [] as NodeMetricsSummary[]),
    ]).then(([nodes, metrics]) => {
      setItems(nodes)
      setNodeMetrics(metrics)
    }).catch(console.error)
  }, [])
  useEffect(() => { load() }, [load])

  const handleConfirm = async () => {
    if (!confirmAction) return
    const { type, node } = confirmAction
    setConfirmAction(null)
    if (type === 'cordon') {
      await cordonNode(node.name).catch(console.error)
    } else if (type === 'uncordon') {
      await uncordonNode(node.name).catch(console.error)
    } else {
      await drainNode(node.name).catch(console.error)
    }
    load()
  }

  const metricsMap = new Map(nodeMetrics.map(m => [m.name, m]))

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('status', { header: 'Status', cell: (i) => <span className={cn('text-xs font-medium', i.getValue() === 'Ready' ? 'text-green-600' : 'text-red-600')}>● {i.getValue()}</span> }),
    col.accessor('schedulable', { header: 'Schedulable', cell: (i) => <span className={cn('text-xs font-medium', i.getValue() ? 'text-green-600' : 'text-yellow-600')}>{i.getValue() ? 'Yes' : 'Cordoned'}</span> }),
    col.accessor('roles', { header: 'Roles', cell: (i) => <span className="text-xs text-gray-600">{i.getValue()}</span> }),
    col.accessor('version', { header: 'Version', cell: (i) => <span className="text-xs font-mono text-gray-600">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'cpu',
      header: 'CPU',
      cell: ({ row }) => {
        const m = metricsMap.get(row.original.name)
        return <span className="text-xs font-mono text-gray-700">{m?.cpu ?? '—'}</span>
      },
    }),
    col.display({
      id: 'cpuA',
      header: '%CPU/A',
      cell: ({ row }) => {
        const m = metricsMap.get(row.original.name)
        return <span className="text-xs text-gray-500">{pct(m?.cpu ?? '—', row.original.cpuAllocatable, parseMillicores)}</span>
      },
    }),
    col.display({
      id: 'mem',
      header: 'MEM',
      cell: ({ row }) => {
        const m = metricsMap.get(row.original.name)
        return <span className="text-xs font-mono text-gray-700">{m?.memory ?? '—'}</span>
      },
    }),
    col.display({
      id: 'memA',
      header: '%MEM/A',
      cell: ({ row }) => {
        const m = metricsMap.get(row.original.name)
        return <span className="text-xs text-gray-500">{pct(m?.memory ?? '—', row.original.memAllocatable, parseMiB)}</span>
      },
    }),
    col.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          {row.original.schedulable ? (
            <button
              onClick={() => setConfirmAction({ type: 'cordon', node: row.original })}
              className="p-1 text-yellow-600 hover:bg-yellow-50 rounded text-xs"
            >
              Cordon
            </button>
          ) : (
            <button
              onClick={() => setConfirmAction({ type: 'uncordon', node: row.original })}
              className="p-1 text-green-600 hover:bg-green-50 rounded text-xs"
            >
              Uncordon
            </button>
          )}
          <button
            onClick={() => setConfirmAction({ type: 'drain', node: row.original })}
            className="p-1 text-red-500 hover:bg-red-50 rounded text-xs"
          >
            Drain
          </button>
        </div>
      ),
    }),
  ]

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">Nodes</h1><p className="text-[11px] text-primary-500">{items.length} nodes</p></div>
        <RefreshButton onRefresh={load} />
      </div>
      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">{table.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map(row => <tr key={row.id} className="border-t border-primary-50 hover:bg-primary-50/50">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {confirmAction && (
        <ConfirmModal
          title={
            confirmAction.type === 'cordon'
              ? `Cordon node "${confirmAction.node.name}"?`
              : confirmAction.type === 'uncordon'
              ? `Uncordon node "${confirmAction.node.name}"?`
              : `Drain node "${confirmAction.node.name}"?`
          }
          message={
            confirmAction.type === 'drain'
              ? 'This will cordon the node and delete all non-DaemonSet pods running on it.'
              : confirmAction.type === 'cordon'
              ? 'No new pods will be scheduled on this node.'
              : 'This node will become schedulable again.'
          }
          danger={confirmAction.type !== 'uncordon'}
          confirmLabel={confirmAction.type === 'cordon' ? 'Cordon' : confirmAction.type === 'uncordon' ? 'Uncordon' : 'Drain'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}

import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { fetchPodMetrics, fetchNodeMetrics } from '@/lib/api'
import type { PodMetricsSummary, NodeMetricsSummary } from '@/lib/types'

const podCol = createColumnHelper<PodMetricsSummary>()
const nodeCol = createColumnHelper<NodeMetricsSummary>()

function UsageBar({ value, max }: { value: number; max: number }) {
  const pct = Math.min(100, max > 0 ? (value / max) * 100 : 0)
  const color = pct > 80 ? '#ef4444' : pct > 60 ? '#f59e0b' : '#22c55e'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: '#e0e7ff', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3, transition: 'width 0.3s' }} />
      </div>
    </div>
  )
}

const parseCPU = (s: string) => parseInt(s.replace('m', '')) || 0

export function Top() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [podMetrics, setPodMetrics] = useState<PodMetricsSummary[]>([])
  const [nodeMetrics, setNodeMetrics] = useState<NodeMetricsSummary[]>([])
  const [noMetricsServer, setNoMetricsServer] = useState(false)
  const [podSorting, setPodSorting] = useState<SortingState>([{ id: 'cpu', desc: true }])

  const load = useCallback(() => {
    Promise.all([
      fetchPodMetrics(namespace).catch(() => { setNoMetricsServer(true); return [] as PodMetricsSummary[] }),
      fetchNodeMetrics().catch(() => [] as NodeMetricsSummary[]),
    ]).then(([pods, nodes]) => {
      setPodMetrics(pods)
      setNodeMetrics(nodes)
      if (pods.length > 0) setNoMetricsServer(false)
    })
  }, [namespace])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [load])

  const maxCPU = Math.max(...podMetrics.map(p => parseCPU(p.cpu)), 1)

  const podColumns = [
    podCol.accessor('name', { header: 'Pod', cell: (i) => <span className="text-xs font-medium text-primary-900">{i.getValue()}</span> }),
    podCol.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    podCol.accessor('cpu', {
      header: 'CPU',
      cell: (i) => (
        <div className="flex items-center gap-2 min-w-28">
          <span className="text-xs font-mono w-12">{i.getValue()}</span>
          <UsageBar value={parseCPU(i.getValue())} max={maxCPU} />
        </div>
      ),
    }),
    podCol.accessor('memory', { header: 'Memory', cell: (i) => <span className="text-xs font-mono">{i.getValue()}</span> }),
  ]

  const nodeColumns = [
    nodeCol.accessor('name', { header: 'Node', cell: (i) => <span className="text-xs font-medium text-primary-900">{i.getValue()}</span> }),
    nodeCol.accessor('cpu', { header: 'CPU', cell: (i) => <span className="text-xs font-mono">{i.getValue()}</span> }),
    nodeCol.accessor('memory', { header: 'Memory', cell: (i) => <span className="text-xs font-mono">{i.getValue()}</span> }),
  ]

  const podTable = useReactTable({ data: podMetrics, columns: podColumns, state: { sorting: podSorting }, onSortingChange: setPodSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() })
  const nodeTable = useReactTable({ data: nodeMetrics, columns: nodeColumns, getCoreRowModel: getCoreRowModel() })

  if (noMetricsServer && podMetrics.length === 0) {
    return (
      <div>
        <h1 className="text-base font-bold text-primary-900 mb-3">Top</h1>
        <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4 text-sm text-yellow-800">
          <strong>metrics-server not available</strong><br />
          Install with: <code className="bg-yellow-100 px-1 rounded text-xs">kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml</code>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-bold text-primary-900">Top</h1>
          <p className="text-[11px] text-primary-500">Auto-refreshes every 15s</p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      {nodeMetrics.length > 0 && (
        <div className="mb-4">
          <h2 className="text-xs font-bold text-primary-700 uppercase tracking-wider mb-2">Nodes</h2>
          <div className="border border-primary-100 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-primary-50">{nodeTable.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
              <tbody>{nodeTable.getRowModel().rows.map(row => <tr key={row.id} className="border-t border-primary-50">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
            </table>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-xs font-bold text-primary-700 uppercase tracking-wider mb-2">Pods</h2>
        <div className="border border-primary-100 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-primary-50">{podTable.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th key={h.id} onClick={h.column.getToggleSortingHandler()} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider cursor-pointer">{flexRender(h.column.columnDef.header, h.getContext())}{h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}</th>)}</tr>)}</thead>
            <tbody>{podTable.getRowModel().rows.map(row => <tr key={row.id} className="border-t border-primary-50 hover:bg-primary-50/50">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

import { RefreshButton } from '@/components/RefreshButton'
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
import { RefreshCw, Trash2, Terminal, FileText, FileCode2 } from 'lucide-react'
import { fetchPods, deletePod, restartPod, fetchPodContainers } from '@/lib/api'
import { LogViewer } from '@/components/LogViewer'
import { ExecTerminal } from '@/components/ExecTerminal'
import { DiagnosticPanel } from '@/components/DiagnosticPanel'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { PodSummary, ContainerInfo } from '@/lib/types'
import { cn } from '@/lib/utils'

const columnHelper = createColumnHelper<PodSummary>()

const CONTAINER_TYPE_STYLE: Record<ContainerInfo['type'], { label: string; color: string; bg: string }> = {
  main:    { label: 'main',    color: '#4338ca', bg: '#eef2ff' },
  sidecar: { label: 'sidecar', color: '#7c3aed', bg: '#f5f3ff' },
  init:    { label: 'init',    color: '#4b5563', bg: '#f3f4f6' },
}

const CONTAINER_STATE_COLOR: Record<string, string> = {
  running:    '#16a34a',
  waiting:    '#d97706',
  terminated: '#dc2626',
  unknown:    '#9ca3af',
}

function ContainerChip({ c }: { c: ContainerInfo }) {
  const ts = CONTAINER_TYPE_STYLE[c.type] ?? CONTAINER_TYPE_STYLE.main
  const dotColor = CONTAINER_STATE_COLOR[c.state] ?? CONTAINER_STATE_COLOR.unknown
  const label = c.reason ? `${c.state}: ${c.reason}` : c.state
  return (
    <span className="inline-flex items-center gap-1 mr-2 mb-1">
      <span
        className="text-[10px] font-semibold rounded px-1 py-0.5"
        style={{ color: ts.color, background: ts.bg }}
      >
        {ts.label}
      </span>
      <span className="text-xs font-medium text-gray-700">{c.name}</span>
      <span className="text-xs" style={{ color: dotColor }}>●</span>
      <span className="text-[10px] text-gray-500">{label}</span>
    </span>
  )
}

function StatusBadge({ status }: { status: string }) {
  const isHealthy = status === 'Running' || status === 'Succeeded'
  const isError = ['CrashLoopBackOff', 'Error', 'OOMKilled', 'Failed'].includes(status)
  return (
    <span className={cn('text-xs font-medium', isHealthy ? 'text-green-600' : isError ? 'text-red-600' : 'text-yellow-600')}>
      ● {status}
    </span>
  )
}

export function Pods() {
  // Use empty string as default when no outlet context (e.g. in tests)
  const outletContext = useOutletContext<{ namespace: string } | null>()
  const namespace = outletContext?.namespace ?? ''
  const [pods, setPods] = useState<PodSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [logTarget, setLogTarget] = useState<{ pod: PodSummary; containers: string[] } | null>(null)
  const [execTarget, setExecTarget] = useState<{ pod: PodSummary; container: string } | null>(null)
  const [diagTarget, setDiagTarget] = useState<PodSummary | null>(null)
  const [expandedPod, setExpandedPod] = useState<string | null>(null)
  const [yamlTarget, setYamlTarget] = useState<PodSummary | null>(null)

  const handleOpenExec = async (pod: PodSummary) => {
    const containers = await fetchPodContainers(pod.namespace, pod.name).catch(() => [])
    setExecTarget({ pod, container: containers[0] ?? '' })
  }

  const handleOpenLogs = async (pod: PodSummary) => {
    const containers = await fetchPodContainers(pod.namespace, pod.name).catch(() => [pod.name])
    setLogTarget({ pod, containers })
  }

  const load = useCallback(() => {
    fetchPods(namespace).then(setPods).catch(console.error)
  }, [namespace])

  useEffect(() => {
    load()
  }, [load])

  useWebSocket((msg) => {
    if (msg.type === 'pods_update') {
      setPods(msg.data as PodSummary[])
    }
  })

  const handleDelete = async (pod: PodSummary) => {
    if (!confirm(`Delete pod ${pod.name}?`)) return
    await deletePod(pod.namespace, pod.name).catch(console.error)
    load()
  }

  const handleRestart = async (pod: PodSummary) => {
    if (!confirm(`Restart pod ${pod.name}?`)) return
    await restartPod(pod.namespace, pod.name).catch(console.error)
    load()
  }

  const columns = [
    columnHelper.accessor('name', {
      header: 'Name',
      cell: (i) => {
        const pod = i.row.original
        const isExpanded = expandedPod === pod.name
        return (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpandedPod(isExpanded ? null : pod.name)}
              className="text-[10px] text-gray-400 hover:text-primary-600 w-4 shrink-0"
              title={isExpanded ? 'Collapse' : 'Expand containers'}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
            <span className="font-medium text-primary-900 text-xs">{i.getValue()}</span>
          </div>
        )
      },
    }),
    columnHelper.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    columnHelper.accessor('status', { header: 'Status', cell: (i) => <StatusBadge status={i.getValue()} /> }),
    columnHelper.accessor('ready', { header: 'Ready', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    columnHelper.accessor('restarts', { header: 'Restarts', cell: (i) => <span className={cn('text-xs', i.getValue() > 0 ? 'text-red-500 font-medium' : '')}>{i.getValue()}</span> }),
    columnHelper.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button onClick={() => handleOpenLogs(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs flex items-center gap-1"><FileText size={11} />Logs</button>
          <button onClick={() => handleOpenExec(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs flex items-center gap-1"><Terminal size={11} />Exec</button>
          <button
            onClick={() => setDiagTarget(row.original)}
            className="p-1 text-yellow-600 hover:bg-yellow-50 rounded text-xs flex items-center gap-1"
            title="AI Diagnose"
          >
            🔍 AI
          </button>
          <button onClick={() => handleRestart(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs flex items-center gap-1"><RefreshCw size={11} />Restart</button>
          <button
            onClick={() => setYamlTarget(row.original)}
            className="p-1 text-primary-600 hover:bg-primary-50 rounded"
            title="View/Edit YAML"
          >
            <FileCode2 size={11} />
          </button>
          <button onClick={() => handleDelete(row.original)} className="p-1 text-red-500 hover:bg-red-50 rounded text-xs flex items-center gap-1"><Trash2 size={11} />Delete</button>
        </div>
      ),
    }),
  ]

  const table = useReactTable({
    data: pods,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const unhealthyCount = pods.filter(p => !['Running', 'Succeeded'].includes(p.status)).length

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Pods</h1>
          <p className="text-[11px] text-primary-500">{pods.length} pods{unhealthyCount > 0 ? ` · ${unhealthyCount} unhealthy` : ''}</p>
        </div>
        <div className="flex gap-2 items-center">
          <RefreshButton onRefresh={load} />
          <input
            placeholder="Filter pods..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-48"
          />
        </div>
      </div>

      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider cursor-pointer select-none" onClick={h.column.getToggleSortingHandler()}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => {
              const isExpanded = expandedPod === row.original.name
              const colSpan = row.getVisibleCells().length
              return (
                <>
                  <tr
                    key={row.id}
                    className={cn(
                      'border-t border-primary-50 hover:bg-primary-50/50 transition-colors',
                      ['CrashLoopBackOff', 'Error', 'Failed'].includes(row.original.status) ? 'bg-red-50/30' : '',
                    )}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                    ))}
                  </tr>
                  {isExpanded && (
                    <tr key={`${row.id}-containers`} className="border-t border-primary-50 bg-gray-50/60">
                      <td colSpan={colSpan} className="px-4 py-2">
                        <div className="flex flex-wrap items-center gap-x-0 gap-y-1">
                          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mr-2 shrink-0">Containers:</span>
                          {row.original.containers && row.original.containers.length > 0
                            ? row.original.containers.map((c) => <ContainerChip key={c.name} c={c} />)
                            : <span className="text-[10px] text-gray-400">No container info available</span>
                          }
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
      {logTarget && (
        <LogViewer
          namespace={logTarget.pod.namespace}
          podName={logTarget.pod.name}
          containers={logTarget.containers}
          onClose={() => setLogTarget(null)}
        />
      )}
      {execTarget && (
        <ExecTerminal
          namespace={execTarget.pod.namespace}
          podName={execTarget.pod.name}
          container={execTarget.container}
          onClose={() => setExecTarget(null)}
        />
      )}
      {diagTarget && (
        <DiagnosticPanel
          namespace={diagTarget.namespace}
          podName={diagTarget.name}
          onClose={() => setDiagTarget(null)}
        />
      )}
      {yamlTarget && (
        <YamlSidePanel
          group=""
          version="v1"
          resource="pods"
          namespace={yamlTarget.namespace}
          name={yamlTarget.name}
          onClose={() => setYamlTarget(null)}
          editable
        />
      )}
    </div>
  )
}

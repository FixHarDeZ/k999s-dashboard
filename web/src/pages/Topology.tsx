import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import { fetchTopology, fetchResourceGet } from '@/lib/api'
import type { TopologyGraph } from '@/lib/types'
import { DiagnosticPanel } from '@/components/DiagnosticPanel'

const NODE_WIDTH = 160
const NODE_HEIGHT = 60

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 60 })
  g.setDefaultEdgeLabel(() => ({}))
  nodes.forEach((n) => g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT }))
  edges.forEach((e) => g.setEdge(e.source, e.target))
  dagre.layout(g)
  return nodes.map((n) => {
    const pos = g.node(n.id)
    return { ...n, position: { x: pos.x - NODE_WIDTH / 2, y: pos.y - NODE_HEIGHT / 2 } }
  })
}

const KIND_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  Ingress:    { bg: '#faf5ff', border: '#a855f7', text: '#7c3aed' },
  Service:    { bg: '#eff6ff', border: '#3b82f6', text: '#1d4ed8' },
  Deployment: { bg: '#eef2ff', border: '#6366f1', text: '#4338ca' },
  Pod:        { bg: '#f0fdf4', border: '#22c55e', text: '#15803d' },
}

const KIND_ICONS: Record<string, string> = {
  Ingress: '🌐', Service: '⚙️', Deployment: '🚀', Pod: '📦',
}

const ERROR_STATUSES = ['Failed', 'Error', 'CrashLoopBackOff', 'Unknown', 'OOMKilled', 'Evicted']

function isErrorNode(status: string): boolean {
  return ERROR_STATUSES.some((s) => status.includes(s))
}

function getNodeStyle(kind: string, status: string) {
  const colors = KIND_COLORS[kind] ?? { bg: '#f9fafb', border: '#9ca3af', text: '#374151' }
  const hasError = isErrorNode(status)
  return {
    background: hasError ? '#fef2f2' : colors.bg,
    border: `2px solid ${hasError ? '#ef4444' : colors.border}`,
    color: hasError ? '#dc2626' : colors.text,
    borderRadius: 8,
    padding: '8px 12px',
    fontSize: 11,
    fontFamily: 'system-ui',
    width: NODE_WIDTH,
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
  }
}

function buildFlowElements(graph: TopologyGraph) {
  const rfNodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: 'default',
    position: { x: 0, y: 0 },
    style: getNodeStyle(n.kind, n.status),
    data: {
      label: (
        <div>
          <div style={{ fontWeight: 700, marginBottom: 2 }}>
            {KIND_ICONS[n.kind] ?? '▪'} {n.name}
          </div>
          <div style={{ opacity: 0.7, fontSize: 10 }}>{n.status}</div>
        </div>
      ),
      raw: n,
    },
  }))

  const rfEdges: Edge[] = graph.edges.map((e, i) => ({
    id: `e-${i}`,
    source: e.source,
    target: e.target,
    label: e.label,
    labelStyle: { fontSize: 9, fill: '#9ca3af' },
    style: { stroke: '#c7d2fe', strokeWidth: 1.5 },
    markerEnd: { type: MarkerType.ArrowClosed, color: '#c7d2fe', width: 12, height: 12 },
  }))

  const laid = applyDagreLayout(rfNodes, rfEdges)
  return { nodes: laid, edges: rfEdges }
}

interface ContainerStatus {
  name: string
  ready?: boolean
  restartCount?: number
  state?: {
    waiting?: { reason?: string }
    running?: { startedAt?: string }
    terminated?: { reason?: string; exitCode?: number }
  }
}

function NodeDetail({
  node,
  onClose,
  onDiagnose,
}: {
  node: TopologyGraph['nodes'][0]
  onClose: () => void
  onDiagnose?: (ns: string, name: string) => void
}) {
  const [podDetail, setPodDetail] = useState<Record<string, unknown> | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const isPodError = node.kind === 'Pod' && isErrorNode(node.status)

  useEffect(() => {
    if (!isPodError) return
    setLoadingDetail(true)
    fetchResourceGet('', 'v1', 'pods', node.namespace, node.name)
      .then((jsonStr) => {
        try {
          setPodDetail(JSON.parse(jsonStr) as Record<string, unknown>)
        } catch {
          setPodDetail(null)
        }
      })
      .catch(() => setPodDetail(null))
      .finally(() => setLoadingDetail(false))
  }, [isPodError, node.namespace, node.name])

  const containerStatuses: ContainerStatus[] = (() => {
    try {
      const status = (podDetail?.status as Record<string, unknown> | undefined)
      return (status?.containerStatuses as ContainerStatus[] | undefined) ?? []
    } catch {
      return []
    }
  })()

  function containerStateLabel(cs: ContainerStatus): string {
    if (cs.state?.waiting?.reason) return cs.state.waiting.reason
    if (cs.state?.terminated?.reason) return cs.state.terminated.reason
    if (cs.state?.running) return 'Running'
    return 'Unknown'
  }

  function containerStateColor(cs: ContainerStatus): string {
    const label = containerStateLabel(cs)
    if (label === 'Running') return '#22c55e'
    if (isErrorNode(label)) return '#ef4444'
    return '#f59e0b'
  }

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, width: 280, zIndex: 10,
      background: '#fff', border: '1px solid #e0e7ff', borderRadius: 10,
      boxShadow: '0 4px 20px rgba(79,70,229,0.12)', padding: 14, fontSize: 11,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontWeight: 700, color: '#1e1b4b', fontSize: 13 }}>
          {KIND_ICONS[node.kind] ?? '▪'} {node.name}
        </span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 16 }}>✕</button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        {([
          ['Kind', node.kind],
          ['Namespace', node.namespace],
          ['Status', node.status],
          ...Object.entries(node.labels ?? {}).slice(0, 4).map(([k, v]) => [k, v]),
        ] as [string, string][]).map(([k, v]) => (
          <tr key={k} style={{ borderBottom: '1px solid #f3f4f6' }}>
            <td style={{ color: '#6b7280', padding: '4px 0', fontWeight: 600, width: '40%' }}>{k}</td>
            <td style={{ color: '#111827', padding: '4px 0', wordBreak: 'break-all' }}>{v}</td>
          </tr>
        ))}
      </table>

      {isPodError && (
        <div style={{ marginTop: 10 }}>
          {loadingDetail ? (
            <div style={{ color: '#9ca3af', fontSize: 10 }}>Loading container details...</div>
          ) : containerStatuses.length > 0 ? (
            <div>
              <div style={{ fontWeight: 600, color: '#374151', marginBottom: 4 }}>Containers:</div>
              {containerStatuses.map((cs) => (
                <div key={cs.name} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 2 }}>
                  <span style={{ color: containerStateColor(cs) }}>●</span>
                  <span style={{ color: '#374151', fontWeight: 600 }}>{cs.name}:</span>
                  <span style={{ color: containerStateColor(cs) }}>{containerStateLabel(cs)}</span>
                  {(cs.restartCount ?? 0) > 0 && (
                    <span style={{ color: '#9ca3af' }}>(restarts: {cs.restartCount})</span>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {onDiagnose && (
            <button
              onClick={() => onDiagnose(node.namespace, node.name)}
              style={{
                marginTop: 8,
                background: '#7c3aed',
                color: 'white',
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: 10,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              🔍 AI Diagnose
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export function Topology() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [graph, setGraph] = useState<TopologyGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedNode, setSelectedNode] = useState<TopologyGraph['nodes'][0] | null>(null)
  const [diagTarget, setDiagTarget] = useState<{ namespace: string; name: string } | null>(null)

  const isAllNamespaces = namespace === ''
  const [confirmed, setConfirmed] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    setConfirmed(false)
    setCancelled(false)
  }, [namespace])

  const load = useCallback(() => {
    setLoading(true)
    setError(null)
    fetchTopology(namespace)
      .then(setGraph)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        setError(msg)
        setGraph(null)
      })
      .finally(() => setLoading(false))
  }, [namespace])

  useEffect(() => {
    if (isAllNamespaces && !confirmed) return
    load()
  }, [load, isAllNamespaces, confirmed])

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] }
    try {
      return buildFlowElements(graph)
    } catch {
      return { nodes: [], edges: [] }
    }
  }, [graph])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    if (!graph) return
    try {
      const { nodes: n, edges: e } = buildFlowElements(graph)
      setNodes(n)
      setEdges(e)
    } catch {
      setNodes([])
      setEdges([])
    }
  }, [graph, setNodes, setEdges])

  if (isAllNamespaces && cancelled) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-sm font-medium text-primary-600">เลือก namespace ก่อนใช้ Topology</p>
        <p className="text-xs text-primary-400">ใช้ dropdown ด้านบนเพื่อเลือก namespace</p>
      </div>
    )
  }

  if (isAllNamespaces && !confirmed) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="bg-white border border-yellow-200 rounded-xl shadow-xl p-6 w-80">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-2xl">⚠️</span>
            <h3 className="font-bold text-sm text-primary-900">All Namespaces — ข้อมูลอาจเยอะมาก</h3>
          </div>
          <p className="text-xs text-gray-600 mb-4">
            การโหลด topology ทุก namespace พร้อมกันอาจทำให้ graph แสดงผลช้าหรือ layout ซับซ้อนจนอ่านยาก
            แนะนำให้เลือก namespace เฉพาะก่อน
          </p>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setCancelled(true)}
              className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              ยกเลิก
            </button>
            <button
              onClick={() => setConfirmed(true)}
              className="text-xs px-3 py-1.5 rounded bg-yellow-500 text-white hover:bg-yellow-600"
            >
              โหลดทั้งหมด
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{ height: 'calc(100vh - 100px)', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 className="text-base font-bold text-primary-900">Topology</h1>
          <p className="text-[11px] text-primary-500">
            {graph ? `${graph.nodes.length} resources · ${graph.edges.length} connections` : 'Loading...'}
            {' · namespace: '}{namespace || 'all namespaces'}
          </p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64 text-primary-500 text-sm">
          Loading topology...
        </div>
      )}

      {!loading && error && (
        <div style={{
          background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8,
          padding: '12px 16px', color: '#dc2626', fontSize: 13, marginTop: 8,
        }}>
          <strong>Error loading topology:</strong> {error}
        </div>
      )}

      {!loading && !error && graph && graph.nodes.length === 0 && (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          No resources found in namespace "{namespace || 'default'}"
        </div>
      )}

      {!loading && !error && graph && graph.nodes.length > 0 && (
        <div style={{ height: 'calc(100% - 50px)', border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={(_, node) => setSelectedNode(node.data.raw as TopologyGraph['nodes'][0])}
            fitView
            fitViewOptions={{ padding: 0.2 }}
          >
            <Background color="#e0e7ff" gap={20} />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const kind = (n.data?.raw as TopologyGraph['nodes'][0])?.kind ?? ''
                return KIND_COLORS[kind]?.border ?? '#9ca3af'
              }}
              style={{ border: '1px solid #e0e7ff', borderRadius: 6 }}
            />
          </ReactFlow>

          {selectedNode && (
            <NodeDetail
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              onDiagnose={(ns, name) => {
                setDiagTarget({ namespace: ns, name })
                setSelectedNode(null)
              }}
            />
          )}
        </div>
      )}

      {diagTarget && (
        <DiagnosticPanel
          namespace={diagTarget.namespace}
          podName={diagTarget.name}
          onClose={() => setDiagTarget(null)}
        />
      )}
    </div>
  )
}

import { useEffect, useState, useCallback, useMemo } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  ReactFlow, Background, Controls, MiniMap,
  useNodesState, useEdgesState,
  type Node, type Edge, MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from 'dagre'
import { fetchTopology } from '@/lib/api'
import type { TopologyGraph } from '@/lib/types'

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

function getNodeStyle(kind: string, status: string) {
  const colors = KIND_COLORS[kind] ?? { bg: '#f9fafb', border: '#9ca3af', text: '#374151' }
  const isError = ['Failed', 'Error', 'CrashLoopBackOff', 'Unknown'].some((s) => status.includes(s))
  return {
    background: isError ? '#fef2f2' : colors.bg,
    border: `2px solid ${isError ? '#ef4444' : colors.border}`,
    color: isError ? '#dc2626' : colors.text,
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

function NodeDetail({ node, onClose }: { node: TopologyGraph['nodes'][0]; onClose: () => void }) {
  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, width: 260, zIndex: 10,
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
    </div>
  )
}

export function Topology() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace || 'default'
  const [graph, setGraph] = useState<TopologyGraph | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<TopologyGraph['nodes'][0] | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetchTopology(namespace)
      .then(setGraph)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [namespace])

  useEffect(() => { load() }, [load])

  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    if (!graph) return { nodes: [], edges: [] }
    return buildFlowElements(graph)
  }, [graph])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  useEffect(() => {
    if (!graph) return
    const { nodes: n, edges: e } = buildFlowElements(graph)
    setNodes(n)
    setEdges(e)
  }, [graph, setNodes, setEdges])

  return (
    <div style={{ height: 'calc(100vh - 100px)', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div>
          <h1 className="text-base font-bold text-primary-900">Topology</h1>
          <p className="text-[11px] text-primary-500">
            {graph ? `${graph.nodes.length} resources · ${graph.edges.length} connections` : 'Loading...'}
            {' · namespace: '}{namespace || 'default'}
          </p>
        </div>
        <button onClick={load} className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-primary-200">↻ Refresh</button>
      </div>

      {loading && (
        <div className="flex items-center justify-center h-64 text-primary-500 text-sm">
          Loading topology...
        </div>
      )}

      {!loading && graph && graph.nodes.length === 0 && (
        <div className="flex items-center justify-center h-64 text-gray-400 text-sm">
          No resources found in namespace "{namespace || 'default'}"
        </div>
      )}

      {!loading && graph && graph.nodes.length > 0 && (
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
            <NodeDetail node={selectedNode} onClose={() => setSelectedNode(null)} />
          )}
        </div>
      )}
    </div>
  )
}

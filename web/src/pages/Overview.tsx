import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { fetchNodes, fetchPods, fetchEvents, fetchNamespaceSummaries } from '@/lib/api'
import type { NodeSummary, PodSummary, EventSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const UNHEALTHY_STATUSES = ['CrashLoopBackOff', 'Error', 'OOMKilled', 'Failed', 'ImagePullBackOff', 'ErrImagePull']

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e0e7ff', borderRadius: 10,
      padding: 16, minWidth: 120,
    }}>
      <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? '#1e1b4b' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function Overview() {
  const [nodes, setNodes] = useState<NodeSummary[]>([])
  const [pods, setPods] = useState<PodSummary[]>([])
  const [events, setEvents] = useState<EventSummary[]>([])
  const [nsCount, setNsCount] = useState(0)

  const load = useCallback(() => {
    fetchNodes().then(setNodes).catch(console.error)
    fetchPods('').then(setPods).catch(console.error)
    fetchEvents('').then((evts) => {
      setEvents(evts.filter((e) => e.type === 'Warning').slice(0, 10))
    }).catch(console.error)
    fetchNamespaceSummaries().then((ns) => setNsCount(ns.length)).catch(console.error)
  }, [])

  useEffect(() => { load() }, [load])

  const readyNodes = nodes.filter((n) => n.status === 'Ready').length
  const unhealthyPods = pods.filter((p) => UNHEALTHY_STATUSES.some((s) => p.status.includes(s)))
  const runningPods = pods.filter((p) => p.status === 'Running').length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-base font-bold text-primary-900">Cluster Overview</h1>
        <RefreshButton onRefresh={load} />
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Nodes" value={`${readyNodes}/${nodes.length}`}
          sub="Ready" color={readyNodes < nodes.length ? '#dc2626' : '#16a34a'} />
        <StatCard label="Running Pods" value={runningPods} sub={`of ${pods.length} total`} />
        <StatCard label="Unhealthy Pods" value={unhealthyPods.length}
          color={unhealthyPods.length > 0 ? '#dc2626' : '#16a34a'} />
        <StatCard label="Namespaces" value={nsCount} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Unhealthy pods */}
        <div style={{ border: '1px solid #fecaca', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#fef2f2', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>⚠ Unhealthy Pods ({unhealthyPods.length})</span>
            <Link to="/pods" style={{ fontSize: 10, color: '#6366f1', textDecoration: 'none' }}>View All →</Link>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {unhealthyPods.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12, color: '#16a34a', textAlign: 'center' }}>✓ All pods healthy</div>
            ) : (
              unhealthyPods.map((pod) => (
                <div key={`${pod.namespace}/${pod.name}`} style={{
                  padding: '8px 14px', borderBottom: '1px solid #fee2e2',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1e1b4b' }}>{pod.name}</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{pod.namespace}</div>
                  </div>
                  <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', 'bg-red-50 text-red-600')}>
                    {pod.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Warning events */}
        <div style={{ border: '1px solid #fde68a', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#fffbeb', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>⚡ Recent Warnings ({events.length})</span>
            <Link to="/events" style={{ fontSize: 10, color: '#6366f1', textDecoration: 'none' }}>View All →</Link>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {events.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12, color: '#16a34a', textAlign: 'center' }}>✓ No recent warnings</div>
            ) : (
              events.map((evt) => (
                <div key={evt.name} style={{ padding: '7px 14px', borderBottom: '1px solid #fef3c7' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>{evt.reason}</div>
                  <div style={{ fontSize: 10, color: '#78716c' }}>{evt.object} · {evt.namespace}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.message}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Node list */}
        <div style={{ border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#f0f4ff', padding: '8px 14px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#4338ca' }}>🖥 Nodes ({nodes.length})</span>
            <Link to="/nodes" style={{ fontSize: 10, color: '#6366f1', textDecoration: 'none' }}>View All →</Link>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {nodes.map((node) => (
              <div key={node.name} style={{ padding: '7px 14px', borderBottom: '1px solid #e0e7ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#1e1b4b', fontWeight: 500 }}>{node.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: node.status === 'Ready' ? '#16a34a' : '#dc2626' }}>
                  ● {node.status}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}

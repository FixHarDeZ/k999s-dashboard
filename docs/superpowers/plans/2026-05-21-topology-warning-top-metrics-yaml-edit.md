# Topology Warning + Top Metrics + YAML Edit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add All-Namespace Topology modal warning, session rolling min/max to Top page, editable YAML slide-over to all sidebar pages, and implement StatefulSets page from scratch.

**Architecture:** Go backend adds StatefulSets list endpoint (mirrors Deployments pattern). Frontend extends `YamlSidePanel` with an optional `editable` prop that wires to the existing `applyResource` API. Topology and Top pages get purely client-side changes. All 6 existing sidebar pages add a YAML icon button using the extended panel.

**Tech Stack:** Go (k8s.io client-go), TypeScript, React, TanStack Table, js-yaml, lucide-react, Tailwind v4

---

## File Map

| File | Change |
|---|---|
| `internal/k8s/types.go` | Add `StatefulSetSummary` struct |
| `internal/k8s/client.go` | Add `ListStatefulSets` + `toStatefulSetSummary` |
| `internal/k8s/statefulsets_test.go` | **Create** — tests for ListStatefulSets |
| `internal/api/handlers.go` | Add `handleListStatefulSets` |
| `internal/api/router.go` | Add `GET /api/v1/statefulsets` route |
| `internal/api/handlers_test.go` | Add `TestGetStatefulSets_ReturnsList` |
| `web/src/lib/types.ts` | Add `StatefulSetSummary` interface |
| `web/src/lib/api.ts` | Add `fetchStatefulSets` |
| `web/src/pages/Topology.tsx` | Add All-Namespace modal guard |
| `web/src/pages/Top.tsx` | Add rolling min/max tracking + display |
| `web/src/components/YamlSidePanel.tsx` | Add `editable` prop + edit mode |
| `web/src/pages/StatefulSets.tsx` | **Create** — full table page |
| `web/src/App.tsx` | Replace Placeholder with StatefulSets |
| `web/src/pages/Pods.tsx` | Add YAML button to actions column |
| `web/src/pages/Deployments.tsx` | Add YAML button to actions column |
| `web/src/pages/Services.tsx` | Add YAML button (columns moved inside component) |
| `web/src/pages/ConfigMaps.tsx` | Add YAML button (columns moved inside component) |
| `web/src/pages/Secrets.tsx` | Add YAML button (columns moved inside component) |
| `web/src/pages/Namespaces.tsx` | Add YAML button (columns moved inside component) |

---

## Task 1: Go — StatefulSetSummary type + ListStatefulSets

**Files:**
- Modify: `internal/k8s/types.go`
- Modify: `internal/k8s/client.go`
- Create: `internal/k8s/statefulsets_test.go`

- [ ] **Step 1.1: Write the failing tests**

Create `internal/k8s/statefulsets_test.go`:

```go
package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestListStatefulSets_ReturnsInNamespace(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.StatefulSet{
			ObjectMeta: metav1.ObjectMeta{Name: "sts-1", Namespace: "default"},
			Status:     appsv1.StatefulSetStatus{ReadyReplicas: 2, Replicas: 3},
		},
		&appsv1.StatefulSet{
			ObjectMeta: metav1.ObjectMeta{Name: "sts-2", Namespace: "other"},
			Status:     appsv1.StatefulSetStatus{ReadyReplicas: 1, Replicas: 1},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListStatefulSets(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "sts-1", items[0].Name)
	assert.Equal(t, "default", items[0].Namespace)
	assert.Equal(t, "2/3", items[0].Ready)
}

func TestListStatefulSets_AllNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.StatefulSet{ObjectMeta: metav1.ObjectMeta{Name: "sts-1", Namespace: "default"}},
		&appsv1.StatefulSet{ObjectMeta: metav1.ObjectMeta{Name: "sts-2", Namespace: "other"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListStatefulSets(context.Background(), "")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}
```

- [ ] **Step 1.2: Run tests — expect FAIL**

```bash
go test ./internal/k8s/... -run TestListStatefulSets -v
```

Expected: `FAIL — client.ListStatefulSets undefined`

- [ ] **Step 1.3: Add StatefulSetSummary to types.go**

In `internal/k8s/types.go`, append after `NodeMetricsSummary`:

```go
type StatefulSetSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Ready     string `json:"ready"`
	Age       string `json:"age"`
}
```

- [ ] **Step 1.4: Add ListStatefulSets to client.go**

In `internal/k8s/client.go`, add after `ListDeployments` (around line 108):

```go
// ListStatefulSets returns statefulset summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListStatefulSets(ctx context.Context, namespace string) ([]StatefulSetSummary, error) {
	list, err := c.kube.AppsV1().StatefulSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]StatefulSetSummary, 0, len(list.Items))
	for _, s := range list.Items {
		summaries = append(summaries, toStatefulSetSummary(s))
	}
	return summaries, nil
}

func toStatefulSetSummary(s appsv1.StatefulSet) StatefulSetSummary {
	return StatefulSetSummary{
		Name:      s.Name,
		Namespace: s.Namespace,
		Ready:     fmt.Sprintf("%d/%d", s.Status.ReadyReplicas, s.Status.Replicas),
		Age:       formatAge(s.CreationTimestamp.Time),
	}
}
```

- [ ] **Step 1.5: Run tests — expect PASS**

```bash
go test ./internal/k8s/... -run TestListStatefulSets -v
```

Expected: `PASS`

- [ ] **Step 1.6: Run full Go test suite**

```bash
go test ./...
```

Expected: all PASS

- [ ] **Step 1.7: Commit**

```bash
git add internal/k8s/types.go internal/k8s/client.go internal/k8s/statefulsets_test.go
git commit -m "feat(k8s): add ListStatefulSets and StatefulSetSummary type"
```

---

## Task 2: Go — API handler + route for /statefulsets

**Files:**
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/router.go`
- Modify: `internal/api/handlers_test.go`

- [ ] **Step 2.1: Write the failing test**

In `internal/api/handlers_test.go`, add to `newTestRouter` a StatefulSet fixture, then add the test.

First, update the `newTestRouter` function to include a StatefulSet:

```go
// Replace the existing newTestRouter function body with:
func newTestRouter() *api.Router {
	fakeK8s := fake.NewSimpleClientset(
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "nginx", Namespace: "default"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
		},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "default"}},
		&appsv1.StatefulSet{
			ObjectMeta: metav1.ObjectMeta{Name: "sts-1", Namespace: "default"},
			Status:     appsv1.StatefulSetStatus{ReadyReplicas: 1, Replicas: 1},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeK8s, "test-context")
	return api.NewRouter(client, embed.FS{}, nil, nil, &config.Config{})
}
```

Add import at top of the file (in the import block):
```go
appsv1 "k8s.io/api/apps/v1"
```

Then add the test function:

```go
func TestGetStatefulSets_ReturnsList(t *testing.T) {
	router := newTestRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/statefulsets?namespace=default", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Items []k8s.StatefulSetSummary `json:"items"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Len(t, resp.Items, 1)
	assert.Equal(t, "sts-1", resp.Items[0].Name)
}
```

- [ ] **Step 2.2: Run test — expect FAIL**

```bash
go test ./internal/api/... -run TestGetStatefulSets -v
```

Expected: `FAIL — 404 not found`

- [ ] **Step 2.3: Add handler to handlers.go**

In `internal/api/handlers.go`, add after `handleListDeployments` (around line 107):

```go
func (r *Router) handleListStatefulSets(c *gin.Context) {
	namespace := c.Query("namespace")
	items, err := r.k8s.ListStatefulSets(c.Request.Context(), namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}
```

- [ ] **Step 2.4: Add route to router.go**

In `internal/api/router.go`, add after the deployments route (around line 41):

```go
v1.GET("/statefulsets", r.handleListStatefulSets)
```

- [ ] **Step 2.5: Run test — expect PASS**

```bash
go test ./internal/api/... -run TestGetStatefulSets -v
```

Expected: `PASS`

- [ ] **Step 2.6: Run full Go test suite**

```bash
go test ./...
```

Expected: all PASS

- [ ] **Step 2.7: Commit**

```bash
git add internal/api/handlers.go internal/api/router.go internal/api/handlers_test.go
git commit -m "feat(api): add GET /api/v1/statefulsets endpoint"
```

---

## Task 3: TypeScript — StatefulSetSummary type + fetchStatefulSets

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`

No automated tests — TypeScript compiler (`tsc --noEmit`) acts as the check.

- [ ] **Step 3.1: Add StatefulSetSummary to types.ts**

In `web/src/lib/types.ts`, append after `NodeMetricsSummary`:

```ts
export interface StatefulSetSummary {
  name: string
  namespace: string
  ready: string
  age: string
}
```

- [ ] **Step 3.2: Add fetchStatefulSets to api.ts**

In `web/src/lib/api.ts`, update the import line at the top to include `StatefulSetSummary`:

```ts
import type { PodSummary, DeploymentSummary, StatefulSetSummary, ContextInfo, ServiceSummary, NodeSummary, NamespaceSummary, ConfigMapSummary, SecretSummary, EventSummary, PodMetricsSummary, NodeMetricsSummary, TopologyGraph, APIResourceInfo, CRDPresence } from './types'
```

Then add the fetch function after `fetchDeployments`:

```ts
export async function fetchStatefulSets(namespace: string): Promise<StatefulSetSummary[]> {
  const data = await get<{ items: StatefulSetSummary[] }>(`/api/v1/statefulsets?namespace=${namespace}`)
  return data.items
}
```

- [ ] **Step 3.3: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3.4: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts
git commit -m "feat(ts): add StatefulSetSummary type and fetchStatefulSets"
```

---

## Task 4: Topology.tsx — All-Namespace Modal Warning

**Files:**
- Modify: `web/src/pages/Topology.tsx`

Make 4 surgical edits to `web/src/pages/Topology.tsx`:

- [ ] **Step 4.1: Fix namespace fallback (line 231)**

```tsx
// OLD:
const namespace = ctx?.namespace || 'default'

// NEW:
const namespace = ctx?.namespace ?? ''
```

- [ ] **Step 4.2: Add confirmed/cancelled state + reset effect**

After the `const [diagTarget, ...]` state declaration (around line 236), insert:

```tsx
  const isAllNamespaces = namespace === ''
  const [confirmed, setConfirmed] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  useEffect(() => {
    setConfirmed(false)
    setCancelled(false)
  }, [namespace])
```

- [ ] **Step 4.3: Gate the load useEffect on confirmed**

```tsx
// OLD:
  useEffect(() => { load() }, [load])

// NEW:
  useEffect(() => {
    if (isAllNamespaces && !confirmed) return
    load()
  }, [load, isAllNamespaces, confirmed])
```

- [ ] **Step 4.4: Add early returns before the main return statement**

Insert these two early-return blocks immediately BEFORE the `return (` at line 277:

```tsx
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
```

Also update the namespace display text in the existing return JSX (line 284):

```tsx
// OLD:
            {' · namespace: '}{namespace || 'default'}

// NEW:
            {' · namespace: '}{namespace || 'all namespaces'}
```

- [ ] **Step 4.5: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4.6: Commit**

```bash
git add web/src/pages/Topology.tsx
git commit -m "feat(topology): show confirmation modal when All Namespaces is selected"
```

---

## Task 5: Top.tsx — Session Rolling Min/Max

**Files:**
- Modify: `web/src/pages/Top.tsx`

- [ ] **Step 5.1: Replace Top.tsx entirely**

Replace the full content of `web/src/pages/Top.tsx`:

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback, useRef } from 'react'
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

function parseMem(s: string): number {
  if (s.endsWith('Gi')) return parseInt(s) * 1024 * 1024
  if (s.endsWith('Mi')) return parseInt(s) * 1024
  if (s.endsWith('Ki')) return parseInt(s)
  return parseInt(s) || 0
}

function formatMem(ki: number): string {
  if (ki >= 1024 * 1024) return `${Math.round(ki / 1024 / 1024)}Gi`
  if (ki >= 1024) return `${Math.round(ki / 1024)}Mi`
  return `${ki}Ki`
}

type MinMax = { minCpu: number; maxCpu: number; minMem: number; maxMem: number }

export function Top() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [podMetrics, setPodMetrics] = useState<PodMetricsSummary[]>([])
  const [nodeMetrics, setNodeMetrics] = useState<NodeMetricsSummary[]>([])
  const [noMetricsServer, setNoMetricsServer] = useState(false)
  const [podSorting, setPodSorting] = useState<SortingState>([{ id: 'cpu', desc: true }])

  const podHistory = useRef<Map<string, MinMax>>(new Map())
  const nodeHistory = useRef<Map<string, MinMax>>(new Map())

  useEffect(() => {
    podHistory.current.clear()
    nodeHistory.current.clear()
  }, [namespace])

  const load = useCallback(() => {
    Promise.all([
      fetchPodMetrics(namespace).catch(() => { setNoMetricsServer(true); return [] as PodMetricsSummary[] }),
      fetchNodeMetrics().catch(() => [] as NodeMetricsSummary[]),
    ]).then(([pods, nodes]) => {
      pods.forEach(p => {
        const key = `${p.namespace}/${p.name}`
        const cpu = parseCPU(p.cpu)
        const mem = parseMem(p.memory)
        const prev = podHistory.current.get(key)
        podHistory.current.set(key, prev
          ? { minCpu: Math.min(prev.minCpu, cpu), maxCpu: Math.max(prev.maxCpu, cpu), minMem: Math.min(prev.minMem, mem), maxMem: Math.max(prev.maxMem, mem) }
          : { minCpu: cpu, maxCpu: cpu, minMem: mem, maxMem: mem }
        )
      })
      nodes.forEach(n => {
        const cpu = parseCPU(n.cpu)
        const mem = parseMem(n.memory)
        const prev = nodeHistory.current.get(n.name)
        nodeHistory.current.set(n.name, prev
          ? { minCpu: Math.min(prev.minCpu, cpu), maxCpu: Math.max(prev.maxCpu, cpu), minMem: Math.min(prev.minMem, mem), maxMem: Math.max(prev.maxMem, mem) }
          : { minCpu: cpu, maxCpu: cpu, minMem: mem, maxMem: mem }
        )
      })
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
      cell: (i) => {
        const key = `${i.row.original.namespace}/${i.row.original.name}`
        const h = podHistory.current.get(key)
        const cur = parseCPU(i.getValue())
        return (
          <div className="min-w-36">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono w-12">{i.getValue()}</span>
              <UsageBar value={cur} max={maxCPU} />
            </div>
            {h && h.minCpu !== h.maxCpu && (
              <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                ↓<span className="text-green-600">{h.minCpu}m</span> ↑<span className="text-red-500">{h.maxCpu}m</span>
              </div>
            )}
          </div>
        )
      },
    }),
    podCol.accessor('memory', {
      header: 'Memory',
      cell: (i) => {
        const key = `${i.row.original.namespace}/${i.row.original.name}`
        const h = podHistory.current.get(key)
        return (
          <div>
            <span className="text-xs font-mono">{i.getValue()}</span>
            {h && h.minMem !== h.maxMem && (
              <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                ↓<span className="text-green-600">{formatMem(h.minMem)}</span> ↑<span className="text-red-500">{formatMem(h.maxMem)}</span>
              </div>
            )}
          </div>
        )
      },
    }),
  ]

  const nodeColumns = [
    nodeCol.accessor('name', { header: 'Node', cell: (i) => <span className="text-xs font-medium text-primary-900">{i.getValue()}</span> }),
    nodeCol.accessor('cpu', {
      header: 'CPU',
      cell: (i) => {
        const h = nodeHistory.current.get(i.row.original.name)
        return (
          <div>
            <span className="text-xs font-mono">{i.getValue()}</span>
            {h && h.minCpu !== h.maxCpu && (
              <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                ↓<span className="text-green-600">{h.minCpu}m</span> ↑<span className="text-red-500">{h.maxCpu}m</span>
              </div>
            )}
          </div>
        )
      },
    }),
    nodeCol.accessor('memory', {
      header: 'Memory',
      cell: (i) => {
        const h = nodeHistory.current.get(i.row.original.name)
        return (
          <div>
            <span className="text-xs font-mono">{i.getValue()}</span>
            {h && h.minMem !== h.maxMem && (
              <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                ↓<span className="text-green-600">{formatMem(h.minMem)}</span> ↑<span className="text-red-500">{formatMem(h.maxMem)}</span>
              </div>
            )}
          </div>
        )
      },
    }),
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
          <p className="text-[11px] text-primary-500">Auto-refreshes every 15s · min/max shown after 2+ samples</p>
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
```

- [ ] **Step 5.2: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 5.3: Commit**

```bash
git add web/src/pages/Top.tsx
git commit -m "feat(top): add session rolling min/max CPU and memory tracking"
```

---

## Task 6: YamlSidePanel — editable prop + edit mode

**Files:**
- Modify: `web/src/components/YamlSidePanel.tsx`

- [ ] **Step 6.1: Replace YamlSidePanel.tsx entirely**

Replace the full content of `web/src/components/YamlSidePanel.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { fetchResourceGet, applyResource } from '@/lib/api'
import yaml from 'js-yaml'
import { X } from 'lucide-react'

interface YamlSidePanelProps {
  group: string
  version: string
  resource: string
  namespace: string
  name: string
  onClose: () => void
  editable?: boolean
}

function cleanResource(json: unknown): unknown {
  if (typeof json !== 'object' || json === null) return json
  const obj = { ...(json as Record<string, unknown>) }
  delete obj.status
  const meta = obj.metadata as Record<string, unknown> | undefined
  if (meta) {
    const cleanMeta = { ...meta }
    delete cleanMeta.managedFields
    obj.metadata = cleanMeta
  }
  return obj
}

export function YamlSidePanel({ group, version, resource, namespace, name, onClose, editable = false }: YamlSidePanelProps) {
  const [rawJson, setRawJson] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewClean, setViewClean] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const [editMode, setEditMode] = useState(false)
  const [editContent, setEditContent] = useState<string>('')
  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState<string | null>(null)
  const [applySuccess, setApplySuccess] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchResourceGet(group, version, resource, namespace, name)
      .then(json => { setRawJson(json); setLoading(false) })
      .catch(e => { setError((e as Error).message); setLoading(false) })
  }, [group, version, resource, namespace, name, reloadKey])

  const displayYaml = (() => {
    if (!rawJson) return ''
    try {
      const parsed = JSON.parse(rawJson)
      const data = viewClean ? cleanResource(parsed) : parsed
      return yaml.dump(data, { indent: 2, lineWidth: -1 })
    } catch {
      return rawJson
    }
  })()

  const handleEdit = () => {
    setEditContent(displayYaml)
    setEditMode(true)
    setApplyError(null)
    setApplySuccess(false)
  }

  const handleCancel = () => {
    setEditMode(false)
    setApplyError(null)
  }

  const handleApply = async () => {
    setApplying(true)
    setApplyError(null)
    try {
      const parsed = yaml.load(editContent)
      await applyResource(group, version, resource, namespace, name, parsed)
      setApplySuccess(true)
      setEditMode(false)
      setTimeout(() => {
        setApplySuccess(false)
        setReloadKey(k => k + 1)
      }, 1500)
    } catch (e) {
      setApplyError((e as Error).message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[600px] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-primary-100">
          <div>
            <span className="text-xs font-bold text-primary-900">{name}</span>
            <span className="text-[10px] text-primary-400 ml-2">{namespace}</span>
            {applySuccess && (
              <span className="text-[10px] text-green-600 ml-2 font-medium">✓ Applied</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {editMode ? (
              <>
                <button
                  onClick={handleApply}
                  disabled={applying}
                  className="text-[10px] px-2 py-1 rounded bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-50"
                >
                  {applying ? 'Applying...' : 'Apply'}
                </button>
                <button
                  onClick={handleCancel}
                  className="text-[10px] px-2 py-1 rounded border border-primary-200 text-primary-600 hover:bg-primary-50"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                {editable && (
                  <button
                    onClick={handleEdit}
                    className="text-[10px] px-2 py-1 rounded border border-primary-200 text-primary-600 hover:bg-primary-50"
                  >
                    Edit
                  </button>
                )}
                <button
                  onClick={() => setViewClean(v => !v)}
                  className="text-[10px] px-2 py-1 rounded border border-primary-200 text-primary-600 hover:bg-primary-50"
                >
                  {viewClean ? '[Clean]' : '[Full]'}
                </button>
              </>
            )}
            <button onClick={onClose} className="p-1 hover:bg-primary-50 rounded">
              <X size={14} className="text-primary-500" />
            </button>
          </div>
        </div>

        {applyError && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-100 text-xs text-red-600">
            {applyError}
          </div>
        )}

        <div className="flex-1 overflow-auto p-4">
          {loading && <p className="text-xs text-primary-400">Loading...</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {!loading && !error && (
            editMode ? (
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="w-full h-full text-[11px] font-mono text-primary-800 border border-primary-200 rounded p-2 outline-none focus:border-primary-400 resize-none"
                spellCheck={false}
              />
            ) : (
              <pre className="text-[11px] font-mono text-primary-800 whitespace-pre-wrap">{displayYaml}</pre>
            )
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 6.2: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6.3: Run existing frontend tests**

```bash
cd web && npx vitest run
```

Expected: all PASS (YamlSidePanel has no existing tests; other tests unaffected)

- [ ] **Step 6.4: Commit**

```bash
git add web/src/components/YamlSidePanel.tsx
git commit -m "feat(yaml-panel): add editable prop with edit/apply/cancel mode"
```

---

## Task 7: StatefulSets.tsx page + App.tsx wiring

**Files:**
- Create: `web/src/pages/StatefulSets.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 7.1: Create StatefulSets.tsx**

Create `web/src/pages/StatefulSets.tsx`:

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { FileCode2 } from 'lucide-react'
import { fetchStatefulSets } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { StatefulSetSummary } from '@/lib/types'

const col = createColumnHelper<StatefulSetSummary>()

export function StatefulSets() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<StatefulSetSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [yamlTarget, setYamlTarget] = useState<StatefulSetSummary | null>(null)

  const load = useCallback(() => {
    fetchStatefulSets(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('ready', { header: 'Ready', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <button
          onClick={() => setYamlTarget(row.original)}
          className="p-1 text-primary-600 hover:bg-primary-50 rounded"
          title="View/Edit YAML"
        >
          <FileCode2 size={13} />
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
          <h1 className="text-base font-bold text-primary-900">StatefulSets</h1>
          <p className="text-[11px] text-primary-500">{items.length} statefulsets</p>
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
      </div>

      {yamlTarget && (
        <YamlSidePanel
          group="apps"
          version="v1"
          resource="statefulsets"
          namespace={yamlTarget.namespace}
          name={yamlTarget.name}
          onClose={() => setYamlTarget(null)}
          editable
        />
      )}
    </div>
  )
}
```

- [ ] **Step 7.2: Wire StatefulSets into App.tsx**

In `web/src/App.tsx`, add the import:

```tsx
import { StatefulSets } from '@/pages/StatefulSets'
```

Replace the placeholder route:

```tsx
// OLD:
<Route path="/statefulsets" element={<Placeholder title="StatefulSets" />} />

// NEW:
<Route path="/statefulsets" element={<StatefulSets />} />
```

- [ ] **Step 7.3: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7.4: Commit**

```bash
git add web/src/pages/StatefulSets.tsx web/src/App.tsx
git commit -m "feat(statefulsets): implement full StatefulSets page with YAML view/edit"
```

---

## Task 8: Add YAML Button to 6 Existing Pages

**Files:**
- Modify: `web/src/pages/Pods.tsx`
- Modify: `web/src/pages/Deployments.tsx`
- Modify: `web/src/pages/Services.tsx`
- Modify: `web/src/pages/ConfigMaps.tsx`
- Modify: `web/src/pages/Secrets.tsx`
- Modify: `web/src/pages/Namespaces.tsx`

### 8a — Pods.tsx

- [ ] **Step 8a.1: Add yamlTarget state and YAML button to Pods.tsx**

In `web/src/pages/Pods.tsx`:

Add `FileCode2` to the lucide import:
```tsx
import { RefreshCw, Trash2, Terminal, FileText, FileCode2 } from 'lucide-react'
```

Add `YamlSidePanel` import:
```tsx
import { YamlSidePanel } from '@/components/YamlSidePanel'
```

Inside the `Pods()` function, add state after the other state declarations:
```tsx
const [yamlTarget, setYamlTarget] = useState<PodSummary | null>(null)
```

In the `columns` array, inside the `actions` display column cell, add a YAML button after the Restart button and before the Delete button:
```tsx
<button
  onClick={() => setYamlTarget(row.original)}
  className="p-1 text-primary-600 hover:bg-primary-50 rounded"
  title="View/Edit YAML"
>
  <FileCode2 size={11} />
</button>
```

At the bottom of the returned JSX, before the closing `</div>`, add:
```tsx
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
```

### 8b — Deployments.tsx

- [ ] **Step 8b.1: Add yamlTarget state and YAML button to Deployments.tsx**

In `web/src/pages/Deployments.tsx`:

Add imports at top:
```tsx
import { FileCode2 } from 'lucide-react'
import { YamlSidePanel } from '@/components/YamlSidePanel'
```

Add state inside `Deployments()`:
```tsx
const [yamlTarget, setYamlTarget] = useState<DeploymentSummary | null>(null)
```

In the actions display column cell, add YAML button before the Delete button:
```tsx
<button
  onClick={() => setYamlTarget(row.original)}
  className="p-1 text-primary-600 hover:bg-primary-50 rounded"
  title="View/Edit YAML"
>
  <FileCode2 size={11} />
</button>
```

Add YamlSidePanel before the last `</div>`:
```tsx
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
```

### 8c — Services.tsx

- [ ] **Step 8c.1: Rewrite Services.tsx with YAML button**

Replace the full content of `web/src/pages/Services.tsx`:

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { FileCode2 } from 'lucide-react'
import { fetchServices } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { ServiceSummary } from '@/lib/types'

const col = createColumnHelper<ServiceSummary>()

export function Services() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<ServiceSummary[]>([])
  const [yamlTarget, setYamlTarget] = useState<ServiceSummary | null>(null)

  const load = useCallback(() => { fetchServices(namespace).then(setItems).catch(console.error) }, [namespace])
  useEffect(() => { load() }, [load])

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('type', { header: 'Type', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('clusterIP', { header: 'Cluster IP', cell: (i) => <span className="text-xs font-mono">{i.getValue()}</span> }),
    col.accessor('ports', { header: 'Ports', cell: (i) => <span className="text-xs text-gray-600">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button onClick={() => setYamlTarget(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded" title="View/Edit YAML">
          <FileCode2 size={13} />
        </button>
      ),
    }),
  ]

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">Services</h1><p className="text-[11px] text-primary-500">{items.length} services</p></div>
        <RefreshButton onRefresh={load} />
      </div>
      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">{table.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map(row => <tr key={row.id} className="border-t border-primary-50 hover:bg-primary-50/50">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {yamlTarget && (
        <YamlSidePanel
          group=""
          version="v1"
          resource="services"
          namespace={yamlTarget.namespace}
          name={yamlTarget.name}
          onClose={() => setYamlTarget(null)}
          editable
        />
      )}
    </div>
  )
}
```

### 8d — ConfigMaps.tsx

- [ ] **Step 8d.1: Rewrite ConfigMaps.tsx with YAML button**

Replace the full content of `web/src/pages/ConfigMaps.tsx`:

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { FileCode2 } from 'lucide-react'
import { fetchConfigMaps } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { ConfigMapSummary } from '@/lib/types'

const col = createColumnHelper<ConfigMapSummary>()

export function ConfigMaps() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<ConfigMapSummary[]>([])
  const [yamlTarget, setYamlTarget] = useState<ConfigMapSummary | null>(null)

  const load = useCallback(() => { fetchConfigMaps(namespace).then(setItems).catch(console.error) }, [namespace])
  useEffect(() => { load() }, [load])

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('dataCount', { header: 'Keys', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button onClick={() => setYamlTarget(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded" title="View/Edit YAML">
          <FileCode2 size={13} />
        </button>
      ),
    }),
  ]

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">ConfigMaps</h1><p className="text-[11px] text-primary-500">{items.length} configmaps</p></div>
        <RefreshButton onRefresh={load} />
      </div>
      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">{table.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map(row => <tr key={row.id} className="border-t border-primary-50 hover:bg-primary-50/50">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {yamlTarget && (
        <YamlSidePanel
          group=""
          version="v1"
          resource="configmaps"
          namespace={yamlTarget.namespace}
          name={yamlTarget.name}
          onClose={() => setYamlTarget(null)}
          editable
        />
      )}
    </div>
  )
}
```

### 8e — Secrets.tsx

- [ ] **Step 8e.1: Rewrite Secrets.tsx with YAML button**

Replace the full content of `web/src/pages/Secrets.tsx`:

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { FileCode2 } from 'lucide-react'
import { fetchSecrets } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { SecretSummary } from '@/lib/types'

const col = createColumnHelper<SecretSummary>()

export function Secrets() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<SecretSummary[]>([])
  const [yamlTarget, setYamlTarget] = useState<SecretSummary | null>(null)

  const load = useCallback(() => { fetchSecrets(namespace).then(setItems).catch(console.error) }, [namespace])
  useEffect(() => { load() }, [load])

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('type', { header: 'Type', cell: (i) => <span className="text-xs text-gray-600">{i.getValue()}</span> }),
    col.accessor('dataCount', { header: 'Keys', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button onClick={() => setYamlTarget(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded" title="View/Edit YAML">
          <FileCode2 size={13} />
        </button>
      ),
    }),
  ]

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">Secrets</h1><p className="text-[11px] text-primary-500">{items.length} secrets</p></div>
        <RefreshButton onRefresh={load} />
      </div>
      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">{table.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map(row => <tr key={row.id} className="border-t border-primary-50 hover:bg-primary-50/50">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {yamlTarget && (
        <YamlSidePanel
          group=""
          version="v1"
          resource="secrets"
          namespace={yamlTarget.namespace}
          name={yamlTarget.name}
          onClose={() => setYamlTarget(null)}
          editable
        />
      )}
    </div>
  )
}
```

### 8f — Namespaces.tsx

- [ ] **Step 8f.1: Rewrite Namespaces.tsx with YAML button**

Replace the full content of `web/src/pages/Namespaces.tsx`:

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { FileCode2 } from 'lucide-react'
import { fetchNamespaceSummaries } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { NamespaceSummary } from '@/lib/types'

const col = createColumnHelper<NamespaceSummary>()

export function Namespaces() {
  const [items, setItems] = useState<NamespaceSummary[]>([])
  const [yamlTarget, setYamlTarget] = useState<NamespaceSummary | null>(null)

  const load = useCallback(() => { fetchNamespaceSummaries().then(setItems).catch(console.error) }, [])
  useEffect(() => { load() }, [load])

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('status', { header: 'Status', cell: (i) => <span className="text-xs text-green-600">● {i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button onClick={() => setYamlTarget(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded" title="View/Edit YAML">
          <FileCode2 size={13} />
        </button>
      ),
    }),
  ]

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">Namespaces</h1><p className="text-[11px] text-primary-500">{items.length} namespaces</p></div>
        <RefreshButton onRefresh={load} />
      </div>
      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">{table.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map(row => <tr key={row.id} className="border-t border-primary-50 hover:bg-primary-50/50">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {yamlTarget && (
        <YamlSidePanel
          group=""
          version="v1"
          resource="namespaces"
          namespace=""
          name={yamlTarget.name}
          onClose={() => setYamlTarget(null)}
          editable
        />
      )}
    </div>
  )
}
```

- [ ] **Step 8.2: Type-check all pages**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 8.3: Run all frontend tests**

```bash
cd web && npx vitest run
```

Expected: all PASS

- [ ] **Step 8.4: Run all Go tests**

```bash
go test ./...
```

Expected: all PASS

- [ ] **Step 8.5: Commit**

```bash
git add web/src/pages/Pods.tsx web/src/pages/Deployments.tsx web/src/pages/Services.tsx web/src/pages/ConfigMaps.tsx web/src/pages/Secrets.tsx web/src/pages/Namespaces.tsx
git commit -m "feat: add YAML view/edit button to Pods, Deployments, Services, ConfigMaps, Secrets, Namespaces"
```

---

## Final Verification

- [ ] **Run full test suite**

```bash
go test ./... && cd web && npx vitest run && npx tsc --noEmit
```

Expected: all PASS, no TypeScript errors

- [ ] **Build production binary**

```bash
make build
```

Expected: `./k999s` binary built successfully (~47MB)

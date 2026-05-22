# Enhanced Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add CPU/MEM request+limit columns to the Pods page and CPU/MEM allocatable columns to the Nodes page, with live usage metrics joined from the metrics-server.

**Architecture:** Enrich `PodSummary` with `cpuRequest/cpuLimit/memRequest/memLimit` (computed from pod spec in `toPodSummary`) and `NodeSummary` with `cpuAllocatable/memAllocatable` (from `node.Status.Allocatable`). Frontend fetches both the resource list and metrics in parallel, builds a lookup map, and displays 6 columns for pods and 4 for nodes. All values fall back to `"—"` when unavailable.

**Tech Stack:** `k8s.io/apimachinery/pkg/api/resource` (Quantity), React Promise.all, new `web/src/lib/resourceUtils.ts`

---

## File Map

| File | Change |
|---|---|
| `internal/k8s/types.go` | Add 4 fields to `PodSummary`, 2 fields to `NodeSummary` |
| `internal/k8s/client.go` | Add `formatCPUQuantity`, `formatMemQuantity`; update `toPodSummary`, `ListNodes` |
| `internal/k8s/client_test.go` | Add `TestListPods_IncludesRequests` |
| `web/src/lib/types.ts` | Add 4 fields to `PodSummary`, 2 fields to `NodeSummary` |
| `web/src/lib/resourceUtils.ts` | New — parse/pct helpers |
| `web/src/lib/resourceUtils.test.ts` | New — unit tests |
| `web/src/pages/Pods.tsx` | Fetch pod metrics, join, add 6 columns |
| `web/src/pages/Nodes.tsx` | Fetch node metrics, join, add 4 columns |

---

## Task 1: Go Backend — Types + Formatting Helpers

**Files:**
- Modify: `internal/k8s/types.go`
- Modify: `internal/k8s/client.go`
- Modify: `internal/k8s/client_test.go`

- [ ] **Step 1: Add fields to `PodSummary` in `internal/k8s/types.go`**

In the `PodSummary` struct, add 4 fields after `Containers`:

```go
CPURequest string `json:"cpuRequest"` // "100m", "1.5", or "—"
CPULimit   string `json:"cpuLimit"`   // "500m" or "—"
MemRequest string `json:"memRequest"` // "128Mi" or "—"
MemLimit   string `json:"memLimit"`   // "256Mi" or "—"
```

Add 2 fields to `NodeSummary` after `Schedulable`:

```go
CPUAllocatable string `json:"cpuAllocatable"` // "4" or "4.0"
MemAllocatable string `json:"memAllocatable"` // "16Gi"
```

- [ ] **Step 2: Write failing test in `internal/k8s/client_test.go`**

Add `"k8s.io/apimachinery/pkg/api/resource"` to imports. Append:

```go
func TestListPods_IncludesRequests(t *testing.T) {
	cpuReq := resource.MustParse("100m")
	memReq := resource.MustParse("128Mi")
	fakeClient := fake.NewSimpleClientset(
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "app", Namespace: "default"},
			Spec: corev1.PodSpec{
				Containers: []corev1.Container{{
					Name:  "main",
					Image: "nginx",
					Resources: corev1.ResourceRequirements{
						Requests: corev1.ResourceList{
							corev1.ResourceCPU:    cpuReq,
							corev1.ResourceMemory: memReq,
						},
					},
				}},
			},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListPods(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "100m", items[0].CPURequest)
	assert.Equal(t, "128Mi", items[0].MemRequest)
	assert.Equal(t, "—", items[0].CPULimit)
}
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
go test ./internal/k8s/... -run TestListPods_IncludesRequests -v
```

Expected: `FAIL` — fields not set yet.

- [ ] **Step 4: Add formatting helpers to `internal/k8s/client.go`**

Add `"k8s.io/apimachinery/pkg/api/resource"` to the imports block.

Append after `formatAge`:

```go
// formatCPUQuantity formats a CPU Quantity as "Xm" (millicores < 1 core) or "X.X" (cores).
// Returns "—" if the quantity is zero (not set).
func formatCPUQuantity(q resource.Quantity) string {
	if q.IsZero() {
		return "—"
	}
	millis := q.MilliValue()
	if millis >= 1000 {
		return fmt.Sprintf("%.1f", float64(millis)/1000)
	}
	return fmt.Sprintf("%dm", millis)
}

// formatMemQuantity formats a memory Quantity as "XMi" or "X.XGi".
// Returns "—" if the quantity is zero.
func formatMemQuantity(q resource.Quantity) string {
	if q.IsZero() {
		return "—"
	}
	bytes := q.Value()
	const mi = 1024 * 1024
	if bytes >= 1024*mi {
		return fmt.Sprintf("%.1fGi", float64(bytes)/float64(1024*mi))
	}
	return fmt.Sprintf("%dMi", bytes/mi)
}
```

- [ ] **Step 5: Update `toPodSummary` in `internal/k8s/client.go`**

Inside `toPodSummary`, after building the `containers` slice and before the `return PodSummary{` statement, add:

```go
var cpuReq, cpuLim, memReq, memLim resource.Quantity
for _, c := range p.Spec.Containers {
	if v, ok := c.Resources.Requests[corev1.ResourceCPU]; ok {
		cpuReq.Add(v)
	}
	if v, ok := c.Resources.Limits[corev1.ResourceCPU]; ok {
		cpuLim.Add(v)
	}
	if v, ok := c.Resources.Requests[corev1.ResourceMemory]; ok {
		memReq.Add(v)
	}
	if v, ok := c.Resources.Limits[corev1.ResourceMemory]; ok {
		memLim.Add(v)
	}
}
```

In the `return PodSummary{...}` block, add 4 fields:

```go
CPURequest: formatCPUQuantity(cpuReq),
CPULimit:   formatCPUQuantity(cpuLim),
MemRequest: formatMemQuantity(memReq),
MemLimit:   formatMemQuantity(memLim),
```

- [ ] **Step 6: Update `ListNodes` in `internal/k8s/client.go`**

In the `out = append(out, NodeSummary{...})` block (around line 550), add 2 fields:

```go
CPUAllocatable: formatCPUQuantity(n.Status.Allocatable[corev1.ResourceCPU]),
MemAllocatable: formatMemQuantity(n.Status.Allocatable[corev1.ResourceMemory]),
```

- [ ] **Step 7: Run test — expect PASS**

```bash
go test ./internal/k8s/... -run TestListPods_IncludesRequests -v
```

Expected: `PASS`.

- [ ] **Step 8: Run all Go tests**

```bash
go test ./...
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add internal/k8s/types.go internal/k8s/client.go internal/k8s/client_test.go
git commit -m "feat(metrics): add CPU/MEM request/limit to PodSummary and allocatable to NodeSummary"
```

---

## Task 2: Frontend — Resource Utils

**Files:**
- Create: `web/src/lib/resourceUtils.ts`
- Create: `web/src/lib/resourceUtils.test.ts`

- [ ] **Step 1: Write failing tests in `web/src/lib/resourceUtils.test.ts`**

```typescript
import { describe, it, expect } from 'vitest'
import { parseMillicores, parseMiB, pct } from './resourceUtils'

describe('parseMillicores', () => {
  it('parses millicores', () => expect(parseMillicores('100m')).toBe(100))
  it('parses cores', () => expect(parseMillicores('1.5')).toBe(1500))
  it('returns null for dash', () => expect(parseMillicores('—')).toBeNull())
  it('returns null for empty', () => expect(parseMillicores('')).toBeNull())
})

describe('parseMiB', () => {
  it('parses Mi', () => expect(parseMiB('128Mi')).toBe(128))
  it('parses Gi', () => expect(parseMiB('1Gi')).toBe(1024))
  it('parses Ki', () => expect(parseMiB('1024Ki')).toBe(1))
  it('returns null for dash', () => expect(parseMiB('—')).toBeNull())
})

describe('pct', () => {
  it('computes percentage', () => expect(pct('100m', '200m', parseMillicores)).toBe('50%'))
  it('returns dash when usage is dash', () => expect(pct('—', '200m', parseMillicores)).toBe('—'))
  it('returns dash when total is zero', () => expect(pct('100m', '0m', parseMillicores)).toBe('—'))
  it('returns dash when total is dash', () => expect(pct('100m', '—', parseMillicores)).toBe('—'))
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd web && npx vitest run src/lib/resourceUtils.test.ts
```

Expected: `FAIL` — module not found.

- [ ] **Step 3: Create `web/src/lib/resourceUtils.ts`**

```typescript
/** Parse CPU string ("100m" → 100 millicores, "1.5" → 1500, "—" → null) */
export function parseMillicores(s: string): number | null {
  if (!s || s === '—') return null
  if (s.endsWith('m')) {
    const v = parseFloat(s)
    return isNaN(v) ? null : v
  }
  const v = parseFloat(s)
  return isNaN(v) ? null : v * 1000
}

/** Parse memory string to MiB ("128Mi" → 128, "1Gi" → 1024, "1024Ki" → 1, "—" → null) */
export function parseMiB(s: string): number | null {
  if (!s || s === '—') return null
  if (s.endsWith('Ki')) return parseFloat(s) / 1024
  if (s.endsWith('Mi')) return parseFloat(s)
  if (s.endsWith('Gi')) return parseFloat(s) * 1024
  if (s.endsWith('Ti')) return parseFloat(s) * 1024 * 1024
  const v = parseFloat(s)
  return isNaN(v) ? null : v / (1024 * 1024)
}

/**
 * Compute usage/total as a percentage string.
 * Returns "—" if either value is unavailable or total is zero.
 */
export function pct(usage: string, total: string, parser: (s: string) => number | null): string {
  const u = parser(usage)
  const t = parser(total)
  if (u === null || t === null || t === 0) return '—'
  return Math.round((u / t) * 100) + '%'
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
cd web && npx vitest run src/lib/resourceUtils.test.ts
```

Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/resourceUtils.ts web/src/lib/resourceUtils.test.ts
git commit -m "feat(metrics): add resourceUtils parse/pct helpers with tests"
```

---

## Task 3: Frontend — TS Types + Pods Page

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/pages/Pods.tsx`

- [ ] **Step 1: Add fields to `PodSummary` in `web/src/lib/types.ts`**

In the `PodSummary` interface, add 4 fields after `containers`:

```typescript
cpuRequest: string
cpuLimit: string
memRequest: string
memLimit: string
```

- [ ] **Step 2: Update `web/src/pages/Pods.tsx`**

Add `fetchPodMetrics` to the import from `@/lib/api`. Add `PodMetricsSummary` to the type import. Add `parseMillicores`, `parseMiB`, `pct` import:

```typescript
import { parseMillicores, parseMiB, pct } from '@/lib/resourceUtils'
import type { PodSummary, ContainerInfo, PodMetricsSummary } from '@/lib/types'
```

Add state inside `Pods`:
```typescript
const [podMetrics, setPodMetrics] = useState<PodMetricsSummary[]>([])
```

Update `load` callback to also fetch pod metrics in parallel:
```typescript
const load = useCallback(() => {
  Promise.all([
    fetchPods(namespace),
    fetchPodMetrics(namespace).catch(() => [] as PodMetricsSummary[]),
  ]).then(([pods, metrics]) => {
    setItems(pods)
    setPodMetrics(metrics)
  }).catch(console.error)
}, [namespace])
```

Build a metrics lookup map (add this line after the `useState` declarations, before columns):
```typescript
const metricsMap = new Map(podMetrics.map(m => [`${m.namespace}/${m.name}`, m]))
```

Add 6 columns to the `columns` array — insert them after the `age` column and before the `actions` column:

```typescript
columnHelper.display({
  id: 'cpu',
  header: 'CPU',
  cell: ({ row }) => {
    const m = metricsMap.get(`${row.original.namespace}/${row.original.name}`)
    return <span className="text-xs font-mono text-gray-700">{m?.cpu ?? '—'}</span>
  },
}),
columnHelper.display({
  id: 'cpuR',
  header: '%CPU/R',
  cell: ({ row }) => {
    const m = metricsMap.get(`${row.original.namespace}/${row.original.name}`)
    return <span className="text-xs text-gray-500">{pct(m?.cpu ?? '—', row.original.cpuRequest, parseMillicores)}</span>
  },
}),
columnHelper.display({
  id: 'cpuL',
  header: '%CPU/L',
  cell: ({ row }) => {
    const m = metricsMap.get(`${row.original.namespace}/${row.original.name}`)
    return <span className="text-xs text-gray-500">{pct(m?.cpu ?? '—', row.original.cpuLimit, parseMillicores)}</span>
  },
}),
columnHelper.display({
  id: 'mem',
  header: 'MEM',
  cell: ({ row }) => {
    const m = metricsMap.get(`${row.original.namespace}/${row.original.name}`)
    return <span className="text-xs font-mono text-gray-700">{m?.memory ?? '—'}</span>
  },
}),
columnHelper.display({
  id: 'memR',
  header: '%MEM/R',
  cell: ({ row }) => {
    const m = metricsMap.get(`${row.original.namespace}/${row.original.name}`)
    return <span className="text-xs text-gray-500">{pct(m?.memory ?? '—', row.original.memRequest, parseMiB)}</span>
  },
}),
columnHelper.display({
  id: 'memL',
  header: '%MEM/L',
  cell: ({ row }) => {
    const m = metricsMap.get(`${row.original.namespace}/${row.original.name}`)
    return <span className="text-xs text-gray-500">{pct(m?.memory ?? '—', row.original.memLimit, parseMiB)}</span>
  },
}),
```

Also add `Node` column after the `ip` column:
```typescript
columnHelper.accessor('node', {
  header: 'Node',
  cell: (i) => <span className="text-xs text-gray-500 font-mono">{i.getValue()}</span>,
}),
```

- [ ] **Step 3: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run frontend tests**

```bash
cd web && npx vitest run
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/types.ts web/src/pages/Pods.tsx
git commit -m "feat(metrics): add CPU/MEM columns and Node column to Pods page"
```

---

## Task 4: Frontend — Nodes Page

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/pages/Nodes.tsx`

- [ ] **Step 1: Add fields to `NodeSummary` in `web/src/lib/types.ts`**

In the `NodeSummary` interface, add 2 fields after `schedulable`:

```typescript
cpuAllocatable: string
memAllocatable: string
```

- [ ] **Step 2: Update `web/src/pages/Nodes.tsx`**

Add `fetchNodeMetrics` to the import from `@/lib/api`. Add `NodeMetricsSummary` to the type import. Import utils:

```typescript
import { parseMillicores, parseMiB, pct } from '@/lib/resourceUtils'
import type { NodeSummary, NodeMetricsSummary } from '@/lib/types'
```

Add state:
```typescript
const [nodeMetrics, setNodeMetrics] = useState<NodeMetricsSummary[]>([])
```

Update `load` callback:
```typescript
const load = useCallback(() => {
  Promise.all([
    fetchNodes(),
    fetchNodeMetrics().catch(() => [] as NodeMetricsSummary[]),
  ]).then(([nodes, metrics]) => {
    setItems(nodes)
    setNodeMetrics(metrics)
  }).catch(console.error)
}, [])
```

Add metrics map (after useState declarations, before columns):
```typescript
const metricsMap = new Map(nodeMetrics.map(m => [m.name, m]))
```

Add 4 columns to the `columns` array — after the `age` column, before the `actions` column:

```typescript
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
```

- [ ] **Step 3: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run all tests**

```bash
go test ./...
cd web && npx vitest run
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/lib/types.ts web/src/pages/Nodes.tsx
git commit -m "feat(metrics): add CPU/MEM columns to Nodes page"
```

---

## Task 5: Final Verification

- [ ] **Step 1: Full build**

```bash
make build
```

Expected: `./k999s` binary built successfully.

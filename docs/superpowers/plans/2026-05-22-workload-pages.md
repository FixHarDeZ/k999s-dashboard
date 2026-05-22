# Workload Resource Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DaemonSets, Jobs, CronJobs, and HPA pages to the k999s dashboard — each with a list table, YAML sidepanel, and resource-appropriate actions.

**Architecture:** Follow the established pattern for each resource: Go type → client list method + test → action methods + test → handler + router → TS type + API function → React page + test + Sidebar + App route. Each resource is fully wired before moving to the next.

**Tech Stack:** Go (client-go AppsV1/BatchV1/AutoscalingV2), Gin handlers, React + TanStack Table, lucide-react icons, Vitest

---

## File Map

| File | Change |
|---|---|
| `internal/k8s/types.go` | Add 4 new Summary structs |
| `internal/k8s/client.go` | Add ListDaemonSets, ListJobs, ListCronJobs, ListHPAs + helper funcs |
| `internal/k8s/actions.go` | Add RolloutRestartDaemonSet, DeleteDaemonSet, DeleteJob, DeleteCronJob, TriggerCronJob, PatchHPALimits |
| `internal/k8s/daemonsets_test.go` | New — DaemonSet list tests |
| `internal/k8s/jobs_test.go` | New — Jobs list tests |
| `internal/k8s/cronjobs_test.go` | New — CronJobs list tests |
| `internal/k8s/hpa_test.go` | New — HPA list tests |
| `internal/k8s/actions_test.go` | Add action tests for all 4 resources |
| `internal/api/handlers.go` | Add handlers for all 4 resources |
| `internal/api/router.go` | Register new routes + add PATCH to CORS |
| `web/src/lib/types.ts` | Add 4 new interfaces |
| `web/src/lib/api.ts` | Add fetch/action functions for all 4 resources |
| `web/src/pages/DaemonSets.tsx` | New page |
| `web/src/pages/DaemonSets.test.tsx` | New test |
| `web/src/pages/Jobs.tsx` | New page |
| `web/src/pages/Jobs.test.tsx` | New test |
| `web/src/pages/CronJobs.tsx` | New page |
| `web/src/pages/CronJobs.test.tsx` | New test |
| `web/src/pages/HPA.tsx` | New page |
| `web/src/pages/HPA.test.tsx` | New test |
| `web/src/components/layout/Sidebar.tsx` | Add 4 nav items + 4 icon imports |
| `web/src/App.tsx` | Add 4 routes |

---

## Task 1: Go + TypeScript Types

**Files:**
- Modify: `internal/k8s/types.go`
- Modify: `web/src/lib/types.ts`

- [ ] **Step 1: Add 4 Summary structs to `internal/k8s/types.go`**

Append after the `IngressSummary` struct (after line 120):

```go
type DaemonSetSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Desired   int32  `json:"desired"`
	Current   int32  `json:"current"`
	Ready     int32  `json:"ready"`
	Available int32  `json:"available"`
	Age       string `json:"age"`
}

type JobSummary struct {
	Name        string `json:"name"`
	Namespace   string `json:"namespace"`
	Completions string `json:"completions"`
	Succeeded   int32  `json:"succeeded"`
	Failed      int32  `json:"failed"`
	Status      string `json:"status"`
	Duration    string `json:"duration"`
	Age         string `json:"age"`
}

type CronJobSummary struct {
	Name         string `json:"name"`
	Namespace    string `json:"namespace"`
	Schedule     string `json:"schedule"`
	Suspend      bool   `json:"suspend"`
	Active       int    `json:"active"`
	LastSchedule string `json:"lastSchedule"`
	Age          string `json:"age"`
}

type HPASummary struct {
	Name            string `json:"name"`
	Namespace       string `json:"namespace"`
	TargetKind      string `json:"targetKind"`
	TargetName      string `json:"targetName"`
	MinReplicas     int32  `json:"minReplicas"`
	MaxReplicas     int32  `json:"maxReplicas"`
	CurrentReplicas int32  `json:"currentReplicas"`
	Age             string `json:"age"`
}
```

- [ ] **Step 2: Add 4 interfaces to `web/src/lib/types.ts`**

Append after the `HelmReleaseSummary` interface (end of file):

```typescript
export interface DaemonSetSummary {
  name: string
  namespace: string
  desired: number
  current: number
  ready: number
  available: number
  age: string
}

export interface JobSummary {
  name: string
  namespace: string
  completions: string
  succeeded: number
  failed: number
  status: 'Complete' | 'Running' | 'Failed' | string
  duration: string
  age: string
}

export interface CronJobSummary {
  name: string
  namespace: string
  schedule: string
  suspend: boolean
  active: number
  lastSchedule: string
  age: string
}

export interface HPASummary {
  name: string
  namespace: string
  targetKind: string
  targetName: string
  minReplicas: number
  maxReplicas: number
  currentReplicas: number
  age: string
}
```

- [ ] **Step 3: Verify Go compiles**

```bash
go build ./...
```

Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add internal/k8s/types.go web/src/lib/types.ts
git commit -m "feat: add DaemonSet/Job/CronJob/HPA summary types"
```

---

## Task 2: DaemonSets Go Backend

**Files:**
- Modify: `internal/k8s/client.go`
- Modify: `internal/k8s/actions.go`
- Create: `internal/k8s/daemonsets_test.go`
- Modify: `internal/k8s/actions_test.go`

- [ ] **Step 1: Write failing DaemonSet list tests in `internal/k8s/daemonsets_test.go`**

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

func TestListDaemonSets_ReturnsInNamespace(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.DaemonSet{
			ObjectMeta: metav1.ObjectMeta{Name: "ds-1", Namespace: "default"},
			Status: appsv1.DaemonSetStatus{
				DesiredNumberScheduled: 3,
				CurrentNumberScheduled: 3,
				NumberReady:            2,
				NumberAvailable:        2,
			},
		},
		&appsv1.DaemonSet{
			ObjectMeta: metav1.ObjectMeta{Name: "ds-2", Namespace: "other"},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListDaemonSets(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "ds-1", items[0].Name)
	assert.Equal(t, int32(3), items[0].Desired)
	assert.Equal(t, int32(2), items[0].Ready)
}

func TestListDaemonSets_AllNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.DaemonSet{ObjectMeta: metav1.ObjectMeta{Name: "ds-1", Namespace: "default"}},
		&appsv1.DaemonSet{ObjectMeta: metav1.ObjectMeta{Name: "ds-2", Namespace: "other"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListDaemonSets(context.Background(), "")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
go test ./internal/k8s/... -run TestListDaemonSets -v
```

Expected: `FAIL` — `client.ListDaemonSets undefined`.

- [ ] **Step 3: Add `ListDaemonSets` to `internal/k8s/client.go`**

Add after the `ListStatefulSets`/`toStatefulSetSummary` block:

```go
// ListDaemonSets returns daemonset summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListDaemonSets(ctx context.Context, namespace string) ([]DaemonSetSummary, error) {
	list, err := c.kube.AppsV1().DaemonSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]DaemonSetSummary, 0, len(list.Items))
	for _, d := range list.Items {
		summaries = append(summaries, toDaemonSetSummary(d))
	}
	return summaries, nil
}

func toDaemonSetSummary(d appsv1.DaemonSet) DaemonSetSummary {
	return DaemonSetSummary{
		Name:      d.Name,
		Namespace: d.Namespace,
		Desired:   d.Status.DesiredNumberScheduled,
		Current:   d.Status.CurrentNumberScheduled,
		Ready:     d.Status.NumberReady,
		Available: d.Status.NumberAvailable,
		Age:       formatAge(d.CreationTimestamp.Time),
	}
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
go test ./internal/k8s/... -run TestListDaemonSets -v
```

Expected: `PASS`.

- [ ] **Step 5: Write failing action tests — append to `internal/k8s/actions_test.go`**

```go
func TestRolloutRestartDaemonSet_NoError(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.DaemonSet{ObjectMeta: metav1.ObjectMeta{Name: "ds-1", Namespace: "default"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.RolloutRestartDaemonSet(context.Background(), "default", "ds-1")
	require.NoError(t, err)
}

func TestDeleteDaemonSet_RemovesDaemonSet(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.DaemonSet{ObjectMeta: metav1.ObjectMeta{Name: "ds-1", Namespace: "default"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.DeleteDaemonSet(context.Background(), "default", "ds-1")
	require.NoError(t, err)
	list, _ := fakeClient.AppsV1().DaemonSets("default").List(context.Background(), metav1.ListOptions{})
	assert.Len(t, list.Items, 0)
}
```

- [ ] **Step 6: Run action tests — expect FAIL**

```bash
go test ./internal/k8s/... -run "TestRolloutRestartDaemonSet|TestDeleteDaemonSet" -v
```

Expected: `FAIL` — methods undefined.

- [ ] **Step 7: Add DaemonSet actions to `internal/k8s/actions.go`**

Existing imports already have `appsv1`, `types`, `fmt`, `time`, `metav1`. No new imports needed. Append these functions:

```go
func (c *Client) RolloutRestartDaemonSet(ctx context.Context, namespace, name string) error {
	patch := fmt.Sprintf(
		`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`,
		time.Now().UTC().Format(time.RFC3339),
	)
	_, err := c.kube.AppsV1().DaemonSets(namespace).Patch(
		ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{},
	)
	return err
}

func (c *Client) DeleteDaemonSet(ctx context.Context, namespace, name string) error {
	return c.kube.AppsV1().DaemonSets(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}
```

- [ ] **Step 8: Run action tests — expect PASS**

```bash
go test ./internal/k8s/... -run "TestRolloutRestartDaemonSet|TestDeleteDaemonSet" -v
```

Expected: `PASS`.

- [ ] **Step 9: Add DaemonSet handlers to `internal/api/handlers.go`**

Append to end of file:

```go
func (r *Router) handleListDaemonSets(c *gin.Context) {
	namespace := c.Query("namespace")
	items, err := r.k8s.ListDaemonSets(c.Request.Context(), namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (r *Router) handleRolloutRestartDaemonSet(c *gin.Context) {
	ns, name := c.Param("ns"), c.Param("name")
	if err := r.k8s.RolloutRestartDaemonSet(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleDeleteDaemonSet(c *gin.Context) {
	ns, name := c.Param("ns"), c.Param("name")
	if err := r.k8s.DeleteDaemonSet(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
```

- [ ] **Step 10: Register DaemonSet routes in `internal/api/router.go`**

Add after the `v1.DELETE("/deployments/:namespace/:name", ...)` line:

```go
v1.GET("/daemonsets", r.handleListDaemonSets)
v1.POST("/daemonsets/:ns/:name/rollout-restart", r.handleRolloutRestartDaemonSet)
v1.DELETE("/daemonsets/:ns/:name", r.handleDeleteDaemonSet)
```

- [ ] **Step 11: Verify full build**

```bash
go build ./...
```

Expected: no output.

- [ ] **Step 12: Commit**

```bash
git add internal/k8s/daemonsets_test.go internal/k8s/client.go internal/k8s/actions.go internal/k8s/actions_test.go internal/api/handlers.go internal/api/router.go
git commit -m "feat(daemonsets): add Go backend — list, rollout-restart, delete"
```

---

## Task 3: DaemonSets React Frontend

**Files:**
- Modify: `web/src/lib/api.ts`
- Create: `web/src/pages/DaemonSets.tsx`
- Create: `web/src/pages/DaemonSets.test.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Write failing test in `web/src/pages/DaemonSets.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { DaemonSets } from './DaemonSets'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockDaemonSets = [
  { name: 'fluentd', namespace: 'logging', desired: 3, current: 3, ready: 3, available: 3, age: '5d' },
  { name: 'node-exporter', namespace: 'monitoring', desired: 2, current: 2, ready: 1, available: 1, age: '2d' },
]

function renderDaemonSets() {
  return render(
    <MemoryRouter initialEntries={['/daemonsets']}>
      <Routes>
        <Route path="/daemonsets" element={<DaemonSets />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('DaemonSets page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchDaemonSets).mockResolvedValue(mockDaemonSets)
  })

  it('renders daemonset names after loading', async () => {
    renderDaemonSets()
    await waitFor(() => expect(screen.getByText('fluentd')).toBeInTheDocument())
    expect(screen.getByText('node-exporter')).toBeInTheDocument()
  })

  it('shows Rollout Restart and Delete buttons', async () => {
    renderDaemonSets()
    await waitFor(() => screen.getByText('fluentd'))
    expect(screen.getAllByTitle('Rollout Restart').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('Delete').length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd web && npx vitest run src/pages/DaemonSets.test.tsx
```

Expected: `FAIL` — module not found / `fetchDaemonSets` undefined.

- [ ] **Step 3: Add API functions to `web/src/lib/api.ts`**

Add `DaemonSetSummary` to the import on line 1:

```typescript
import type { PodSummary, DeploymentSummary, StatefulSetSummary, IngressSummary, HelmReleaseSummary, ContextInfo, ServiceSummary, NodeSummary, NamespaceSummary, ConfigMapSummary, SecretSummary, EventSummary, PodMetricsSummary, NodeMetricsSummary, TopologyGraph, APIResourceInfo, CRDPresence, DaemonSetSummary } from './types'
```

Append at end of file:

```typescript
export async function fetchDaemonSets(namespace: string): Promise<DaemonSetSummary[]> {
  const data = await get<{ items: DaemonSetSummary[] }>(`/api/v1/daemonsets?namespace=${namespace}`)
  return data.items
}

export const rolloutRestartDaemonSet = (ns: string, name: string) =>
  action(`/api/v1/daemonsets/${ns}/${name}/rollout-restart`, 'POST')

export const deleteDaemonSet = (ns: string, name: string) =>
  action(`/api/v1/daemonsets/${ns}/${name}`, 'DELETE')
```

- [ ] **Step 4: Create `web/src/pages/DaemonSets.tsx`**

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { FileCode2, RotateCcw, Trash2 } from 'lucide-react'
import { fetchDaemonSets, rolloutRestartDaemonSet, deleteDaemonSet } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { DaemonSetSummary } from '@/lib/types'

const col = createColumnHelper<DaemonSetSummary>()

export function DaemonSets() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<DaemonSetSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [yamlTarget, setYamlTarget] = useState<DaemonSetSummary | null>(null)
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'restart'; item: DaemonSetSummary } | null>(null)

  const load = useCallback(() => {
    fetchDaemonSets(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const handleConfirm = async () => {
    if (!confirmAction) return
    const { type, item } = confirmAction
    setConfirmAction(null)
    if (type === 'delete') {
      await deleteDaemonSet(item.namespace, item.name).catch(console.error)
    } else {
      await rolloutRestartDaemonSet(item.namespace, item.name).catch(console.error)
    }
    load()
  }

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('desired', { header: 'Desired', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('current', { header: 'Current', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('ready', { header: 'Ready', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('available', { header: 'Available', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button onClick={() => setYamlTarget(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded" title="View/Edit YAML"><FileCode2 size={13} /></button>
          <button onClick={() => setConfirmAction({ type: 'restart', item: row.original })} className="p-1 text-blue-600 hover:bg-blue-50 rounded" title="Rollout Restart"><RotateCcw size={13} /></button>
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
          <h1 className="text-base font-bold text-primary-900">DaemonSets</h1>
          <p className="text-[11px] text-primary-500">{items.length} daemonsets</p>
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
        <YamlSidePanel group="apps" version="v1" resource="daemonsets" namespace={yamlTarget.namespace} name={yamlTarget.name} onClose={() => setYamlTarget(null)} editable />
      )}
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.type === 'delete' ? `Delete daemonset "${confirmAction.item.name}"?` : `Rollout restart "${confirmAction.item.name}"?`}
          description={confirmAction.type === 'delete' ? 'This will delete the DaemonSet and all its pods.' : 'This will restart all pods managed by this DaemonSet.'}
          confirmLabel={confirmAction.type === 'delete' ? 'Delete' : 'Restart'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run test — expect PASS**

```bash
cd web && npx vitest run src/pages/DaemonSets.test.tsx
```

Expected: `PASS`.

- [ ] **Step 6: Add DaemonSets to Sidebar**

In `web/src/components/layout/Sidebar.tsx` line 2, add `Shield` to the import:

```typescript
import { Box, Rocket, Globe, Settings, Server, FolderOpen, Telescope, LayoutDashboard, Cpu, Lock, Activity, BarChart2, GitBranch, Layers, Waypoints, Bird, Network, Package, Shield } from 'lucide-react'
```

In the `Workloads` items array, add after `StatefulSets`:

```typescript
{ label: 'DaemonSets', to: '/daemonsets', icon: <Shield size={14} /> },
```

- [ ] **Step 7: Add DaemonSets route to `web/src/App.tsx`**

Add import after `StatefulSets` import:

```typescript
import { DaemonSets } from '@/pages/DaemonSets'
```

Add route after `<Route path="/statefulsets" ...>`:

```tsx
<Route path="/daemonsets" element={<DaemonSets />} />
```

- [ ] **Step 8: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/api.ts web/src/lib/types.ts web/src/pages/DaemonSets.tsx web/src/pages/DaemonSets.test.tsx web/src/components/layout/Sidebar.tsx web/src/App.tsx
git commit -m "feat(daemonsets): add React page with rollout-restart and delete"
```

---

## Task 4: Jobs Go Backend

**Files:**
- Modify: `internal/k8s/client.go`
- Modify: `internal/k8s/actions.go`
- Create: `internal/k8s/jobs_test.go`
- Modify: `internal/k8s/actions_test.go`

- [ ] **Step 1: Write failing tests in `internal/k8s/jobs_test.go`**

```go
package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestListJobs_ReturnsInNamespace(t *testing.T) {
	completions := int32(1)
	fakeClient := fake.NewSimpleClientset(
		&batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{Name: "backup", Namespace: "default"},
			Spec:       batchv1.JobSpec{Completions: &completions},
			Status: batchv1.JobStatus{
				Succeeded: 1,
				Conditions: []batchv1.JobCondition{
					{Type: batchv1.JobComplete, Status: corev1.ConditionTrue},
				},
			},
		},
		&batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{Name: "other-job", Namespace: "other"},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListJobs(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "backup", items[0].Name)
	assert.Equal(t, "1/1", items[0].Completions)
	assert.Equal(t, "Complete", items[0].Status)
}

func TestListJobs_AllNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&batchv1.Job{ObjectMeta: metav1.ObjectMeta{Name: "job-1", Namespace: "default"}},
		&batchv1.Job{ObjectMeta: metav1.ObjectMeta{Name: "job-2", Namespace: "other"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListJobs(context.Background(), "")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
go test ./internal/k8s/... -run TestListJobs -v
```

Expected: `FAIL` — `client.ListJobs undefined`.

- [ ] **Step 3: Add `ListJobs` to `internal/k8s/client.go`**

Add `batchv1 "k8s.io/api/batch/v1"` to the imports block in `client.go`.

Append after the `toDaemonSetSummary` function:

```go
// ListJobs returns job summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListJobs(ctx context.Context, namespace string) ([]JobSummary, error) {
	list, err := c.kube.BatchV1().Jobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]JobSummary, 0, len(list.Items))
	for _, j := range list.Items {
		summaries = append(summaries, toJobSummary(j))
	}
	return summaries, nil
}

func toJobSummary(j batchv1.Job) JobSummary {
	completions := fmt.Sprintf("%d/1", j.Status.Succeeded)
	if j.Spec.Completions != nil {
		completions = fmt.Sprintf("%d/%d", j.Status.Succeeded, *j.Spec.Completions)
	}
	return JobSummary{
		Name:        j.Name,
		Namespace:   j.Namespace,
		Completions: completions,
		Succeeded:   j.Status.Succeeded,
		Failed:      j.Status.Failed,
		Status:      jobStatus(j),
		Duration:    jobDuration(j),
		Age:         formatAge(j.CreationTimestamp.Time),
	}
}

func jobStatus(j batchv1.Job) string {
	for _, cond := range j.Status.Conditions {
		if cond.Type == batchv1.JobComplete && cond.Status == corev1.ConditionTrue {
			return "Complete"
		}
		if cond.Type == batchv1.JobFailed && cond.Status == corev1.ConditionTrue {
			return "Failed"
		}
	}
	return "Running"
}

func jobDuration(j batchv1.Job) string {
	if j.Status.StartTime == nil {
		return ""
	}
	end := time.Now()
	if j.Status.CompletionTime != nil {
		end = j.Status.CompletionTime.Time
	}
	d := end.Sub(j.Status.StartTime.Time)
	if d < time.Minute {
		return fmt.Sprintf("%ds", int(d.Seconds()))
	}
	if d < time.Hour {
		return fmt.Sprintf("%dm", int(d.Minutes()))
	}
	return fmt.Sprintf("%dh", int(d.Hours()))
}
```

Note: `batchv1` and `corev1` must be in the imports of `client.go`. `corev1` is already imported; add `batchv1 "k8s.io/api/batch/v1"`.

- [ ] **Step 4: Run tests — expect PASS**

```bash
go test ./internal/k8s/... -run TestListJobs -v
```

Expected: `PASS`.

- [ ] **Step 5: Write failing action test — append to `internal/k8s/actions_test.go`**

Add `batchv1 "k8s.io/api/batch/v1"` to the imports in `actions_test.go`, then append:

```go
func TestDeleteJob_RemovesJob(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&batchv1.Job{ObjectMeta: metav1.ObjectMeta{Name: "backup", Namespace: "default"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.DeleteJob(context.Background(), "default", "backup")
	require.NoError(t, err)
	list, _ := fakeClient.BatchV1().Jobs("default").List(context.Background(), metav1.ListOptions{})
	assert.Len(t, list.Items, 0)
}
```

- [ ] **Step 6: Run action test — expect FAIL**

```bash
go test ./internal/k8s/... -run TestDeleteJob -v
```

Expected: `FAIL`.

- [ ] **Step 7: Add `DeleteJob` to `internal/k8s/actions.go`**

Add `batchv1 "k8s.io/api/batch/v1"` to the imports in `actions.go`, then append:

```go
func (c *Client) DeleteJob(ctx context.Context, namespace, name string) error {
	return c.kube.BatchV1().Jobs(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}
```

- [ ] **Step 8: Run action test — expect PASS**

```bash
go test ./internal/k8s/... -run TestDeleteJob -v
```

Expected: `PASS`.

- [ ] **Step 9: Add Jobs handlers to `internal/api/handlers.go`**

Append:

```go
func (r *Router) handleListJobs(c *gin.Context) {
	namespace := c.Query("namespace")
	items, err := r.k8s.ListJobs(c.Request.Context(), namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (r *Router) handleDeleteJob(c *gin.Context) {
	ns, name := c.Param("ns"), c.Param("name")
	if err := r.k8s.DeleteJob(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
```

- [ ] **Step 10: Register Jobs routes in `internal/api/router.go`**

Add after the DaemonSet routes:

```go
v1.GET("/jobs", r.handleListJobs)
v1.DELETE("/jobs/:ns/:name", r.handleDeleteJob)
```

- [ ] **Step 11: Verify full build**

```bash
go build ./...
```

Expected: no output.

- [ ] **Step 12: Commit**

```bash
git add internal/k8s/jobs_test.go internal/k8s/client.go internal/k8s/actions.go internal/k8s/actions_test.go internal/api/handlers.go internal/api/router.go
git commit -m "feat(jobs): add Go backend — list and delete"
```

---

## Task 5: Jobs React Frontend

**Files:**
- Modify: `web/src/lib/api.ts`
- Create: `web/src/pages/Jobs.tsx`
- Create: `web/src/pages/Jobs.test.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Write failing test in `web/src/pages/Jobs.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Jobs } from './Jobs'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockJobs = [
  { name: 'backup', namespace: 'default', completions: '1/1', succeeded: 1, failed: 0, status: 'Complete', duration: '30s', age: '1h' },
  { name: 'migration', namespace: 'default', completions: '0/1', succeeded: 0, failed: 1, status: 'Failed', duration: '5m', age: '2h' },
]

function renderJobs() {
  return render(
    <MemoryRouter initialEntries={['/jobs']}>
      <Routes>
        <Route path="/jobs" element={<Jobs />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Jobs page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchJobs).mockResolvedValue(mockJobs)
  })

  it('renders job names after loading', async () => {
    renderJobs()
    await waitFor(() => expect(screen.getByText('backup')).toBeInTheDocument())
    expect(screen.getByText('migration')).toBeInTheDocument()
  })

  it('shows status badges', async () => {
    renderJobs()
    await waitFor(() => screen.getByText('backup'))
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd web && npx vitest run src/pages/Jobs.test.tsx
```

Expected: `FAIL`.

- [ ] **Step 3: Add API functions to `web/src/lib/api.ts`**

Add `JobSummary` to the import on line 1.

Append at end of file:

```typescript
export async function fetchJobs(namespace: string): Promise<JobSummary[]> {
  const data = await get<{ items: JobSummary[] }>(`/api/v1/jobs?namespace=${namespace}`)
  return data.items
}

export const deleteJob = (ns: string, name: string) =>
  action(`/api/v1/jobs/${ns}/${name}`, 'DELETE')
```

- [ ] **Step 4: Create `web/src/pages/Jobs.tsx`**

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { ConfirmModal } from '@/components/ConfirmModal'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { FileCode2, Trash2 } from 'lucide-react'
import { fetchJobs, deleteJob } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { JobSummary } from '@/lib/types'

const col = createColumnHelper<JobSummary>()

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'Complete' ? 'text-green-600 bg-green-50' :
    status === 'Failed' ? 'text-red-600 bg-red-50' :
    'text-blue-600 bg-blue-50'
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${color}`}>{status}</span>
}

export function Jobs() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<JobSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [yamlTarget, setYamlTarget] = useState<JobSummary | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<JobSummary | null>(null)

  const load = useCallback(() => {
    fetchJobs(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleteTarget(null)
    await deleteJob(deleteTarget.namespace, deleteTarget.name).catch(console.error)
    load()
  }

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('completions', { header: 'Completions', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('status', { header: 'Status', cell: (i) => <StatusBadge status={i.getValue()} /> }),
    col.accessor('duration', { header: 'Duration', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button onClick={() => setYamlTarget(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded" title="View/Edit YAML"><FileCode2 size={13} /></button>
          <button onClick={() => setDeleteTarget(row.original)} className="p-1 text-red-500 hover:bg-red-50 rounded" title="Delete"><Trash2 size={13} /></button>
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
          <h1 className="text-base font-bold text-primary-900">Jobs</h1>
          <p className="text-[11px] text-primary-500">{items.length} jobs</p>
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
        <YamlSidePanel group="batch" version="v1" resource="jobs" namespace={yamlTarget.namespace} name={yamlTarget.name} onClose={() => setYamlTarget(null)} editable />
      )}
      {deleteTarget && (
        <ConfirmModal
          title={`Delete job "${deleteTarget.name}"?`}
          description="This will delete the Job and its associated pods."
          confirmLabel="Delete"
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run test — expect PASS**

```bash
cd web && npx vitest run src/pages/Jobs.test.tsx
```

Expected: `PASS`.

- [ ] **Step 6: Add Jobs to Sidebar**

In `web/src/components/layout/Sidebar.tsx`, add `ListChecks` to the icon import. Then add to the `Workloads` items array after `DaemonSets`:

```typescript
{ label: 'Jobs', to: '/jobs', icon: <ListChecks size={14} /> },
```

Import line becomes:
```typescript
import { Box, Rocket, Globe, Settings, Server, FolderOpen, Telescope, LayoutDashboard, Cpu, Lock, Activity, BarChart2, GitBranch, Layers, Waypoints, Bird, Network, Package, Shield, ListChecks } from 'lucide-react'
```

- [ ] **Step 7: Add Jobs route to `web/src/App.tsx`**

```typescript
import { Jobs } from '@/pages/Jobs'
```

```tsx
<Route path="/jobs" element={<Jobs />} />
```

- [ ] **Step 8: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/api.ts web/src/pages/Jobs.tsx web/src/pages/Jobs.test.tsx web/src/components/layout/Sidebar.tsx web/src/App.tsx
git commit -m "feat(jobs): add React page with status badges and delete"
```

---

## Task 6: CronJobs Go Backend

**Files:**
- Modify: `internal/k8s/client.go`
- Modify: `internal/k8s/actions.go`
- Create: `internal/k8s/cronjobs_test.go`
- Modify: `internal/k8s/actions_test.go`

- [ ] **Step 1: Write failing tests in `internal/k8s/cronjobs_test.go`**

```go
package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	batchv1 "k8s.io/api/batch/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestListCronJobs_ReturnsInNamespace(t *testing.T) {
	suspend := false
	fakeClient := fake.NewSimpleClientset(
		&batchv1.CronJob{
			ObjectMeta: metav1.ObjectMeta{Name: "backup", Namespace: "default"},
			Spec: batchv1.CronJobSpec{
				Schedule: "0 * * * *",
				Suspend:  &suspend,
			},
		},
		&batchv1.CronJob{
			ObjectMeta: metav1.ObjectMeta{Name: "other", Namespace: "other"},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListCronJobs(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "backup", items[0].Name)
	assert.Equal(t, "0 * * * *", items[0].Schedule)
	assert.False(t, items[0].Suspend)
}

func TestListCronJobs_AllNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&batchv1.CronJob{ObjectMeta: metav1.ObjectMeta{Name: "cj-1", Namespace: "default"}},
		&batchv1.CronJob{ObjectMeta: metav1.ObjectMeta{Name: "cj-2", Namespace: "other"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListCronJobs(context.Background(), "")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
go test ./internal/k8s/... -run TestListCronJobs -v
```

Expected: `FAIL`.

- [ ] **Step 3: Add `ListCronJobs` to `internal/k8s/client.go`**

`batchv1` is already imported from Task 4. Append after the `jobDuration` function:

```go
// ListCronJobs returns cronjob summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListCronJobs(ctx context.Context, namespace string) ([]CronJobSummary, error) {
	list, err := c.kube.BatchV1().CronJobs(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]CronJobSummary, 0, len(list.Items))
	for _, cj := range list.Items {
		summaries = append(summaries, toCronJobSummary(cj))
	}
	return summaries, nil
}

func toCronJobSummary(cj batchv1.CronJob) CronJobSummary {
	lastSchedule := "Never"
	if cj.Status.LastScheduleTime != nil {
		lastSchedule = formatAge(cj.Status.LastScheduleTime.Time)
	}
	suspend := cj.Spec.Suspend != nil && *cj.Spec.Suspend
	return CronJobSummary{
		Name:         cj.Name,
		Namespace:    cj.Namespace,
		Schedule:     cj.Spec.Schedule,
		Suspend:      suspend,
		Active:       len(cj.Status.Active),
		LastSchedule: lastSchedule,
		Age:          formatAge(cj.CreationTimestamp.Time),
	}
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
go test ./internal/k8s/... -run TestListCronJobs -v
```

Expected: `PASS`.

- [ ] **Step 5: Write failing action tests — append to `internal/k8s/actions_test.go`**

```go
func TestDeleteCronJob_RemovesCronJob(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&batchv1.CronJob{ObjectMeta: metav1.ObjectMeta{Name: "backup", Namespace: "default"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.DeleteCronJob(context.Background(), "default", "backup")
	require.NoError(t, err)
	list, _ := fakeClient.BatchV1().CronJobs("default").List(context.Background(), metav1.ListOptions{})
	assert.Len(t, list.Items, 0)
}

func TestTriggerCronJob_CreatesJob(t *testing.T) {
	cj := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{Name: "backup", Namespace: "default", UID: "uid-1"},
		Spec: batchv1.CronJobSpec{
			Schedule: "*/5 * * * *",
			JobTemplate: batchv1.JobTemplateSpec{
				Spec: batchv1.JobSpec{
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{
							Containers:    []corev1.Container{{Name: "c", Image: "busybox"}},
							RestartPolicy: corev1.RestartPolicyNever,
						},
					},
				},
			},
		},
	}
	fakeClient := fake.NewSimpleClientset(cj)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.TriggerCronJob(context.Background(), "default", "backup")
	require.NoError(t, err)
	jobs, err := fakeClient.BatchV1().Jobs("default").List(context.Background(), metav1.ListOptions{})
	require.NoError(t, err)
	assert.Len(t, jobs.Items, 1)
	assert.Contains(t, jobs.Items[0].Name, "backup-manual-")
}
```

- [ ] **Step 6: Run action tests — expect FAIL**

```bash
go test ./internal/k8s/... -run "TestDeleteCronJob|TestTriggerCronJob" -v
```

Expected: `FAIL`.

- [ ] **Step 7: Add CronJob actions to `internal/k8s/actions.go`**

`batchv1` is already imported from Task 4. Append:

```go
func (c *Client) DeleteCronJob(ctx context.Context, namespace, name string) error {
	return c.kube.BatchV1().CronJobs(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) TriggerCronJob(ctx context.Context, namespace, name string) error {
	cj, err := c.kube.BatchV1().CronJobs(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get cronjob: %w", err)
	}
	t := true
	jobName := fmt.Sprintf("%s-manual-%d", name, time.Now().Unix())
	job := &batchv1.Job{
		ObjectMeta: metav1.ObjectMeta{
			Name:      jobName,
			Namespace: namespace,
			OwnerReferences: []metav1.OwnerReference{
				{
					APIVersion: "batch/v1",
					Kind:       "CronJob",
					Name:       cj.Name,
					UID:        cj.UID,
					Controller: &t,
				},
			},
		},
		Spec: cj.Spec.JobTemplate.Spec,
	}
	_, err = c.kube.BatchV1().Jobs(namespace).Create(ctx, job, metav1.CreateOptions{})
	return err
}
```

- [ ] **Step 8: Run action tests — expect PASS**

```bash
go test ./internal/k8s/... -run "TestDeleteCronJob|TestTriggerCronJob" -v
```

Expected: `PASS`.

- [ ] **Step 9: Add CronJob handlers to `internal/api/handlers.go`**

Append:

```go
func (r *Router) handleListCronJobs(c *gin.Context) {
	namespace := c.Query("namespace")
	items, err := r.k8s.ListCronJobs(c.Request.Context(), namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (r *Router) handleDeleteCronJob(c *gin.Context) {
	ns, name := c.Param("ns"), c.Param("name")
	if err := r.k8s.DeleteCronJob(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleTriggerCronJob(c *gin.Context) {
	ns, name := c.Param("ns"), c.Param("name")
	if err := r.k8s.TriggerCronJob(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
```

- [ ] **Step 10: Register CronJob routes in `internal/api/router.go`**

Add after the Jobs routes:

```go
v1.GET("/cronjobs", r.handleListCronJobs)
v1.DELETE("/cronjobs/:ns/:name", r.handleDeleteCronJob)
v1.POST("/cronjobs/:ns/:name/trigger", r.handleTriggerCronJob)
```

- [ ] **Step 11: Verify full build**

```bash
go build ./...
```

Expected: no output.

- [ ] **Step 12: Commit**

```bash
git add internal/k8s/cronjobs_test.go internal/k8s/client.go internal/k8s/actions.go internal/k8s/actions_test.go internal/api/handlers.go internal/api/router.go
git commit -m "feat(cronjobs): add Go backend — list, delete, trigger"
```

---

## Task 7: CronJobs React Frontend

**Files:**
- Modify: `web/src/lib/api.ts`
- Create: `web/src/pages/CronJobs.tsx`
- Create: `web/src/pages/CronJobs.test.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Write failing test in `web/src/pages/CronJobs.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { CronJobs } from './CronJobs'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockCronJobs = [
  { name: 'backup', namespace: 'default', schedule: '0 * * * *', suspend: false, active: 0, lastSchedule: '1h', age: '5d' },
  { name: 'cleanup', namespace: 'default', schedule: '0 0 * * *', suspend: true, active: 0, lastSchedule: 'Never', age: '2d' },
]

function renderCronJobs() {
  return render(
    <MemoryRouter initialEntries={['/cronjobs']}>
      <Routes>
        <Route path="/cronjobs" element={<CronJobs />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CronJobs page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchCronJobs).mockResolvedValue(mockCronJobs)
  })

  it('renders cronjob names after loading', async () => {
    renderCronJobs()
    await waitFor(() => expect(screen.getByText('backup')).toBeInTheDocument())
    expect(screen.getByText('cleanup')).toBeInTheDocument()
  })

  it('shows suspend badges', async () => {
    renderCronJobs()
    await waitFor(() => screen.getByText('backup'))
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Suspended')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd web && npx vitest run src/pages/CronJobs.test.tsx
```

Expected: `FAIL`.

- [ ] **Step 3: Add API functions to `web/src/lib/api.ts`**

Add `CronJobSummary` to the import on line 1.

Append at end of file:

```typescript
export async function fetchCronJobs(namespace: string): Promise<CronJobSummary[]> {
  const data = await get<{ items: CronJobSummary[] }>(`/api/v1/cronjobs?namespace=${namespace}`)
  return data.items
}

export const deleteCronJob = (ns: string, name: string) =>
  action(`/api/v1/cronjobs/${ns}/${name}`, 'DELETE')

export const triggerCronJob = (ns: string, name: string) =>
  action(`/api/v1/cronjobs/${ns}/${name}/trigger`, 'POST')
```

- [ ] **Step 4: Create `web/src/pages/CronJobs.tsx`**

```tsx
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
    col.accessor('active', { header: 'Active', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
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
          description={confirmAction.type === 'delete' ? 'This will delete the CronJob.' : 'This will create a new Job immediately from this CronJob\'s template.'}
          confirmLabel={confirmAction.type === 'delete' ? 'Delete' : 'Trigger'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run test — expect PASS**

```bash
cd web && npx vitest run src/pages/CronJobs.test.tsx
```

Expected: `PASS`.

- [ ] **Step 6: Add CronJobs to Sidebar**

Add `Clock` to the icon import in `Sidebar.tsx`:

```typescript
import { Box, Rocket, Globe, Settings, Server, FolderOpen, Telescope, LayoutDashboard, Cpu, Lock, Activity, BarChart2, GitBranch, Layers, Waypoints, Bird, Network, Package, Shield, ListChecks, Clock } from 'lucide-react'
```

Add to `Workloads` items after `Jobs`:

```typescript
{ label: 'CronJobs', to: '/cronjobs', icon: <Clock size={14} /> },
```

- [ ] **Step 7: Add CronJobs route to `web/src/App.tsx`**

```typescript
import { CronJobs } from '@/pages/CronJobs'
```

```tsx
<Route path="/cronjobs" element={<CronJobs />} />
```

- [ ] **Step 8: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/api.ts web/src/pages/CronJobs.tsx web/src/pages/CronJobs.test.tsx web/src/components/layout/Sidebar.tsx web/src/App.tsx
git commit -m "feat(cronjobs): add React page with trigger and delete"
```

---

## Task 8: HPA Go Backend

**Files:**
- Modify: `internal/k8s/client.go`
- Modify: `internal/k8s/actions.go`
- Create: `internal/k8s/hpa_test.go`
- Modify: `internal/k8s/actions_test.go`
- Modify: `internal/api/router.go` (add PATCH to CORS)

- [ ] **Step 1: Write failing tests in `internal/k8s/hpa_test.go`**

```go
package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	autoscalingv2 "k8s.io/api/autoscaling/v2"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestListHPAs_ReturnsInNamespace(t *testing.T) {
	minRep := int32(2)
	fakeClient := fake.NewSimpleClientset(
		&autoscalingv2.HorizontalPodAutoscaler{
			ObjectMeta: metav1.ObjectMeta{Name: "my-hpa", Namespace: "default"},
			Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
				MinReplicas: &minRep,
				MaxReplicas: 10,
				ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{
					Kind: "Deployment",
					Name: "my-app",
				},
			},
			Status: autoscalingv2.HorizontalPodAutoscalerStatus{CurrentReplicas: 3},
		},
		&autoscalingv2.HorizontalPodAutoscaler{
			ObjectMeta: metav1.ObjectMeta{Name: "other-hpa", Namespace: "other"},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListHPAs(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "my-hpa", items[0].Name)
	assert.Equal(t, int32(2), items[0].MinReplicas)
	assert.Equal(t, int32(10), items[0].MaxReplicas)
	assert.Equal(t, "Deployment", items[0].TargetKind)
}

func TestListHPAs_AllNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&autoscalingv2.HorizontalPodAutoscaler{ObjectMeta: metav1.ObjectMeta{Name: "hpa-1", Namespace: "default"}},
		&autoscalingv2.HorizontalPodAutoscaler{ObjectMeta: metav1.ObjectMeta{Name: "hpa-2", Namespace: "other"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListHPAs(context.Background(), "")
	require.NoError(t, err)
	assert.Len(t, items, 2)
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
go test ./internal/k8s/... -run TestListHPAs -v
```

Expected: `FAIL`.

- [ ] **Step 3: Add `ListHPAs` to `internal/k8s/client.go`**

Add to the imports block:
```go
autoscalingv2 "k8s.io/api/autoscaling/v2"
```

Append after the `toCronJobSummary` function:

```go
// ListHPAs returns HPA summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListHPAs(ctx context.Context, namespace string) ([]HPASummary, error) {
	list, err := c.kube.AutoscalingV2().HorizontalPodAutoscalers(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]HPASummary, 0, len(list.Items))
	for _, h := range list.Items {
		summaries = append(summaries, toHPASummary(h))
	}
	return summaries, nil
}

func toHPASummary(h autoscalingv2.HorizontalPodAutoscaler) HPASummary {
	minReplicas := int32(1)
	if h.Spec.MinReplicas != nil {
		minReplicas = *h.Spec.MinReplicas
	}
	return HPASummary{
		Name:            h.Name,
		Namespace:       h.Namespace,
		TargetKind:      h.Spec.ScaleTargetRef.Kind,
		TargetName:      h.Spec.ScaleTargetRef.Name,
		MinReplicas:     minReplicas,
		MaxReplicas:     h.Spec.MaxReplicas,
		CurrentReplicas: h.Status.CurrentReplicas,
		Age:             formatAge(h.CreationTimestamp.Time),
	}
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
go test ./internal/k8s/... -run TestListHPAs -v
```

Expected: `PASS`.

- [ ] **Step 5: Write failing action test — append to `internal/k8s/actions_test.go`**

Add `autoscalingv2 "k8s.io/api/autoscaling/v2"` to imports in `actions_test.go`, then append:

```go
func TestPatchHPALimits_NoError(t *testing.T) {
	minRep := int32(2)
	fakeClient := fake.NewSimpleClientset(
		&autoscalingv2.HorizontalPodAutoscaler{
			ObjectMeta: metav1.ObjectMeta{Name: "my-hpa", Namespace: "default"},
			Spec: autoscalingv2.HorizontalPodAutoscalerSpec{
				MinReplicas: &minRep,
				MaxReplicas: 10,
				ScaleTargetRef: autoscalingv2.CrossVersionObjectReference{Kind: "Deployment", Name: "my-app"},
			},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.PatchHPALimits(context.Background(), "default", "my-hpa", 1, 5)
	require.NoError(t, err)
}
```

- [ ] **Step 6: Run action test — expect FAIL**

```bash
go test ./internal/k8s/... -run TestPatchHPALimits -v
```

Expected: `FAIL`.

- [ ] **Step 7: Add `PatchHPALimits` to `internal/k8s/actions.go`**

Add `autoscalingv2 "k8s.io/api/autoscaling/v2"` to imports in `actions.go`... Actually `autoscalingv2` is not needed in actions.go since we're just doing a patch with a string. No import needed. Append:

```go
func (c *Client) PatchHPALimits(ctx context.Context, namespace, name string, min, max int32) error {
	patch := fmt.Sprintf(`{"spec":{"minReplicas":%d,"maxReplicas":%d}}`, min, max)
	_, err := c.kube.AutoscalingV2().HorizontalPodAutoscalers(namespace).Patch(
		ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{},
	)
	return err
}
```

- [ ] **Step 8: Run action test — expect PASS**

```bash
go test ./internal/k8s/... -run TestPatchHPALimits -v
```

Expected: `PASS`.

- [ ] **Step 9: Add HPA handlers to `internal/api/handlers.go`**

Append:

```go
func (r *Router) handleListHPAs(c *gin.Context) {
	namespace := c.Query("namespace")
	items, err := r.k8s.ListHPAs(c.Request.Context(), namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (r *Router) handlePatchHPALimits(c *gin.Context) {
	ns, name := c.Param("ns"), c.Param("name")
	var body struct {
		MinReplicas int32 `json:"minReplicas"`
		MaxReplicas int32 `json:"maxReplicas"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if err := r.k8s.PatchHPALimits(c.Request.Context(), ns, name, body.MinReplicas, body.MaxReplicas); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
```

- [ ] **Step 10: Register HPA routes + add PATCH to CORS in `internal/api/router.go`**

Add after the CronJob routes:

```go
v1.GET("/hpas", r.handleListHPAs)
v1.PATCH("/hpas/:ns/:name/limits", r.handlePatchHPALimits)
```

In `corsMiddleware()`, update the Allow-Methods header to include PATCH:

```go
c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
```

- [ ] **Step 11: Verify full build**

```bash
go build ./...
```

Expected: no output.

- [ ] **Step 12: Commit**

```bash
git add internal/k8s/hpa_test.go internal/k8s/client.go internal/k8s/actions.go internal/k8s/actions_test.go internal/api/handlers.go internal/api/router.go
git commit -m "feat(hpa): add Go backend — list and patch limits"
```

---

## Task 9: HPA React Frontend

**Files:**
- Modify: `web/src/lib/api.ts`
- Create: `web/src/pages/HPA.tsx`
- Create: `web/src/pages/HPA.test.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Write failing test in `web/src/pages/HPA.test.tsx`**

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { HPA } from './HPA'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockHPAs = [
  { name: 'my-hpa', namespace: 'default', targetKind: 'Deployment', targetName: 'my-app', minReplicas: 2, maxReplicas: 10, currentReplicas: 3, age: '1d' },
]

function renderHPA() {
  return render(
    <MemoryRouter initialEntries={['/hpa']}>
      <Routes>
        <Route path="/hpa" element={<HPA />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('HPA page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchHPAs).mockResolvedValue(mockHPAs)
  })

  it('renders HPA names after loading', async () => {
    renderHPA()
    await waitFor(() => expect(screen.getByText('my-hpa')).toBeInTheDocument())
  })

  it('shows target reference', async () => {
    renderHPA()
    await waitFor(() => screen.getByText('my-hpa'))
    expect(screen.getByText('Deployment/my-app')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd web && npx vitest run src/pages/HPA.test.tsx
```

Expected: `FAIL`.

- [ ] **Step 3: Add API functions to `web/src/lib/api.ts`**

Add `HPASummary` to the import on line 1.

Append at end of file:

```typescript
export async function fetchHPAs(namespace: string): Promise<HPASummary[]> {
  const data = await get<{ items: HPASummary[] }>(`/api/v1/hpas?namespace=${namespace}`)
  return data.items
}

export const patchHPALimits = (ns: string, name: string, minReplicas: number, maxReplicas: number) =>
  action(`/api/v1/hpas/${ns}/${name}/limits`, 'PATCH', { minReplicas, maxReplicas })
```

- [ ] **Step 4: Create `web/src/pages/HPA.tsx`**

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { FileCode2, SlidersHorizontal } from 'lucide-react'
import { fetchHPAs, patchHPALimits } from '@/lib/api'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import type { HPASummary } from '@/lib/types'

const col = createColumnHelper<HPASummary>()

export function HPA() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<HPASummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [yamlTarget, setYamlTarget] = useState<HPASummary | null>(null)
  const [editTarget, setEditTarget] = useState<HPASummary | null>(null)
  const [editMin, setEditMin] = useState(1)
  const [editMax, setEditMax] = useState(10)

  const load = useCallback(() => {
    fetchHPAs(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const handleEditLimits = async () => {
    if (!editTarget) return
    await patchHPALimits(editTarget.namespace, editTarget.name, editMin, editMax).catch(console.error)
    setEditTarget(null)
    load()
  }

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'target',
      header: 'Target',
      cell: ({ row }) => <span className="text-xs">{row.original.targetKind}/{row.original.targetName}</span>,
    }),
    col.accessor('minReplicas', { header: 'Min', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('maxReplicas', { header: 'Max', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('currentReplicas', { header: 'Current', cell: (i) => <span className="text-xs font-medium">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button onClick={() => setYamlTarget(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded" title="View/Edit YAML"><FileCode2 size={13} /></button>
          <button
            onClick={() => {
              setEditTarget(row.original)
              setEditMin(row.original.minReplicas)
              setEditMax(row.original.maxReplicas)
            }}
            className="p-1 text-primary-600 hover:bg-primary-50 rounded"
            title="Edit Limits"
          >
            <SlidersHorizontal size={13} />
          </button>
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
          <h1 className="text-base font-bold text-primary-900">HPA</h1>
          <p className="text-[11px] text-primary-500">{items.length} horizontal pod autoscalers</p>
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

      {editTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-72">
            <h3 className="font-bold text-sm text-primary-900 mb-3">Edit Limits: {editTarget.name}</h3>
            <label className="text-xs text-gray-600 block mb-1">Min Replicas</label>
            <input type="number" min={1} max={editMax} value={editMin} onChange={(e) => setEditMin(parseInt(e.target.value))} className="border border-primary-200 rounded px-3 py-1.5 text-sm w-full mb-3 outline-none focus:border-primary-400" />
            <label className="text-xs text-gray-600 block mb-1">Max Replicas</label>
            <input type="number" min={editMin} max={200} value={editMax} onChange={(e) => setEditMax(parseInt(e.target.value))} className="border border-primary-200 rounded px-3 py-1.5 text-sm w-full mb-4 outline-none focus:border-primary-400" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setEditTarget(null)} className="text-xs px-3 py-1.5 rounded border border-gray-200">Cancel</button>
              <button onClick={handleEditLimits} className="text-xs px-3 py-1.5 rounded bg-primary-600 text-white">Apply</button>
            </div>
          </div>
        </div>
      )}

      {yamlTarget && (
        <YamlSidePanel group="autoscaling" version="v2" resource="horizontalpodautoscalers" namespace={yamlTarget.namespace} name={yamlTarget.name} onClose={() => setYamlTarget(null)} editable />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run test — expect PASS**

```bash
cd web && npx vitest run src/pages/HPA.test.tsx
```

Expected: `PASS`.

- [ ] **Step 6: Add HPA to Sidebar**

Add `ArrowUpDown` to the icon import in `Sidebar.tsx`:

```typescript
import { Box, Rocket, Globe, Settings, Server, FolderOpen, Telescope, LayoutDashboard, Cpu, Lock, Activity, BarChart2, GitBranch, Layers, Waypoints, Bird, Network, Package, Shield, ListChecks, Clock, ArrowUpDown } from 'lucide-react'
```

Add to `Workloads` items after `CronJobs`:

```typescript
{ label: 'HPA', to: '/hpa', icon: <ArrowUpDown size={14} /> },
```

- [ ] **Step 7: Add HPA route to `web/src/App.tsx`**

```typescript
import { HPA } from '@/pages/HPA'
```

```tsx
<Route path="/hpa" element={<HPA />} />
```

- [ ] **Step 8: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/api.ts web/src/pages/HPA.tsx web/src/pages/HPA.test.tsx web/src/components/layout/Sidebar.tsx web/src/App.tsx
git commit -m "feat(hpa): add React page with edit limits modal"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run all Go tests**

```bash
go test ./...
```

Expected: all tests pass, no failures.

- [ ] **Step 2: Run all frontend tests**

```bash
cd web && npx vitest run
```

Expected: all tests pass.

- [ ] **Step 3: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Full build**

```bash
make build
```

Expected: `./k999s` binary built successfully.

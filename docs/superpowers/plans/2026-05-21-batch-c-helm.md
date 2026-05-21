# Batch C — Helm Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Helm releases page that lists releases filtered by namespace and allows deleting them via `helm uninstall`.

**Architecture:** New `internal/helm` package wraps the `helm` CLI via `os/exec`. The existing `Router` struct gains a `helm *helmclient.Client` field initialized in `NewRouter` from `cfg.KubeconfigPath` and `cfg.CurrentContext`. Frontend adds `Helm.tsx` page with a delete action using the already-built `ConfirmModal` component.

**Tech Stack:** Go `os/exec`, `encoding/json`, TypeScript, React, TanStack Table, lucide-react, Tailwind v4

---

## File Map

| File | Change |
|---|---|
| `internal/helm/client.go` | **Create** — `Client`, `ListReleases`, `UninstallRelease`, `ReleaseSummary` |
| `internal/api/router.go` | Add `helm *helmclient.Client` field; initialize in `NewRouter`; add 2 routes |
| `internal/api/handlers.go` | Add `handleListHelmReleases`, `handleUninstallHelmRelease` |
| `web/src/lib/types.ts` | Add `HelmReleaseSummary` |
| `web/src/lib/api.ts` | Add `fetchHelmReleases`, `uninstallHelmRelease` |
| `web/src/pages/Helm.tsx` | **Create** — Helm releases page with ConfirmModal delete |
| `web/src/App.tsx` | Add import + `/helm` route |
| `web/src/components/layout/Sidebar.tsx` | Add `Package` icon import + Helm nav item in Cluster group |

---

## Task 1: internal/helm package

**Files:**
- Create: `internal/helm/client.go`

No unit tests — `helm` CLI cannot be mocked easily in Go unit tests. Compilation (`go build ./...`) is the test.

- [ ] **Step 1.1: Create internal/helm/client.go**

Create `internal/helm/client.go`:

```go
package helm

import (
	"encoding/json"
	"fmt"
	"os/exec"
)

// Client wraps the helm CLI.
type Client struct {
	kubeconfigPath string
	kubeContext    string
}

// NewClient creates a new helm client. kubeconfigPath and kubeContext may be empty
// (helm will use defaults from the environment).
func NewClient(kubeconfigPath, kubeContext string) *Client {
	return &Client{kubeconfigPath: kubeconfigPath, kubeContext: kubeContext}
}

// helmListItem mirrors the helm list -o json output exactly.
type helmListItem struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Revision   string `json:"revision"`
	Updated    string `json:"updated"`
	Status     string `json:"status"`
	Chart      string `json:"chart"`
	AppVersion string `json:"app_version"`
}

// ReleaseSummary is the API response type for a single Helm release.
type ReleaseSummary struct {
	Name       string `json:"name"`
	Namespace  string `json:"namespace"`
	Revision   string `json:"revision"`
	Updated    string `json:"updated"`
	Status     string `json:"status"`
	Chart      string `json:"chart"`
	AppVersion string `json:"appVersion"`
}

// ListReleases returns release summaries. Pass namespace="" for all namespaces.
func (c *Client) ListReleases(namespace string) ([]ReleaseSummary, error) {
	args := []string{"list", "-o", "json"}
	if namespace == "" {
		args = append(args, "--all-namespaces")
	} else {
		args = append(args, "-n", namespace)
	}
	args = c.appendKubeFlags(args)

	out, err := exec.Command("helm", args...).Output()
	if err != nil {
		return nil, fmt.Errorf("helm list: %w", err)
	}

	var items []helmListItem
	if err := json.Unmarshal(out, &items); err != nil {
		return nil, fmt.Errorf("parse helm output: %w", err)
	}

	summaries := make([]ReleaseSummary, len(items))
	for i, item := range items {
		summaries[i] = ReleaseSummary{
			Name:       item.Name,
			Namespace:  item.Namespace,
			Revision:   item.Revision,
			Updated:    item.Updated,
			Status:     item.Status,
			Chart:      item.Chart,
			AppVersion: item.AppVersion,
		}
	}
	return summaries, nil
}

// UninstallRelease runs `helm uninstall <name> -n <namespace>`.
func (c *Client) UninstallRelease(namespace, name string) error {
	args := []string{"uninstall", name, "-n", namespace}
	args = c.appendKubeFlags(args)
	if err := exec.Command("helm", args...).Run(); err != nil {
		return fmt.Errorf("helm uninstall %s/%s: %w", namespace, name, err)
	}
	return nil
}

func (c *Client) appendKubeFlags(args []string) []string {
	if c.kubeconfigPath != "" {
		args = append(args, "--kubeconfig", c.kubeconfigPath)
	}
	if c.kubeContext != "" {
		args = append(args, "--kube-context", c.kubeContext)
	}
	return args
}
```

- [ ] **Step 1.2: Verify it compiles**

```bash
go build ./...
```

Expected: no errors

- [ ] **Step 1.3: Commit**

```bash
git add internal/helm/client.go
git commit -m "feat(helm): add helm.Client wrapping helm CLI (ListReleases, UninstallRelease)"
```

---

## Task 2: Wire helm into Router + handlers

**Files:**
- Modify: `internal/api/router.go`
- Modify: `internal/api/handlers.go`

- [ ] **Step 2.1: Update router.go — add helm field and wire it**

In `internal/api/router.go`:

**Add import** to the import block:
```go
helmclient "github.com/k999s/dashboard/internal/helm"
```

**Add field** to the `Router` struct (after `cfg *config.Config`):
```go
type Router struct {
	engine     *gin.Engine
	k8s        *k8s.Client
	hub        *ws.Hub
	diagnostic diagnostic.Provider
	cfg        *config.Config
	helm       *helmclient.Client
	mu         sync.RWMutex
}
```

**Update `NewRouter`** — replace the struct literal at line 32:
```go
// OLD:
r := &Router{engine: gin.New(), k8s: k8sClient, hub: hub, diagnostic: diag, cfg: cfg}

// NEW:
r := &Router{
	engine:     gin.New(),
	k8s:        k8sClient,
	hub:        hub,
	diagnostic: diag,
	cfg:        cfg,
	helm:       helmclient.NewClient(cfg.KubeconfigPath, cfg.CurrentContext),
}
```

**Add routes** (after the settings routes, before the WebSocket routes — around line 68):
```go
	v1.GET("/helm/releases", r.handleListHelmReleases)
	v1.DELETE("/helm/releases/:namespace/:name", r.handleUninstallHelmRelease)
```

- [ ] **Step 2.2: Add handlers to handlers.go**

In `internal/api/handlers.go`, add after `handleSaveSettings`:

```go
func (r *Router) handleListHelmReleases(c *gin.Context) {
	namespace := c.Query("namespace")
	items, err := r.helm.ListReleases(namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (r *Router) handleUninstallHelmRelease(c *gin.Context) {
	namespace := c.Param("namespace")
	name := c.Param("name")
	if err := r.helm.UninstallRelease(namespace, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
```

- [ ] **Step 2.3: Build and run existing tests**

```bash
go build ./...
go test ./...
```

Expected: no errors, all tests pass (existing handler tests don't cover helm routes)

- [ ] **Step 2.4: Commit**

```bash
git add internal/api/router.go internal/api/handlers.go
git commit -m "feat(helm): wire helm client into Router with list and uninstall endpoints"
```

---

## Task 3: Frontend — Helm page

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`
- Create: `web/src/pages/Helm.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`

- [ ] **Step 3.1: Add HelmReleaseSummary to types.ts**

In `web/src/lib/types.ts`, append at the end:

```ts
export interface HelmReleaseSummary {
  name: string
  namespace: string
  revision: string
  updated: string
  status: string
  chart: string
  appVersion: string
}
```

- [ ] **Step 3.2: Add fetchHelmReleases and uninstallHelmRelease to api.ts**

In `web/src/lib/api.ts`, update the top import to include `HelmReleaseSummary`:

```ts
import type { PodSummary, DeploymentSummary, StatefulSetSummary, IngressSummary, HelmReleaseSummary, ContextInfo, ServiceSummary, NodeSummary, NamespaceSummary, ConfigMapSummary, SecretSummary, EventSummary, PodMetricsSummary, NodeMetricsSummary, TopologyGraph, APIResourceInfo, CRDPresence } from './types'
```

Add at the end of the file:

```ts
export async function fetchHelmReleases(namespace: string): Promise<HelmReleaseSummary[]> {
  const data = await get<{ items: HelmReleaseSummary[] }>(`/api/v1/helm/releases?namespace=${namespace}`)
  return data.items
}

export const uninstallHelmRelease = (namespace: string, name: string) =>
  action(`/api/v1/helm/releases/${namespace}/${name}`, 'DELETE')
```

- [ ] **Step 3.3: Create web/src/pages/Helm.tsx**

Create `web/src/pages/Helm.tsx`:

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { fetchHelmReleases, uninstallHelmRelease } from '@/lib/api'
import { ConfirmModal } from '@/components/ConfirmModal'
import type { HelmReleaseSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const col = createColumnHelper<HelmReleaseSummary>()

function StatusBadge({ status }: { status: string }) {
  const color =
    status === 'deployed' ? 'text-green-600 bg-green-50' :
    status === 'failed' ? 'text-red-600 bg-red-50' :
    status.startsWith('pending') ? 'text-yellow-600 bg-yellow-50' :
    status === 'uninstalling' ? 'text-orange-600 bg-orange-50' :
    'text-gray-600 bg-gray-50'
  return <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', color)}>{status}</span>
}

export function Helm() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<HelmReleaseSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [confirmTarget, setConfirmTarget] = useState<HelmReleaseSummary | null>(null)

  const load = useCallback(() => {
    fetchHelmReleases(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const handleConfirm = async () => {
    if (!confirmTarget) return
    const target = confirmTarget
    setConfirmTarget(null)
    await uninstallHelmRelease(target.namespace, target.name).catch(console.error)
    load()
  }

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('chart', { header: 'Chart', cell: (i) => <span className="text-xs font-mono text-gray-700">{i.getValue()}</span> }),
    col.accessor('appVersion', { header: 'App Version', cell: (i) => <span className="text-xs font-mono text-gray-600">{i.getValue()}</span> }),
    col.accessor('status', { header: 'Status', cell: (i) => <StatusBadge status={i.getValue()} /> }),
    col.accessor('revision', { header: 'Rev', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('updated', { header: 'Updated', cell: (i) => <span className="text-xs text-gray-400">{i.getValue().split('.')[0]}</span> }),
    col.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={() => setConfirmTarget(row.original)}
          className="text-xs px-2 py-0.5 rounded text-red-600 hover:bg-red-50"
        >
          Delete
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
          <h1 className="text-base font-bold text-primary-900">Helm Releases</h1>
          <p className="text-[11px] text-primary-500">{items.length} releases</p>
        </div>
        <div className="flex gap-2 items-center">
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
        {items.length === 0 && (
          <div className="text-center py-8 text-xs text-primary-400">No Helm releases found</div>
        )}
      </div>
      {confirmTarget && (
        <ConfirmModal
          title={`Delete release "${confirmTarget.name}"?`}
          message={`This will run helm uninstall ${confirmTarget.name} -n ${confirmTarget.namespace}. This cannot be undone.`}
          confirmLabel="Delete"
          onConfirm={handleConfirm}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3.4: Add route to App.tsx**

In `web/src/App.tsx`, add import after StatefulSets import:
```tsx
import { Helm } from '@/pages/Helm'
```

Add route after the `/ingress` route:
```tsx
<Route path="/helm" element={<Helm />} />
```

- [ ] **Step 3.5: Add Helm to Sidebar.tsx**

In `web/src/components/layout/Sidebar.tsx`:

Update the lucide import to add `Package`:
```tsx
import { Box, Rocket, Globe, Settings, Server, FolderOpen, Telescope, LayoutDashboard, Cpu, Lock, Activity, BarChart2, GitBranch, Layers, Waypoints, Bird, Network, Package } from 'lucide-react'
```

In the Cluster group items array, add Helm after Nodes:
```tsx
// OLD:
        { label: 'Nodes', to: '/nodes', icon: <Cpu size={14} /> },
        { label: 'Namespaces', to: '/namespaces', icon: <FolderOpen size={14} /> },

// NEW:
        { label: 'Nodes', to: '/nodes', icon: <Cpu size={14} /> },
        { label: 'Helm', to: '/helm', icon: <Package size={14} /> },
        { label: 'Namespaces', to: '/namespaces', icon: <FolderOpen size={14} /> },
```

- [ ] **Step 3.6: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3.7: Run all tests**

```bash
go test ./... && cd web && npx vitest run 2>&1 | tail -3
```

Expected: all PASS

- [ ] **Step 3.8: Build binary**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard && make build 2>&1 | tail -3
```

Expected: binary built successfully

- [ ] **Step 3.9: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts web/src/pages/Helm.tsx web/src/App.tsx web/src/components/layout/Sidebar.tsx
git commit -m "feat(helm): add Helm releases page with list and uninstall"
```

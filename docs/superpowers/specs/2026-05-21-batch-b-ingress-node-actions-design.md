# Design Spec: Batch B — Ingress Page + Node Cordon/Drain

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Two features:

1. **Ingress page** — new sidebar page listing Kubernetes Ingresses (follows the same pattern as Services)
2. **Node cordon/drain** — add Cordon/Uncordon and Drain action buttons to the Nodes page with `ConfirmModal` confirmation

---

## Feature 1 — Ingress Page

### Go Backend

**`internal/k8s/types.go`** — add after `ServiceSummary`:

```go
type IngressSummary struct {
    Name      string `json:"name"`
    Namespace string `json:"namespace"`
    Hosts     string `json:"hosts"`   // comma-joined from spec.rules[*].host
    Address   string `json:"address"` // comma-joined from status.loadBalancer.ingress[*].ip/hostname
    Ports     string `json:"ports"`   // e.g. "80, 443"
    Age       string `json:"age"`
}
```

**`internal/k8s/client.go`** — add `ListIngresses` method:

```go
// ListIngresses returns ingress summaries for the given namespace. Pass "" for all namespaces.
func (c *Client) ListIngresses(ctx context.Context, namespace string) ([]IngressSummary, error) {
    list, err := c.kube.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
    if err != nil {
        return nil, err
    }
    summaries := make([]IngressSummary, 0, len(list.Items))
    for _, ing := range list.Items {
        summaries = append(summaries, toIngressSummary(ing))
    }
    return summaries, nil
}

func toIngressSummary(ing networkingv1.Ingress) IngressSummary {
    var hosts []string
    for _, rule := range ing.Spec.Rules {
        if rule.Host != "" {
            hosts = append(hosts, rule.Host)
        }
    }
    var addrs []string
    for _, lb := range ing.Status.LoadBalancer.Ingress {
        if lb.IP != "" {
            addrs = append(addrs, lb.IP)
        } else if lb.Hostname != "" {
            addrs = append(addrs, lb.Hostname)
        }
    }
    ports := "80"
    if ing.Spec.TLS != nil {
        ports = "80, 443"
    }
    return IngressSummary{
        Name:      ing.Name,
        Namespace: ing.Namespace,
        Hosts:     strings.Join(hosts, ", "),
        Address:   strings.Join(addrs, ", "),
        Ports:     ports,
        Age:       formatAge(ing.CreationTimestamp.Time),
    }
}
```

Required import: `networkingv1 "k8s.io/api/networking/v1"` — add to client.go imports.

**`internal/api/handlers.go`** — add handler:

```go
func (r *Router) handleListIngresses(c *gin.Context) {
    namespace := c.Query("namespace")
    items, err := r.k8s.ListIngresses(c.Request.Context(), namespace)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, gin.H{"items": items})
}
```

**`internal/api/router.go`** — add route after services:

```go
v1.GET("/ingresses", r.handleListIngresses)
```

### TypeScript Frontend

**`web/src/lib/types.ts`** — add after `ServiceSummary`:

```ts
export interface IngressSummary {
  name: string
  namespace: string
  hosts: string
  address: string
  ports: string
  age: string
}
```

**`web/src/lib/api.ts`** — add after `fetchServices`:

```ts
export async function fetchIngresses(namespace: string): Promise<IngressSummary[]> {
  const data = await get<{ items: IngressSummary[] }>(`/api/v1/ingresses?namespace=${namespace}`)
  return data.items
}
```

**`web/src/pages/Ingress.tsx`** — new file, same structure as Services:

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { fetchIngresses } from '@/lib/api'
import type { IngressSummary } from '@/lib/types'

const col = createColumnHelper<IngressSummary>()

export function Ingress() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<IngressSummary[]>([])
  const load = useCallback(() => { fetchIngresses(namespace).then(setItems).catch(console.error) }, [namespace])
  useEffect(() => { load() }, [load])

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('hosts', { header: 'Hosts', cell: (i) => <span className="text-xs font-mono text-gray-700">{i.getValue() || '-'}</span> }),
    col.accessor('address', { header: 'Address', cell: (i) => <span className="text-xs font-mono text-gray-600">{i.getValue() || '<pending>'}</span> }),
    col.accessor('ports', { header: 'Ports', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  ]

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">Ingresses</h1><p className="text-[11px] text-primary-500">{items.length} ingresses</p></div>
        <RefreshButton onRefresh={load} />
      </div>
      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">{table.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map(row => <tr key={row.id} className="border-t border-primary-50 hover:bg-primary-50/50">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  )
}
```

**`web/src/App.tsx`** — add import and route:
```tsx
import { Ingress } from '@/pages/Ingress'
// in Routes:
<Route path="/ingress" element={<Ingress />} />
```

**`web/src/components/layout/AppLayout.tsx` (or Sidebar)** — add Ingress link after Services in the sidebar nav.

---

## Feature 2 — Node Cordon/Drain

### NodeSummary update

**`internal/k8s/types.go`** — add `Schedulable bool` to `NodeSummary`:

```go
type NodeSummary struct {
    Name        string `json:"name"`
    Status      string `json:"status"`
    Roles       string `json:"roles"`
    Age         string `json:"age"`
    Version     string `json:"version"`
    Schedulable bool   `json:"schedulable"` // false when cordoned
}
```

**`internal/k8s/client.go`** — `ListNodes` builds `NodeSummary` inline (around line 321). Add `Schedulable: !n.Spec.Unschedulable` to the struct literal:

```go
out = append(out, NodeSummary{
    Name:        n.Name,
    Status:      status,
    Roles:       rolesStr,
    Age:         formatAge(n.CreationTimestamp.Time),
    Version:     n.Status.NodeInfo.KubeletVersion,
    Schedulable: !n.Spec.Unschedulable,
})
```

### New Go actions

**`internal/k8s/actions.go`** — add two new methods:

```go
// CordonNode marks a node as schedulable (false) or unschedulable (true).
func (c *Client) CordonNode(ctx context.Context, name string, unschedulable bool) error {
    node, err := c.kube.CoreV1().Nodes().Get(ctx, name, metav1.GetOptions{})
    if err != nil {
        return err
    }
    node.Spec.Unschedulable = unschedulable
    _, err = c.kube.CoreV1().Nodes().Update(ctx, node, metav1.UpdateOptions{})
    return err
}

// DrainNode cordons the node then deletes all non-DaemonSet, non-mirror pods running on it.
func (c *Client) DrainNode(ctx context.Context, name string) error {
    if err := c.CordonNode(ctx, name, true); err != nil {
        return err
    }
    pods, err := c.kube.CoreV1().Pods("").List(ctx, metav1.ListOptions{
        FieldSelector: "spec.nodeName=" + name,
    })
    if err != nil {
        return err
    }
    for _, pod := range pods.Items {
        if isOwnedByDaemonSet(pod) || isMirrorPod(pod) {
            continue
        }
        _ = c.kube.CoreV1().Pods(pod.Namespace).Delete(ctx, pod.Name, metav1.DeleteOptions{})
    }
    return nil
}

func isOwnedByDaemonSet(pod corev1.Pod) bool {
    for _, ref := range pod.OwnerReferences {
        if ref.Kind == "DaemonSet" {
            return true
        }
    }
    return false
}

func isMirrorPod(pod corev1.Pod) bool {
    _, ok := pod.Annotations["kubernetes.io/config.mirror"]
    return ok
}
```

### New API routes

**`internal/api/handlers.go`** — add handlers:

```go
func (r *Router) handleCordonNode(c *gin.Context) {
    name := c.Param("name")
    if err := r.k8s.CordonNode(c.Request.Context(), name, true); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.Status(http.StatusNoContent)
}

func (r *Router) handleUncordonNode(c *gin.Context) {
    name := c.Param("name")
    if err := r.k8s.CordonNode(c.Request.Context(), name, false); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.Status(http.StatusNoContent)
}

func (r *Router) handleDrainNode(c *gin.Context) {
    name := c.Param("name")
    if err := r.k8s.DrainNode(c.Request.Context(), name); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.Status(http.StatusNoContent)
}
```

**`internal/api/router.go`** — add routes after node listing:

```go
v1.POST("/nodes/:name/cordon", r.handleCordonNode)
v1.POST("/nodes/:name/uncordon", r.handleUncordonNode)
v1.POST("/nodes/:name/drain", r.handleDrainNode)
```

### TypeScript Frontend

**`web/src/lib/types.ts`** — update `NodeSummary`:

```ts
export interface NodeSummary {
  name: string
  status: 'Ready' | 'NotReady' | string
  roles: string
  age: string
  version: string
  schedulable: boolean
}
```

**`web/src/lib/api.ts`** — add action functions:

```ts
export const cordonNode = (name: string) =>
  action(`/api/v1/nodes/${name}/cordon`, 'POST')

export const uncordonNode = (name: string) =>
  action(`/api/v1/nodes/${name}/uncordon`, 'POST')

export const drainNode = (name: string) =>
  action(`/api/v1/nodes/${name}/drain`, 'POST')
```

**`web/src/pages/Nodes.tsx`** — full rewrite with actions:

- Move column definitions inside the component
- Add `confirmAction: { type: 'cordon' | 'uncordon' | 'drain'; node: NodeSummary } | null` state
- Import `ConfirmModal` and `cordonNode`, `uncordonNode`, `drainNode`
- Actions column: **Cordon** button (shown when `schedulable=true`), **Uncordon** button (shown when `schedulable=false`), **Drain** button (always shown)
- `handleConfirm` dispatches to the right action function
- `ConfirmModal` rendered at bottom, confirms before executing

---

## Sidebar

**`web/src/components/layout/Sidebar.tsx`** — add Ingress after the Services entry (line 43):

```tsx
// Existing:
{ label: 'Services', to: '/services', icon: <Globe size={14} /> },
// Add after:
{ label: 'Ingresses', to: '/ingress', icon: <Globe size={14} /> },
```

Use the same `Globe` icon from lucide-react (already imported) — or swap for a more specific icon if available.

---

## Testing

- `go test ./internal/k8s/... -v` — add `TestListIngresses` and `TestCordonNode` / `TestDrainNode`
- `go test ./...` — all pass
- `cd web && npx tsc --noEmit` — no errors
- `cd web && npx vitest run` — all 31 tests pass

---

## Out of Scope

- Ingress YAML view/edit (can be added in a follow-up using the existing `YamlSidePanel` pattern)
- Drain wait/progress (fire-and-forget is sufficient for a local dashboard)
- Node taints/labels editing

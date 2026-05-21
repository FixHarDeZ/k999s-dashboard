# Batch B — Ingress Page + Node Cordon/Drain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an Ingress listing page and Cordon/Uncordon/Drain actions to the Nodes page.

**Architecture:** Two independent features — Ingress follows the standard Services pattern (Go type → client method → handler → route → TS type → page → sidebar), and Node actions extend the existing actions.go file and rewrite Nodes.tsx with the ConfirmModal already built in Batch A.

**Tech Stack:** Go (k8s.io client-go networking/v1 API), TypeScript, React, TanStack Table, lucide-react, Tailwind v4

---

## File Map

| File | Change |
|---|---|
| `internal/k8s/types.go` | Add `IngressSummary`; add `Schedulable bool` to `NodeSummary` |
| `internal/k8s/client.go` | Add `networkingv1` import; add `ListIngresses` + `toIngressSummary`; update `ListNodes` to set `Schedulable` |
| `internal/k8s/client_test.go` | Add `TestListIngresses_ReturnsInNamespace` |
| `internal/k8s/actions.go` | Add `corev1` import; add `CordonNode` + `DrainNode` + `isOwnedByDaemonSet` + `isMirrorPod` |
| `internal/k8s/actions_test.go` | Add `TestCordonNode_SetsUnschedulable`, `TestUncordonNode_ClearsUnschedulable`, `TestDrainNode_CordonsAndDeletesNonDaemonSetPods` |
| `internal/api/handlers.go` | Add `handleListIngresses`, `handleCordonNode`, `handleUncordonNode`, `handleDrainNode` |
| `internal/api/handlers_test.go` | Add `networkingv1` import + Ingress fixture; add `TestGetIngresses_ReturnsList` |
| `internal/api/router.go` | Add routes for ingresses, node cordon/uncordon/drain |
| `web/src/lib/types.ts` | Add `IngressSummary`; add `schedulable: boolean` to `NodeSummary` |
| `web/src/lib/api.ts` | Add `fetchIngresses`, `cordonNode`, `uncordonNode`, `drainNode` |
| `web/src/pages/Ingress.tsx` | **Create** — Ingress listing page |
| `web/src/pages/Nodes.tsx` | Rewrite — add actions column with Cordon/Uncordon/Drain + ConfirmModal |
| `web/src/App.tsx` | Add `<Route path="/ingress">` |
| `web/src/components/layout/Sidebar.tsx` | Add Ingresses nav item in Network group |

---

## Task 1: Ingress Go Backend (TDD)

**Files:**
- Modify: `internal/k8s/types.go`
- Modify: `internal/k8s/client.go`
- Modify: `internal/k8s/client_test.go`
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/handlers_test.go`
- Modify: `internal/api/router.go`

- [ ] **Step 1.1: Write failing test for ListIngresses**

In `internal/k8s/client_test.go`, add the `networkingv1` import and the test:

```go
// Add to imports:
networkingv1 "k8s.io/api/networking/v1"

// Add test function:
func TestListIngresses_ReturnsInNamespace(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&networkingv1.Ingress{
			ObjectMeta: metav1.ObjectMeta{Name: "ing-1", Namespace: "default"},
			Spec: networkingv1.IngressSpec{
				Rules: []networkingv1.IngressRule{{Host: "example.com"}},
			},
		},
		&networkingv1.Ingress{
			ObjectMeta: metav1.ObjectMeta{Name: "ing-2", Namespace: "other"},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	items, err := client.ListIngresses(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, items, 1)
	assert.Equal(t, "ing-1", items[0].Name)
	assert.Equal(t, "example.com", items[0].Hosts)
}
```

- [ ] **Step 1.2: Run test — expect FAIL**

```bash
go test ./internal/k8s/... -run TestListIngresses -v
```

Expected: `FAIL — k8s.Client.ListIngresses undefined`

- [ ] **Step 1.3: Add IngressSummary to types.go**

In `internal/k8s/types.go`, add after `ServiceSummary`:

```go
type IngressSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Hosts     string `json:"hosts"`
	Address   string `json:"address"`
	Ports     string `json:"ports"`
	Age       string `json:"age"`
}
```

- [ ] **Step 1.4: Add ListIngresses to client.go**

In `internal/k8s/client.go`, add `networkingv1` to the imports block:

```go
networkingv1 "k8s.io/api/networking/v1"
```

Then add these functions after `ListServices`:

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
	if len(ing.Spec.TLS) > 0 {
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

- [ ] **Step 1.5: Run test — expect PASS**

```bash
go test ./internal/k8s/... -run TestListIngresses -v
```

Expected: `PASS`

- [ ] **Step 1.6: Write failing handler test**

In `internal/api/handlers_test.go`, add the `networkingv1` import and an Ingress fixture to `newTestRouter`, then add the test:

Add to imports:
```go
networkingv1 "k8s.io/api/networking/v1"
```

Update `newTestRouter` to include an Ingress:
```go
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
		&networkingv1.Ingress{
			ObjectMeta: metav1.ObjectMeta{Name: "ing-1", Namespace: "default"},
			Spec:       networkingv1.IngressSpec{Rules: []networkingv1.IngressRule{{Host: "example.com"}}},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeK8s, "test-context")
	return api.NewRouter(client, embed.FS{}, nil, nil, &config.Config{})
}
```

Add test:
```go
func TestGetIngresses_ReturnsList(t *testing.T) {
	router := newTestRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/ingresses?namespace=default", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Items []k8s.IngressSummary `json:"items"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Len(t, resp.Items, 1)
	assert.Equal(t, "ing-1", resp.Items[0].Name)
	assert.Equal(t, "example.com", resp.Items[0].Hosts)
}
```

- [ ] **Step 1.7: Run handler test — expect FAIL**

```bash
go test ./internal/api/... -run TestGetIngresses -v
```

Expected: `FAIL — 404 not found`

- [ ] **Step 1.8: Add handler and route**

In `internal/api/handlers.go`, add after `handleListStatefulSets`:

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

In `internal/api/router.go`, add after the services route:

```go
v1.GET("/ingresses", r.handleListIngresses)
```

- [ ] **Step 1.9: Run handler test — expect PASS**

```bash
go test ./internal/api/... -run TestGetIngresses -v
```

Expected: `PASS`

- [ ] **Step 1.10: Run full Go test suite**

```bash
go test ./...
```

Expected: all PASS

- [ ] **Step 1.11: Commit**

```bash
git add internal/k8s/types.go internal/k8s/client.go internal/k8s/client_test.go internal/api/handlers.go internal/api/handlers_test.go internal/api/router.go
git commit -m "feat(ingress): add ListIngresses Go backend and /api/v1/ingresses endpoint"
```

---

## Task 2: Ingress Frontend

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`
- Create: `web/src/pages/Ingress.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`

- [ ] **Step 2.1: Add IngressSummary to types.ts**

In `web/src/lib/types.ts`, add after `ServiceSummary`:

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

- [ ] **Step 2.2: Add fetchIngresses to api.ts**

In `web/src/lib/api.ts`, update the top import to include `IngressSummary`:

```ts
import type { PodSummary, DeploymentSummary, StatefulSetSummary, IngressSummary, ContextInfo, ServiceSummary, NodeSummary, NamespaceSummary, ConfigMapSummary, SecretSummary, EventSummary, PodMetricsSummary, NodeMetricsSummary, TopologyGraph, APIResourceInfo, CRDPresence } from './types'
```

Add after `fetchServices`:

```ts
export async function fetchIngresses(namespace: string): Promise<IngressSummary[]> {
  const data = await get<{ items: IngressSummary[] }>(`/api/v1/ingresses?namespace=${namespace}`)
  return data.items
}
```

- [ ] **Step 2.3: Create Ingress.tsx**

Create `web/src/pages/Ingress.tsx`:

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
        <div>
          <h1 className="text-base font-bold text-primary-900">Ingresses</h1>
          <p className="text-[11px] text-primary-500">{items.length} ingresses</p>
        </div>
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

- [ ] **Step 2.4: Add route to App.tsx**

In `web/src/App.tsx`:

Add import after the StatefulSets import:
```tsx
import { Ingress } from '@/pages/Ingress'
```

Add route after the services route:
```tsx
<Route path="/ingress" element={<Ingress />} />
```

- [ ] **Step 2.5: Add Ingress to Sidebar.tsx**

In `web/src/components/layout/Sidebar.tsx`:

Update the import to add `Network`:
```tsx
import { Box, Rocket, Globe, Settings, Server, FolderOpen, Telescope, LayoutDashboard, Cpu, Lock, Activity, BarChart2, GitBranch, Layers, Waypoints, Bird, Network } from 'lucide-react'
```

In the Network group items array, add Ingresses after Services:
```tsx
// OLD:
{ label: 'Services', to: '/services', icon: <Globe size={14} /> },
...(detectedCRDs?.istio ? ...

// NEW:
{ label: 'Services', to: '/services', icon: <Globe size={14} /> },
{ label: 'Ingresses', to: '/ingress', icon: <Network size={14} /> },
...(detectedCRDs?.istio ? ...
```

- [ ] **Step 2.6: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 2.7: Run all tests**

```bash
go test ./... && cd web && npx vitest run 2>&1 | tail -3
```

Expected: all PASS

- [ ] **Step 2.8: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts web/src/pages/Ingress.tsx web/src/App.tsx web/src/components/layout/Sidebar.tsx
git commit -m "feat(ingress): add Ingress page to frontend"
```

---

## Task 3: Node Cordon/Drain Go Backend (TDD)

**Files:**
- Modify: `internal/k8s/types.go`
- Modify: `internal/k8s/client.go`
- Modify: `internal/k8s/actions.go`
- Modify: `internal/k8s/actions_test.go`
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/router.go`

- [ ] **Step 3.1: Update NodeSummary in types.go**

In `internal/k8s/types.go`, replace the `NodeSummary` struct:

```go
// OLD:
type NodeSummary struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Roles   string `json:"roles"`
	Age     string `json:"age"`
	Version string `json:"version"`
}

// NEW:
type NodeSummary struct {
	Name        string `json:"name"`
	Status      string `json:"status"`
	Roles       string `json:"roles"`
	Age         string `json:"age"`
	Version     string `json:"version"`
	Schedulable bool   `json:"schedulable"`
}
```

- [ ] **Step 3.2: Update ListNodes in client.go to set Schedulable**

In `internal/k8s/client.go`, find the `out = append(out, NodeSummary{...})` block inside `ListNodes` (around line 321) and add `Schedulable`:

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

- [ ] **Step 3.3: Run existing node tests — expect PASS**

```bash
go test ./internal/k8s/... -run TestListNodes -v
```

Expected: `PASS` (Schedulable=true for a node with Unschedulable=false by default)

- [ ] **Step 3.4: Write failing tests for CordonNode and DrainNode**

In `internal/k8s/actions_test.go`, add three new tests:

```go
func TestCordonNode_SetsUnschedulable(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "node-1"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.CordonNode(context.Background(), "node-1", true)
	require.NoError(t, err)
	node, _ := fakeClient.CoreV1().Nodes().Get(context.Background(), "node-1", metav1.GetOptions{})
	assert.True(t, node.Spec.Unschedulable)
}

func TestUncordonNode_ClearsUnschedulable(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Node{
			ObjectMeta: metav1.ObjectMeta{Name: "node-1"},
			Spec:       corev1.NodeSpec{Unschedulable: true},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.CordonNode(context.Background(), "node-1", false)
	require.NoError(t, err)
	node, _ := fakeClient.CoreV1().Nodes().Get(context.Background(), "node-1", metav1.GetOptions{})
	assert.False(t, node.Spec.Unschedulable)
}

func TestDrainNode_CordonsAndDeletesNonDaemonSetPods(t *testing.T) {
	daemonPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name: "ds-pod", Namespace: "default",
			OwnerReferences: []metav1.OwnerReference{{Kind: "DaemonSet", Name: "ds-1"}},
		},
		Spec: corev1.PodSpec{NodeName: "node-1"},
	}
	normalPod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{Name: "normal-pod", Namespace: "default"},
		Spec:       corev1.PodSpec{NodeName: "node-1"},
	}
	fakeClient := fake.NewSimpleClientset(
		&corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "node-1"}},
		daemonPod,
		normalPod,
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.DrainNode(context.Background(), "node-1")
	require.NoError(t, err)

	// Node cordoned
	node, _ := fakeClient.CoreV1().Nodes().Get(context.Background(), "node-1", metav1.GetOptions{})
	assert.True(t, node.Spec.Unschedulable)

	// DaemonSet pod still exists
	_, err = fakeClient.CoreV1().Pods("default").Get(context.Background(), "ds-pod", metav1.GetOptions{})
	assert.NoError(t, err, "DaemonSet pod should NOT be deleted")

	// Normal pod deleted
	_, err = fakeClient.CoreV1().Pods("default").Get(context.Background(), "normal-pod", metav1.GetOptions{})
	assert.Error(t, err, "normal pod should be deleted")
}
```

- [ ] **Step 3.5: Run tests — expect FAIL**

```bash
go test ./internal/k8s/... -run "TestCordonNode|TestUncordonNode|TestDrainNode" -v
```

Expected: `FAIL — CordonNode undefined`

- [ ] **Step 3.6: Add CordonNode and DrainNode to actions.go**

In `internal/k8s/actions.go`, add `corev1 "k8s.io/api/core/v1"` to the imports block.

Then add at the end of the file:

```go
// CordonNode marks the node schedulable (false) or unschedulable (true).
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
// Uses fire-and-forget deletion (does not wait for pods to terminate).
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

- [ ] **Step 3.7: Run tests — expect PASS**

```bash
go test ./internal/k8s/... -run "TestCordonNode|TestUncordonNode|TestDrainNode" -v
```

Expected: all 3 PASS

- [ ] **Step 3.8: Add handlers and routes**

In `internal/api/handlers.go`, add after `handleListIngresses`:

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

In `internal/api/router.go`, add after the `/nodes` GET route:

```go
v1.POST("/nodes/:name/cordon", r.handleCordonNode)
v1.POST("/nodes/:name/uncordon", r.handleUncordonNode)
v1.POST("/nodes/:name/drain", r.handleDrainNode)
```

- [ ] **Step 3.9: Run full Go test suite**

```bash
go test ./...
```

Expected: all PASS

- [ ] **Step 3.10: Commit**

```bash
git add internal/k8s/types.go internal/k8s/client.go internal/k8s/actions.go internal/k8s/actions_test.go internal/api/handlers.go internal/api/router.go
git commit -m "feat(nodes): add CordonNode/DrainNode backend + schedulable field to NodeSummary"
```

---

## Task 4: Node Actions Frontend

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/pages/Nodes.tsx`

- [ ] **Step 4.1: Update NodeSummary in types.ts**

In `web/src/lib/types.ts`, replace `NodeSummary`:

```ts
// OLD:
export interface NodeSummary {
  name: string
  status: 'Ready' | 'NotReady' | string
  roles: string
  age: string
  version: string
}

// NEW:
export interface NodeSummary {
  name: string
  status: 'Ready' | 'NotReady' | string
  roles: string
  age: string
  version: string
  schedulable: boolean
}
```

- [ ] **Step 4.2: Add node action API functions to api.ts**

In `web/src/lib/api.ts`, add after `deleteDeployment`:

```ts
export const cordonNode = (name: string) =>
  action(`/api/v1/nodes/${name}/cordon`, 'POST')

export const uncordonNode = (name: string) =>
  action(`/api/v1/nodes/${name}/uncordon`, 'POST')

export const drainNode = (name: string) =>
  action(`/api/v1/nodes/${name}/drain`, 'POST')
```

- [ ] **Step 4.3: Rewrite Nodes.tsx**

Replace the full content of `web/src/pages/Nodes.tsx`:

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { useEffect, useState, useCallback } from 'react'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { fetchNodes, cordonNode, uncordonNode, drainNode } from '@/lib/api'
import { ConfirmModal } from '@/components/ConfirmModal'
import type { NodeSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const col = createColumnHelper<NodeSummary>()

export function Nodes() {
  const [items, setItems] = useState<NodeSummary[]>([])
  const [confirmAction, setConfirmAction] = useState<{ type: 'cordon' | 'uncordon' | 'drain'; node: NodeSummary } | null>(null)

  const load = useCallback(() => { fetchNodes().then(setItems).catch(console.error) }, [])
  useEffect(() => { load() }, [load])

  const handleConfirm = async () => {
    if (!confirmAction) return
    const { type, node } = confirmAction
    setConfirmAction(null)
    if (type === 'cordon') {
      await cordonNode(node.name).catch(console.error)
    } else if (type === 'uncordon') {
      await uncordonNode(node.name).catch(console.error)
    } else {
      await drainNode(node.name).catch(console.error)
    }
    load()
  }

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('status', { header: 'Status', cell: (i) => <span className={cn('text-xs font-medium', i.getValue() === 'Ready' ? 'text-green-600' : 'text-red-600')}>● {i.getValue()}</span> }),
    col.accessor('schedulable', { header: 'Schedulable', cell: (i) => <span className={cn('text-xs font-medium', i.getValue() ? 'text-green-600' : 'text-yellow-600')}>{i.getValue() ? 'Yes' : 'Cordoned'}</span> }),
    col.accessor('roles', { header: 'Roles', cell: (i) => <span className="text-xs text-gray-600">{i.getValue()}</span> }),
    col.accessor('version', { header: 'Version', cell: (i) => <span className="text-xs font-mono text-gray-600">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          {row.original.schedulable ? (
            <button
              onClick={() => setConfirmAction({ type: 'cordon', node: row.original })}
              className="p-1 text-yellow-600 hover:bg-yellow-50 rounded text-xs"
            >
              Cordon
            </button>
          ) : (
            <button
              onClick={() => setConfirmAction({ type: 'uncordon', node: row.original })}
              className="p-1 text-green-600 hover:bg-green-50 rounded text-xs"
            >
              Uncordon
            </button>
          )}
          <button
            onClick={() => setConfirmAction({ type: 'drain', node: row.original })}
            className="p-1 text-red-500 hover:bg-red-50 rounded text-xs"
          >
            Drain
          </button>
        </div>
      ),
    }),
  ]

  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">Nodes</h1><p className="text-[11px] text-primary-500">{items.length} nodes</p></div>
        <RefreshButton onRefresh={load} />
      </div>
      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">{table.getHeaderGroups().map(hg => <tr key={hg.id}>{hg.headers.map(h => <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">{flexRender(h.column.columnDef.header, h.getContext())}</th>)}</tr>)}</thead>
          <tbody>{table.getRowModel().rows.map(row => <tr key={row.id} className="border-t border-primary-50 hover:bg-primary-50/50">{row.getVisibleCells().map(cell => <td key={cell.id} className="px-3 py-2">{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>)}</tr>)}</tbody>
        </table>
      </div>
      {confirmAction && (
        <ConfirmModal
          title={
            confirmAction.type === 'cordon'
              ? `Cordon node "${confirmAction.node.name}"?`
              : confirmAction.type === 'uncordon'
              ? `Uncordon node "${confirmAction.node.name}"?`
              : `Drain node "${confirmAction.node.name}"?`
          }
          message={
            confirmAction.type === 'drain'
              ? 'This will cordon the node and delete all non-DaemonSet pods running on it.'
              : confirmAction.type === 'cordon'
              ? 'No new pods will be scheduled on this node.'
              : 'This node will become schedulable again.'
          }
          danger={confirmAction.type !== 'uncordon'}
          confirmLabel={confirmAction.type === 'cordon' ? 'Cordon' : confirmAction.type === 'uncordon' ? 'Uncordon' : 'Drain'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4.4: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4.5: Run all tests**

```bash
go test ./... && cd web && npx vitest run 2>&1 | tail -3
```

Expected: all PASS

- [ ] **Step 4.6: Build binary**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard && make build 2>&1 | tail -3
```

Expected: binary built successfully

- [ ] **Step 4.7: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts web/src/pages/Nodes.tsx
git commit -m "feat(nodes): add Cordon/Uncordon/Drain actions with ConfirmModal"
```

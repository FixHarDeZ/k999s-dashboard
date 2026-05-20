# k999s — Plan 4: Topology Diagram + Resource Explorer

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม Namespace Topology diagram (React Flow + dagre) ที่แสดงความเชื่อมโยง Ingress→Service→Deployment→Pods และ Resource Explorer ที่ list ทุก kind รวม CRDs และ Get/Describe resource ใดก็ได้

**Architecture:** Topology คำนวณ nodes/edges server-side ใน Go (matching label selectors) แล้วส่ง JSON ให้ React Flow render. Resource Explorer ใช้ K8s Discovery API หา resource kinds และ dynamic client fetch raw JSON ของ resource ใดก็ได้ โดยไม่ต้องรู้ type ล่วงหน้า.

**Tech Stack:** `@xyflow/react` v12, `dagre` (layout), `k8s.io/client-go/dynamic` (dynamic resource client), `k8s.io/client-go/discovery` (already in client-go)

---

## What exists (Plans 1-3)

```
internal/k8s/client.go     — Client{kube, restConfig, currentContext, kubeconfigPath}
internal/api/router.go     — all existing routes (pods, deployments, services, events, etc.)
web/src/App.tsx             — /topology placeholder, /explorer placeholder
web/src/components/layout/Sidebar.tsx — has Cluster group with Resource Explorer
```

## File Map

```
internal/k8s/
  topology.go      NEW — GetTopology method (nodes + edges computation)
  explorer.go      NEW — ListAPIResources, ListResourceRaw, GetResourceRaw (dynamic client)
  topology_test.go NEW — TestGetTopology_BuildsEdgesFromLabelSelectors
internal/api/
  router.go        MODIFY — add topology + explorer routes
  handlers.go      MODIFY — add handleGetTopology, handleAPIResources, handleResourceList, handleResourceGet
  handlers_test.go MODIFY — add topology + resource tests
web/src/
  lib/
    types.ts       MODIFY — add TopologyGraph, TopologyNode, TopologyEdge, APIResourceInfo
    api.ts         MODIFY — add fetchTopology, fetchAPIResources, fetchResourceList, fetchResourceGet
  pages/
    Topology.tsx   NEW
    ResourceExplorer.tsx NEW
  App.tsx          MODIFY — wire /topology and /explorer routes
  components/layout/Sidebar.tsx MODIFY — add Topology to Overview group
```

---

## Task 1: K8s — Topology + Explorer Methods

**Files:**
- Create: `internal/k8s/topology.go`
- Create: `internal/k8s/topology_test.go`
- Create: `internal/k8s/explorer.go`

- [ ] **Step 1: Write failing topology test**

```go
// internal/k8s/topology_test.go
package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestGetTopology_BuildsEdgesFromLabelSelectors(t *testing.T) {
	labels := map[string]string{"app": "nginx"}
	selector := &metav1.LabelSelector{MatchLabels: labels}

	fakeClient := fake.NewSimpleClientset(
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name: "nginx-pod", Namespace: "default", Labels: labels,
			},
			Status: corev1.PodStatus{Phase: corev1.PodRunning},
		},
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "nginx", Namespace: "default"},
			Spec:       appsv1.DeploymentSpec{Selector: selector},
			Status:     appsv1.DeploymentStatus{Replicas: 1, ReadyReplicas: 1},
		},
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{Name: "nginx-svc", Namespace: "default"},
			Spec:       corev1.ServiceSpec{Selector: labels, Type: corev1.ServiceTypeClusterIP},
		},
	)

	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	graph, err := client.GetTopology(context.Background(), "default")

	require.NoError(t, err)
	// 3 nodes: pod, deployment, service
	assert.Len(t, graph.Nodes, 3)
	// deployment → pod edge + service → pod edge = 2 edges
	assert.Len(t, graph.Edges, 2)
}
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
go test ./internal/k8s/... -run TestGetTopology -v 2>&1 | tail -5
```

Expected: `FAIL` — `client.GetTopology undefined`

- [ ] **Step 3: Create `internal/k8s/topology.go`**

```go
package k8s

import (
	"context"
	"fmt"

	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

type TopologyNode struct {
	ID        string            `json:"id"`
	Kind      string            `json:"kind"`
	Name      string            `json:"name"`
	Namespace string            `json:"namespace"`
	Status    string            `json:"status"`
	Labels    map[string]string `json:"labels,omitempty"`
}

type TopologyEdge struct {
	Source string `json:"source"`
	Target string `json:"target"`
	Label  string `json:"label"` // "manages" | "selects" | "routes"
}

type TopologyGraph struct {
	Nodes []TopologyNode `json:"nodes"`
	Edges []TopologyEdge `json:"edges"`
}

// GetTopology computes namespace resource graph with edges from label selectors.
func (c *Client) GetTopology(ctx context.Context, namespace string) (*TopologyGraph, error) {
	pods, err := c.kube.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	deployments, err := c.kube.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	services, err := c.kube.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	ingresses, err := c.kube.NetworkingV1().Ingresses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		// Ingresses may not exist in all clusters — treat as empty list
		ingresses = &networkingv1.IngressList{}
	}

	var nodes []TopologyNode
	var edges []TopologyEdge

	// Build pod nodes and index by label set
	type podEntry struct {
		id     string
		labels map[string]string
	}
	podEntries := make([]podEntry, 0, len(pods.Items))
	for _, p := range pods.Items {
		id := fmt.Sprintf("pod/%s/%s", p.Namespace, p.Name)
		nodes = append(nodes, TopologyNode{
			ID: id, Kind: "Pod", Name: p.Name, Namespace: p.Namespace,
			Status: string(p.Status.Phase), Labels: p.Labels,
		})
		podEntries = append(podEntries, podEntry{id: id, labels: p.Labels})
	}

	// Build service nodes + edges to matching pods
	svcIDs := map[string]string{} // svc name → node id
	for _, s := range services.Items {
		if len(s.Spec.Selector) == 0 {
			continue
		}
		id := fmt.Sprintf("service/%s/%s", s.Namespace, s.Name)
		svcIDs[s.Name] = id
		nodes = append(nodes, TopologyNode{
			ID: id, Kind: "Service", Name: s.Name, Namespace: s.Namespace,
			Status: string(s.Spec.Type),
		})
		for _, pe := range podEntries {
			if labelsMatchSelector(pe.labels, s.Spec.Selector) {
				edges = append(edges, TopologyEdge{Source: id, Target: pe.id, Label: "selects"})
			}
		}
	}

	// Build deployment nodes + edges to matching pods
	for _, d := range deployments.Items {
		id := fmt.Sprintf("deployment/%s/%s", d.Namespace, d.Name)
		nodes = append(nodes, TopologyNode{
			ID: id, Kind: "Deployment", Name: d.Name, Namespace: d.Namespace,
			Status: fmt.Sprintf("%d/%d", d.Status.ReadyReplicas, d.Status.Replicas),
		})
		if d.Spec.Selector != nil && len(d.Spec.Selector.MatchLabels) > 0 {
			for _, pe := range podEntries {
				if labelsMatchSelector(pe.labels, d.Spec.Selector.MatchLabels) {
					edges = append(edges, TopologyEdge{Source: id, Target: pe.id, Label: "manages"})
				}
			}
		}
	}

	// Build ingress nodes + edges to services
	for _, ing := range ingresses.Items {
		id := fmt.Sprintf("ingress/%s/%s", ing.Namespace, ing.Name)
		nodes = append(nodes, TopologyNode{
			ID: id, Kind: "Ingress", Name: ing.Name, Namespace: ing.Namespace, Status: "Active",
		})
		for _, rule := range ing.Spec.Rules {
			if rule.HTTP == nil {
				continue
			}
			for _, path := range rule.HTTP.Paths {
				if path.Backend.Service == nil {
					continue
				}
				svcName := path.Backend.Service.Name
				if svcID, ok := svcIDs[svcName]; ok {
					edges = append(edges, TopologyEdge{Source: id, Target: svcID, Label: "routes"})
				}
			}
		}
	}

	return &TopologyGraph{Nodes: nodes, Edges: edges}, nil
}

// labelsMatchSelector returns true if all selector key-values exist in labels.
func labelsMatchSelector(labels, selector map[string]string) bool {
	if len(selector) == 0 {
		return false
	}
	for k, v := range selector {
		if labels[k] != v {
			return false
		}
	}
	return true
}
```

- [ ] **Step 4: Run topology test — expect PASS**

```bash
go test ./internal/k8s/... -run TestGetTopology -v 2>&1 | tail -8
```

Expected: `PASS`

- [ ] **Step 5: Create `internal/k8s/explorer.go`**

```go
package k8s

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/client-go/dynamic"
)

// APIResourceInfo describes a single API resource kind.
type APIResourceInfo struct {
	Name       string `json:"name"`
	Kind       string `json:"kind"`
	Group      string `json:"group"`
	Version    string `json:"version"`
	Namespaced bool   `json:"namespaced"`
}

// ListAPIResources returns all namespaced resource types via the discovery API.
func (c *Client) ListAPIResources() ([]APIResourceInfo, error) {
	_, lists, err := c.kube.Discovery().ServerGroupsAndResources()
	if err != nil && lists == nil {
		return nil, err
	}
	var resources []APIResourceInfo
	for _, list := range lists {
		gv, parseErr := schema.ParseGroupVersion(list.GroupVersion)
		if parseErr != nil {
			continue
		}
		for _, r := range list.APIResources {
			if !r.Namespaced {
				continue
			}
			if strings.Contains(r.Name, "/") {
				continue // skip subresources like pods/log
			}
			resources = append(resources, APIResourceInfo{
				Name:       r.Name,
				Kind:       r.Kind,
				Group:      gv.Group,
				Version:    gv.Version,
				Namespaced: r.Namespaced,
			})
		}
	}
	return resources, nil
}

// ListResourceRaw lists resources of any type using the dynamic client.
// Returns a slice of raw JSON objects (name + metadata for display).
func (c *Client) ListResourceRaw(ctx context.Context, group, version, resource, namespace string) ([]map[string]any, error) {
	if c.restConfig == nil {
		return nil, fmt.Errorf("dynamic client not available: no REST config")
	}
	dc, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return nil, err
	}
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	list, err := dc.Resource(gvr).Namespace(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	items := make([]map[string]any, 0, len(list.Items))
	for _, item := range list.Items {
		items = append(items, item.Object)
	}
	return items, nil
}

// GetResourceRaw returns the JSON bytes of a specific resource.
func (c *Client) GetResourceRaw(ctx context.Context, group, version, resource, namespace, name string) ([]byte, error) {
	if c.restConfig == nil {
		return nil, fmt.Errorf("dynamic client not available: no REST config")
	}
	dc, err := dynamic.NewForConfig(c.restConfig)
	if err != nil {
		return nil, err
	}
	gvr := schema.GroupVersionResource{Group: group, Version: version, Resource: resource}
	obj, err := dc.Resource(gvr).Namespace(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	return json.MarshalIndent(obj.Object, "", "  ")
}
```

- [ ] **Step 6: Run ALL k8s tests — expect PASS**

```bash
go test ./internal/k8s/... -v 2>&1 | tail -15
```

Expected: all existing + 1 new TestGetTopology pass.

- [ ] **Step 7: Commit**

```bash
git add internal/k8s/topology.go internal/k8s/topology_test.go internal/k8s/explorer.go
git commit -m "feat: add topology graph computation and dynamic resource explorer methods"
```

---

## Task 2: API — Topology + Explorer Endpoints

**Files:**
- Modify: `internal/api/router.go`
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/handlers_test.go`

- [ ] **Step 1: Add failing tests — append to `internal/api/handlers_test.go`**

```go
func TestGetTopology_ReturnsGraph(t *testing.T) {
	router := newTestRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/topology?namespace=default", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)

	var resp struct {
		Nodes []any `json:"nodes"`
		Edges []any `json:"edges"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	// fake client has 1 pod (nginx) from newTestRouter
	assert.GreaterOrEqual(t, len(resp.Nodes), 1)
}
```

- [ ] **Step 2: Run — expect FAIL**

```bash
go test ./internal/api/... -run TestGetTopology -v 2>&1 | tail -5
```

- [ ] **Step 3: Add routes to `internal/api/router.go`**

After existing `v1.GET("/pods/:namespace/:name/containers", ...)` line, add:

```go
v1.GET("/topology", r.handleGetTopology)
v1.GET("/api-resources", r.handleAPIResources)
v1.GET("/resource-list", r.handleResourceList)
v1.GET("/resource-get", r.handleResourceGet)
```

- [ ] **Step 4: Add handlers to `internal/api/handlers.go`**

Append:

```go
func (r *Router) handleGetTopology(c *gin.Context) {
	namespace := c.Query("namespace")
	if namespace == "" {
		namespace = "default"
	}
	graph, err := r.k8s.GetTopology(c.Request.Context(), namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, graph)
}

func (r *Router) handleAPIResources(c *gin.Context) {
	resources, err := r.k8s.ListAPIResources()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": resources})
}

func (r *Router) handleResourceList(c *gin.Context) {
	group := c.Query("group")
	version := c.Query("version")
	resource := c.Query("resource")
	namespace := c.Query("namespace")
	if version == "" || resource == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "version and resource are required"})
		return
	}
	items, err := r.k8s.ListResourceRaw(c.Request.Context(), group, version, resource, namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (r *Router) handleResourceGet(c *gin.Context) {
	group := c.Query("group")
	version := c.Query("version")
	resource := c.Query("resource")
	namespace := c.Query("namespace")
	name := c.Query("name")
	if version == "" || resource == "" || name == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "version, resource, and name are required"})
		return
	}
	raw, err := r.k8s.GetResourceRaw(c.Request.Context(), group, version, resource, namespace, name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Data(http.StatusOK, "application/json", raw)
}
```

- [ ] **Step 5: Run all Go tests — expect PASS**

```bash
go test ./... 2>&1 | tail -10
```

- [ ] **Step 6: Commit**

```bash
git add internal/api/
git commit -m "feat: add topology and resource explorer API endpoints"
```

---

## Task 3: Frontend — Types + API Functions + Install React Flow

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/lib/api.test.ts`

- [ ] **Step 1: Install React Flow and dagre**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web
npm install @xyflow/react dagre
npm install -D @types/dagre
```

- [ ] **Step 2: Append to `web/src/lib/types.ts`**

```typescript
export interface TopologyNode {
  id: string
  kind: 'Pod' | 'Deployment' | 'Service' | 'Ingress' | string
  name: string
  namespace: string
  status: string
  labels?: Record<string, string>
}

export interface TopologyEdge {
  source: string
  target: string
  label: string
}

export interface TopologyGraph {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
}

export interface APIResourceInfo {
  name: string
  kind: string
  group: string
  version: string
  namespaced: boolean
}
```

- [ ] **Step 3: Write failing test — update import + append to `api.test.ts`**

Update the import line at top of api.test.ts:
```typescript
import { fetchPods, fetchNamespaces, fetchContexts, deletePod, scaleDeployment, fetchEvents, fetchTopology } from './api'
```

Append:
```typescript
describe('fetchTopology', () => {
  it('calls topology endpoint with namespace', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ nodes: [], edges: [] }) })
    await fetchTopology('default')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/topology?namespace=default')
  })
})
```

- [ ] **Step 4: Run — expect FAIL**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web
npx vitest run src/lib/api.test.ts 2>&1 | tail -5
```

- [ ] **Step 5: Append to `web/src/lib/api.ts`**

Update existing import line to add new types:
```typescript
import type { ..., TopologyGraph, APIResourceInfo } from './types'
```

Append:
```typescript
export async function fetchTopology(namespace: string): Promise<TopologyGraph> {
  return get<TopologyGraph>(`/api/v1/topology?namespace=${namespace}`)
}

export async function fetchAPIResources(): Promise<APIResourceInfo[]> {
  const data = await get<{ items: APIResourceInfo[] }>('/api/v1/api-resources')
  return data.items
}

export async function fetchResourceList(
  group: string, version: string, resource: string, namespace: string
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({ group, version, resource, namespace })
  const data = await get<{ items: Record<string, unknown>[] }>(`/api/v1/resource-list?${params}`)
  return data.items
}

export async function fetchResourceGet(
  group: string, version: string, resource: string, namespace: string, name: string
): Promise<string> {
  const params = new URLSearchParams({ group, version, resource, namespace, name })
  const res = await fetch(`/api/v1/resource-get?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return JSON.stringify(json, null, 2)
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
npx vitest run src/lib/api.test.ts 2>&1 | tail -8
```

Expected: 7 tests pass

- [ ] **Step 7: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 8: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/lib/ web/package.json web/package-lock.json
git commit -m "feat: add topology and explorer types, api functions, install @xyflow/react"
```

---

## Task 4: Frontend — Topology Page

**Files:**
- Create: `web/src/pages/Topology.tsx`

- [ ] **Step 1: Create `web/src/pages/Topology.tsx`**

```typescript
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

// ── Dagre layout helper ──────────────────────────────────────────────────────

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

// ── Node color by kind ───────────────────────────────────────────────────────

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

// ── Convert topology graph to React Flow nodes/edges ─────────────────────────

function buildFlowElements(graph: TopologyGraph) {
  const rfNodes: Node[] = graph.nodes.map((n) => ({
    id: n.id,
    type: 'default',
    position: { x: 0, y: 0 }, // overwritten by dagre
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

// ── Detail panel for clicked node ────────────────────────────────────────────

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

// ── Main Topology page ────────────────────────────────────────────────────────

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

  // Sync when graph changes
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
```

- [ ] **Step 2: TypeScript check**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web && npx tsc --noEmit 2>&1 | head -15
```

If there are errors about dagre types, add `/// <reference types="@types/dagre" />` at top of Topology.tsx.

- [ ] **Step 3: Run all frontend tests**

```bash
npx vitest run 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/pages/Topology.tsx
git commit -m "feat: add topology page with react-flow and dagre auto-layout"
```

---

## Task 5: Frontend — Resource Explorer Page

**Files:**
- Create: `web/src/pages/ResourceExplorer.tsx`

- [ ] **Step 1: Create `web/src/pages/ResourceExplorer.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fetchAPIResources, fetchResourceList, fetchResourceGet } from '@/lib/api'
import type { APIResourceInfo } from '@/lib/types'

interface ResourceItem {
  name: string
  creationTimestamp?: string
  raw: Record<string, unknown>
}

function extractName(item: Record<string, unknown>): string {
  const meta = item.metadata as Record<string, unknown> | undefined
  return (meta?.name as string) ?? '(unknown)'
}

function extractAge(item: Record<string, unknown>): string {
  const meta = item.metadata as Record<string, unknown> | undefined
  const ts = meta?.creationTimestamp as string | undefined
  if (!ts) return ''
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (d < 60) return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

// Group resources by API group
function groupResources(resources: APIResourceInfo[]): Record<string, APIResourceInfo[]> {
  const groups: Record<string, APIResourceInfo[]> = {}
  for (const r of resources) {
    const groupName = r.group || 'core (v1)'
    if (!groups[groupName]) groups[groupName] = []
    groups[groupName].push(r)
  }
  return groups
}

export function ResourceExplorer() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''

  const [allResources, setAllResources] = useState<APIResourceInfo[]>([])
  const [selected, setSelected] = useState<APIResourceInfo | null>(null)
  const [items, setItems] = useState<ResourceItem[]>([])
  const [selectedItem, setSelectedItem] = useState<string | null>(null)
  const [yaml, setYaml] = useState<string>('')
  const [loadingItems, setLoadingItems] = useState(false)
  const [loadingYaml, setLoadingYaml] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    fetchAPIResources().then(setAllResources).catch(console.error)
  }, [])

  const handleSelectResource = useCallback(async (res: APIResourceInfo) => {
    setSelected(res)
    setItems([])
    setSelectedItem(null)
    setYaml('')
    setLoadingItems(true)
    try {
      const raw = await fetchResourceList(res.group, res.version, res.name, namespace)
      setItems(raw.map((r) => ({ name: extractName(r), raw: r })))
    } catch (e) {
      setItems([])
    } finally {
      setLoadingItems(false)
    }
  }, [namespace])

  const handleGetYaml = useCallback(async (itemName: string) => {
    if (!selected) return
    setSelectedItem(itemName)
    setYaml('')
    setLoadingYaml(true)
    try {
      const result = await fetchResourceGet(selected.group, selected.version, selected.name, namespace, itemName)
      setYaml(result)
    } catch (e) {
      setYaml(`Error: ${(e as Error).message}`)
    } finally {
      setLoadingYaml(false)
    }
  }, [selected, namespace])

  const handleCopy = () => {
    navigator.clipboard.writeText(yaml).catch(console.error)
  }

  const grouped = groupResources(allResources)
  const filteredGroups = Object.fromEntries(
    Object.entries(grouped).map(([g, rs]) => [
      g, rs.filter((r) => filter === '' || r.kind.toLowerCase().includes(filter.toLowerCase()) || r.name.toLowerCase().includes(filter.toLowerCase()))
    ]).filter(([, rs]) => rs.length > 0)
  )

  return (
    <div style={{ height: 'calc(100vh - 100px)', display: 'flex', flexDirection: 'column' }}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Resource Explorer</h1>
          <p className="text-[11px] text-primary-500">{allResources.length} resource types</p>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, gap: 12, overflow: 'hidden' }}>

        {/* Left: kind list */}
        <div style={{ width: 220, flexShrink: 0, border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid #e0e7ff', background: '#f0f4ff' }}>
            <input
              placeholder="Filter kinds..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              style={{ width: '100%', border: 'none', background: 'transparent', fontSize: 11, outline: 'none', color: '#374151' }}
            />
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {Object.entries(filteredGroups).map(([group, resources]) => (
              <div key={group}>
                <div style={{ padding: '6px 10px 2px', fontSize: 9, fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  {group}
                </div>
                {resources.map((r) => (
                  <button
                    key={`${r.group}/${r.version}/${r.name}`}
                    onClick={() => handleSelectResource(r)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '5px 10px',
                      fontSize: 11, background: selected?.name === r.name && selected?.group === r.group ? '#eef2ff' : 'transparent',
                      color: selected?.name === r.name && selected?.group === r.group ? '#4338ca' : '#374151',
                      border: 'none', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                      fontWeight: selected?.name === r.name && selected?.group === r.group ? 600 : 400,
                    }}
                    onMouseEnter={(e) => { if (!(selected?.name === r.name && selected?.group === r.group)) (e.currentTarget as HTMLElement).style.background = '#f0f4ff' }}
                    onMouseLeave={(e) => { if (!(selected?.name === r.name && selected?.group === r.group)) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    {r.kind}
                    <span style={{ fontSize: 9, color: '#9ca3af', marginLeft: 4 }}>{r.name}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Middle: resource list */}
        <div style={{ width: 280, flexShrink: 0, border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!selected ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9ca3af', fontSize: 12 }}>
              ← Select a resource kind
            </div>
          ) : (
            <>
              <div style={{ padding: '8px 12px', background: '#f0f4ff', borderBottom: '1px solid #e0e7ff', fontSize: 11, fontWeight: 600, color: '#4338ca' }}>
                {selected.kind}
                <span style={{ fontSize: 9, color: '#818cf8', marginLeft: 6 }}>
                  {loadingItems ? 'loading...' : `${items.length} items`}
                </span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {items.map((item) => (
                  <button
                    key={item.name}
                    onClick={() => handleGetYaml(item.name)}
                    style={{
                      width: '100%', textAlign: 'left', padding: '7px 12px', fontSize: 11,
                      background: selectedItem === item.name ? '#eef2ff' : 'transparent',
                      color: selectedItem === item.name ? '#4338ca' : '#374151',
                      border: 'none', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                      fontWeight: selectedItem === item.name ? 600 : 400,
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    }}
                    onMouseEnter={(e) => { if (selectedItem !== item.name) (e.currentTarget as HTMLElement).style.background = '#f0f4ff' }}
                    onMouseLeave={(e) => { if (selectedItem !== item.name) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                  >
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</span>
                    <span style={{ fontSize: 9, color: '#9ca3af', flexShrink: 0, marginLeft: 4 }}>{extractAge(item.raw)}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Right: YAML viewer */}
        <div style={{ flex: 1, border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          {!selectedItem ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, color: '#9ca3af', fontSize: 12 }}>
              ← Select a resource to view
            </div>
          ) : (
            <>
              <div style={{ padding: '6px 12px', background: '#f0f4ff', borderBottom: '1px solid #e0e7ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#4338ca', fontFamily: 'monospace' }}>
                  {selected?.kind}/{selectedItem}
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={handleCopy}
                    style={{ fontSize: 10, padding: '2px 8px', borderRadius: 4, border: '1px solid #c7d2fe', background: '#fff', color: '#4338ca', cursor: 'pointer' }}>
                    📋 Copy
                  </button>
                </div>
              </div>
              <pre style={{
                flex: 1, overflowY: 'auto', margin: 0, padding: 12,
                background: '#0f0e1a', color: '#c7d2fe',
                fontFamily: '"Fira Code", monospace', fontSize: 11, lineHeight: 1.6,
                whiteSpace: 'pre-wrap', wordBreak: 'break-all',
              }}>
                {loadingYaml ? 'Loading...' : yaml}
              </pre>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 3: Run all frontend tests**

```bash
npx vitest run 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/pages/ResourceExplorer.tsx
git commit -m "feat: add resource explorer with dynamic kind discovery and yaml viewer"
```

---

## Task 6: Wire Routes + Sidebar

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update `web/src/App.tsx`** — replace /topology and /explorer placeholders

Read current App.tsx, then add imports and replace placeholder routes:

```typescript
import { Topology } from '@/pages/Topology'
import { ResourceExplorer } from '@/pages/ResourceExplorer'

// Replace:
// <Route path="/topology" ... /> (if exists, or add new)
// <Route path="/explorer" element={<Placeholder title="Resource Explorer" />} />

// With:
<Route path="/topology" element={<Topology />} />
<Route path="/explorer" element={<ResourceExplorer />} />
```

Note: if /topology route doesn't exist yet in App.tsx, add it alongside /explorer.

- [ ] **Step 2: Update `web/src/components/layout/Sidebar.tsx`** — add Topology to Overview group

Add `GitBranch` to lucide-react imports, then add Topology item:

```typescript
import { ..., GitBranch } from 'lucide-react'

// In Overview group items, add:
{ label: 'Topology', to: '/topology', icon: <GitBranch size={14} /> },
```

Updated Overview group:
```typescript
{
  title: 'Overview',
  items: [
    { label: 'Cluster Overview', to: '/', icon: <LayoutDashboard size={14} /> },
    { label: 'Topology', to: '/topology', icon: <GitBranch size={14} /> },
    { label: 'Events', to: '/events', icon: <Activity size={14} /> },
    { label: 'Top', to: '/top', icon: <BarChart2 size={14} /> },
  ],
},
```

- [ ] **Step 3: Update Sidebar test** — add Topology to expected items

In `web/src/components/layout/Sidebar.test.tsx`, the first test checks for `'Pods'`, `'Deployments'`, `'Services'`, `'Nodes'` — these all still exist. No test currently checks for Topology, so existing tests should pass without changes. Just verify.

- [ ] **Step 4: Run all tests**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web && npx vitest run 2>&1 | tail -10
go test ./... 2>&1 | tail -8
```

- [ ] **Step 5: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 6: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/App.tsx web/src/components/layout/Sidebar.tsx
git commit -m "feat: wire topology and resource explorer routes in App, add Topology to sidebar"
```

---

## Verification Checklist

- [ ] `go test ./...` → PASS
- [ ] `cd web && npx vitest run` → PASS
- [ ] `cd web && npx tsc --noEmit` → no errors
- [ ] `/topology` — shows React Flow graph with nodes and edges for namespace
- [ ] Click node → detail panel shows kind, name, status, labels
- [ ] Drag nodes to rearrange — positions are preserved
- [ ] `/explorer` — left panel shows all resource kinds (pods, deployments, and CRDs if any)
- [ ] Click a kind → middle panel shows resource list
- [ ] Click a resource → right panel shows JSON with copy button
- [ ] `make build && ./k999s` — binary works

---

## Next: Plan 5

AI Diagnostic (Ollama/OpenRouter integration), Cluster Overview page, CRD auto-detect (Istio/Gateway/Canary sidebar items)

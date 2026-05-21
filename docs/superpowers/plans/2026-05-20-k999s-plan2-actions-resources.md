# k999s — Plan 2: WebSocket Live Updates + Pod Actions + Resource Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม WebSocket live updates, pod actions (delete/restart), deployment scaling, และ resource pages สำหรับ Services, Nodes, Namespaces, ConfigMaps, Secrets

**Architecture:** Go WebSocket hub broadcast JSON messages เมื่อ K8s informers detect changes → React useWebSocket hook อัพเดท state อัตโนมัติ. Pod/Deployment actions เป็น REST endpoints แยกต่างหาก. แต่ละ resource page ใช้ pattern เดียวกับ Pods.tsx.

**Tech Stack:** gorilla/websocket, client-go informers, React useWebSocket hook, existing gin + TanStack Table

---

## What exists (Plan 1)

```
internal/k8s/client.go      — ListPods, ListDeployments, ListNamespaces, GetContexts
internal/api/router.go      — GET /api/v1/pods, /deployments, /namespaces, /contexts
internal/api/handlers.go    — handler functions
web/src/pages/Pods.tsx      — pods table with stub action buttons
web/src/lib/api.ts          — fetchPods, fetchDeployments, fetchNamespaces, fetchContexts
web/src/lib/types.ts        — PodSummary, DeploymentSummary, ContextInfo
```

## File Map

```
internal/k8s/
  actions.go              NEW — DeletePod, RestartPod, ScaleDeployment, RolloutRestart
  actions_test.go         NEW
  informers.go            NEW — StartInformers, stop channel, callbacks
internal/ws/
  hub.go                  NEW — WebSocket hub, broadcast, register/unregister
internal/api/
  router.go               MODIFY — add WebSocket route + action routes
  handlers.go             MODIFY — add action handlers + ws upgrade handler
  handlers_test.go        MODIFY — add action handler tests
web/src/
  hooks/
    useWebSocket.ts       NEW — connect, parse messages, return live data
  pages/
    Deployments.tsx       NEW
    Services.tsx          NEW
    Nodes.tsx             NEW
    Namespaces.tsx        NEW
    ConfigMaps.tsx        NEW
    Secrets.tsx           NEW
  lib/
    api.ts                MODIFY — add action calls (deletePod, restartPod, scaleDeployment, etc.)
    types.ts              MODIFY — add ServiceSummary, NodeSummary, NamespaceSummary, ConfigMapSummary, SecretSummary
  App.tsx                 MODIFY — wire real page components
```

---

## Task 1: K8s Action Methods (Delete, Restart, Scale, Rollout Restart)

**Files:**
- Create: `internal/k8s/actions.go`
- Create: `internal/k8s/actions_test.go`

- [ ] **Step 1: Write failing tests**

```go
// internal/k8s/actions_test.go
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

func TestDeletePod_RemovesPod(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "default"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.DeletePod(context.Background(), "default", "pod-1")
	require.NoError(t, err)

	pods, _ := fakeClient.CoreV1().Pods("default").List(context.Background(), metav1.ListOptions{})
	assert.Len(t, pods.Items, 0)
}

func TestScaleDeployment_UpdatesReplicas(t *testing.T) {
	replicas := int32(3)
	fakeClient := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{Name: "api", Namespace: "default"},
			Spec:       appsv1.DeploymentSpec{Replicas: &replicas},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.ScaleDeployment(context.Background(), "default", "api", 5)
	require.NoError(t, err)

	d, _ := fakeClient.AppsV1().Deployments("default").Get(context.Background(), "api", metav1.GetOptions{})
	assert.Equal(t, int32(5), *d.Spec.Replicas)
}
```

- [ ] **Step 2: Run — expect FAIL**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
go test ./internal/k8s/... -run TestDeletePod -v 2>&1 | tail -5
```

Expected: `FAIL` — `client.DeletePod undefined`

- [ ] **Step 3: Implement `internal/k8s/actions.go`**

```go
package k8s

import (
	"context"
	"fmt"
	"time"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
)

func (c *Client) DeletePod(ctx context.Context, namespace, name string) error {
	return c.kube.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

// RestartPod deletes the pod and lets the controller recreate it.
func (c *Client) RestartPod(ctx context.Context, namespace, name string) error {
	return c.kube.CoreV1().Pods(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}

func (c *Client) ScaleDeployment(ctx context.Context, namespace, name string, replicas int32) error {
	scale, err := c.kube.AppsV1().Deployments(namespace).GetScale(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get scale: %w", err)
	}
	scale.Spec.Replicas = replicas
	_, err = c.kube.AppsV1().Deployments(namespace).UpdateScale(ctx, name, scale, metav1.UpdateOptions{})
	return err
}

func (c *Client) RolloutRestartDeployment(ctx context.Context, namespace, name string) error {
	patch := fmt.Sprintf(
		`{"spec":{"template":{"metadata":{"annotations":{"kubectl.kubernetes.io/restartedAt":"%s"}}}}}`,
		time.Now().UTC().Format(time.RFC3339),
	)
	_, err := c.kube.AppsV1().Deployments(namespace).Patch(
		ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{},
	)
	return err
}

func (c *Client) DeleteDeployment(ctx context.Context, namespace, name string) error {
	return c.kube.AppsV1().Deployments(namespace).Delete(ctx, name, metav1.DeleteOptions{})
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
go test ./internal/k8s/... -v 2>&1 | tail -10
```

Expected: all PASS (including existing 3 + new 2)

- [ ] **Step 5: Commit**

```bash
git add internal/k8s/actions.go internal/k8s/actions_test.go
git commit -m "feat: add pod delete/restart and deployment scale/rollout-restart actions"
```

---

## Task 2: More K8s List Methods + Types

**Files:**
- Modify: `internal/k8s/types.go`
- Modify: `internal/k8s/client.go`
- Modify: `internal/k8s/client_test.go`

- [ ] **Step 1: Add new types to `internal/k8s/types.go`**

Append to existing file:

```go
type ServiceSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Type      string `json:"type"`
	ClusterIP string `json:"clusterIP"`
	Ports     string `json:"ports"`
	Age       string `json:"age"`
}

type NodeSummary struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Roles   string `json:"roles"`
	Age     string `json:"age"`
	Version string `json:"version"`
}

type NamespaceSummary struct {
	Name   string `json:"name"`
	Status string `json:"status"`
	Age    string `json:"age"`
}

type ConfigMapSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	DataCount int    `json:"dataCount"`
	Age       string `json:"age"`
}

type SecretSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Type      string `json:"type"`
	DataCount int    `json:"dataCount"`
	Age       string `json:"age"`
}
```

- [ ] **Step 2: Add failing tests to `internal/k8s/client_test.go`**

Append to existing test file:

```go
func TestListServices_ReturnsList(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{Name: "svc-1", Namespace: "default"},
			Spec:       corev1.ServiceSpec{Type: corev1.ServiceTypeClusterIP, ClusterIP: "10.0.0.1"},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	svcs, err := client.ListServices(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, svcs, 1)
	assert.Equal(t, "svc-1", svcs[0].Name)
}

func TestListNodes_ReturnsList(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Node{ObjectMeta: metav1.ObjectMeta{Name: "node-1"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	nodes, err := client.ListNodes(context.Background())
	require.NoError(t, err)
	assert.Len(t, nodes, 1)
	assert.Equal(t, "node-1", nodes[0].Name)
}
```

- [ ] **Step 3: Run — expect FAIL**

```bash
go test ./internal/k8s/... -run TestListServices -v 2>&1 | tail -5
```

Expected: `FAIL` — `client.ListServices undefined`

- [ ] **Step 4: Add list methods to `internal/k8s/client.go`**

Append to existing file:

```go
import (
	"fmt"
	"strings"
	corev1 "k8s.io/api/core/v1"
)

func (c *Client) ListServices(ctx context.Context, namespace string) ([]ServiceSummary, error) {
	list, err := c.kube.CoreV1().Services(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]ServiceSummary, 0, len(list.Items))
	for _, s := range list.Items {
		ports := make([]string, 0, len(s.Spec.Ports))
		for _, p := range s.Spec.Ports {
			ports = append(ports, fmt.Sprintf("%d/%s", p.Port, p.Protocol))
		}
		out = append(out, ServiceSummary{
			Name:      s.Name,
			Namespace: s.Namespace,
			Type:      string(s.Spec.Type),
			ClusterIP: s.Spec.ClusterIP,
			Ports:     strings.Join(ports, ", "),
			Age:       formatAge(s.CreationTimestamp.Time),
		})
	}
	return out, nil
}

func (c *Client) ListNodes(ctx context.Context) ([]NodeSummary, error) {
	list, err := c.kube.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]NodeSummary, 0, len(list.Items))
	for _, n := range list.Items {
		status := "NotReady"
		for _, cond := range n.Status.Conditions {
			if cond.Type == corev1.NodeReady && cond.Status == corev1.ConditionTrue {
				status = "Ready"
			}
		}
		roles := []string{}
		for k := range n.Labels {
			if strings.HasPrefix(k, "node-role.kubernetes.io/") {
				roles = append(roles, strings.TrimPrefix(k, "node-role.kubernetes.io/"))
			}
		}
		rolesStr := strings.Join(roles, ",")
		if rolesStr == "" {
			rolesStr = "<none>"
		}
		version := n.Status.NodeInfo.KubeletVersion
		out = append(out, NodeSummary{
			Name:    n.Name,
			Status:  status,
			Roles:   rolesStr,
			Age:     formatAge(n.CreationTimestamp.Time),
			Version: version,
		})
	}
	return out, nil
}

func (c *Client) ListNamespaceSummaries(ctx context.Context) ([]NamespaceSummary, error) {
	list, err := c.kube.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]NamespaceSummary, 0, len(list.Items))
	for _, n := range list.Items {
		out = append(out, NamespaceSummary{
			Name:   n.Name,
			Status: string(n.Status.Phase),
			Age:    formatAge(n.CreationTimestamp.Time),
		})
	}
	return out, nil
}

func (c *Client) ListConfigMaps(ctx context.Context, namespace string) ([]ConfigMapSummary, error) {
	list, err := c.kube.CoreV1().ConfigMaps(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]ConfigMapSummary, 0, len(list.Items))
	for _, cm := range list.Items {
		out = append(out, ConfigMapSummary{
			Name:      cm.Name,
			Namespace: cm.Namespace,
			DataCount: len(cm.Data),
			Age:       formatAge(cm.CreationTimestamp.Time),
		})
	}
	return out, nil
}

func (c *Client) ListSecrets(ctx context.Context, namespace string) ([]SecretSummary, error) {
	list, err := c.kube.CoreV1().Secrets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]SecretSummary, 0, len(list.Items))
	for _, s := range list.Items {
		out = append(out, SecretSummary{
			Name:      s.Name,
			Namespace: s.Namespace,
			Type:      string(s.Type),
			DataCount: len(s.Data),
			Age:       formatAge(s.CreationTimestamp.Time),
		})
	}
	return out, nil
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
go test ./internal/k8s/... -v 2>&1 | tail -12
```

Expected: all PASS (5 original + 2 new = 7 tests)

- [ ] **Step 6: Commit**

```bash
git add internal/k8s/types.go internal/k8s/client.go internal/k8s/client_test.go
git commit -m "feat: add service, node, namespace, configmap, secret list methods"
```

---

## Task 3: REST API — Action Routes + New Resource Endpoints

**Files:**
- Modify: `internal/api/router.go`
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/handlers_test.go`

- [ ] **Step 1: Add failing action tests to `internal/api/handlers_test.go`**

Append to existing test file:

```go
func TestDeletePod_Returns204(t *testing.T) {
	router := newTestRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("DELETE", "/api/v1/pods/default/nginx", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusNoContent, w.Code)
}

func TestGetServices_ReturnsList(t *testing.T) {
	router := newTestRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/services?namespace=default", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}
```

- [ ] **Step 2: Run — expect FAIL**

```bash
go test ./internal/api/... -run TestDeletePod -v 2>&1 | tail -5
```

Expected: `FAIL` — 404 not found

- [ ] **Step 3: Add routes to `internal/api/router.go`**

Add inside `NewRouter` after existing `v1` routes:

```go
// Pod actions
v1.DELETE("/pods/:namespace/:name", r.handleDeletePod)
v1.POST("/pods/:namespace/:name/restart", r.handleRestartPod)

// Deployment actions
v1.POST("/deployments/:namespace/:name/scale", r.handleScaleDeployment)
v1.POST("/deployments/:namespace/:name/rollout-restart", r.handleRolloutRestartDeployment)
v1.DELETE("/deployments/:namespace/:name", r.handleDeleteDeployment)

// More resources
v1.GET("/services", r.handleListServices)
v1.GET("/nodes", r.handleListNodes)
v1.GET("/namespace-summaries", r.handleListNamespaceSummaries)
v1.GET("/configmaps", r.handleListConfigMaps)
v1.GET("/secrets", r.handleListSecrets)
```

- [ ] **Step 4: Add action handlers to `internal/api/handlers.go`**

Append to existing file:

```go
func (r *Router) handleDeletePod(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	if err := r.k8s.DeletePod(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleRestartPod(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	if err := r.k8s.RestartPod(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleScaleDeployment(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	var body struct {
		Replicas int32 `json:"replicas"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "replicas required"})
		return
	}
	if err := r.k8s.ScaleDeployment(c.Request.Context(), ns, name, body.Replicas); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleRolloutRestartDeployment(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	if err := r.k8s.RolloutRestartDeployment(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleDeleteDeployment(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	if err := r.k8s.DeleteDeployment(c.Request.Context(), ns, name); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}

func (r *Router) handleListServices(c *gin.Context) {
	svcs, err := r.k8s.ListServices(c.Request.Context(), c.Query("namespace"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": svcs})
}

func (r *Router) handleListNodes(c *gin.Context) {
	nodes, err := r.k8s.ListNodes(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": nodes})
}

func (r *Router) handleListNamespaceSummaries(c *gin.Context) {
	nss, err := r.k8s.ListNamespaceSummaries(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": nss})
}

func (r *Router) handleListConfigMaps(c *gin.Context) {
	cms, err := r.k8s.ListConfigMaps(c.Request.Context(), c.Query("namespace"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": cms})
}

func (r *Router) handleListSecrets(c *gin.Context) {
	secrets, err := r.k8s.ListSecrets(c.Request.Context(), c.Query("namespace"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": secrets})
}
```

- [ ] **Step 5: Run all Go tests — expect PASS**

```bash
go test ./... -v 2>&1 | tail -15
```

Expected: all PASS

- [ ] **Step 6: Commit**

```bash
git add internal/api/
git commit -m "feat: add action endpoints (delete/restart/scale) and resource list endpoints"
```

---

## Task 4: WebSocket Hub (Go)

**Files:**
- Create: `internal/ws/hub.go`
- Modify: `internal/api/router.go` (add WS route)
- Modify: `internal/api/handlers.go` (add WS handler)

- [ ] **Step 1: Install gorilla/websocket**

```bash
go get github.com/gorilla/websocket
```

- [ ] **Step 2: Create `internal/ws/hub.go`**

```go
package ws

import (
	"encoding/json"
	"log"
	"sync"

	"github.com/gorilla/websocket"
)

// Message is a JSON message broadcast to all connected clients.
type Message struct {
	Type string `json:"type"`
	Data any    `json:"data"`
}

// Hub manages WebSocket connections and broadcasts.
type Hub struct {
	mu      sync.RWMutex
	clients map[*websocket.Conn]struct{}
}

func NewHub() *Hub {
	return &Hub{clients: make(map[*websocket.Conn]struct{})}
}

func (h *Hub) Register(conn *websocket.Conn) {
	h.mu.Lock()
	h.clients[conn] = struct{}{}
	h.mu.Unlock()
}

func (h *Hub) Unregister(conn *websocket.Conn) {
	h.mu.Lock()
	delete(h.clients, conn)
	h.mu.Unlock()
	conn.Close()
}

func (h *Hub) Broadcast(msgType string, data any) {
	msg := Message{Type: msgType, Data: data}
	payload, err := json.Marshal(msg)
	if err != nil {
		log.Printf("ws: marshal error: %v", err)
		return
	}
	h.mu.RLock()
	defer h.mu.RUnlock()
	for conn := range h.clients {
		if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
			log.Printf("ws: write error: %v", err)
		}
	}
}
```

- [ ] **Step 3: Add WebSocket route to `internal/api/router.go`**

Add to `NewRouter` function — update signature to accept `*ws.Hub` and add the route:

```go
import "github.com/k999s/dashboard/internal/ws"

type Router struct {
	engine *gin.Engine
	k8s    *k8s.Client
	hub    *ws.Hub
}

func NewRouter(k8sClient *k8s.Client, webFS embed.FS, hub *ws.Hub) *Router {
	// ... existing code ...
	r := &Router{engine: gin.New(), k8s: k8sClient, hub: hub}
	// ... existing routes ...
	r.engine.GET("/ws", r.handleWebSocket)
	// ...
}
```

- [ ] **Step 4: Add WS handler to `internal/api/handlers.go`**

```go
import (
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func (r *Router) handleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	r.hub.Register(conn)
	defer r.hub.Unregister(conn)
	// keep connection alive, read and discard client messages
	for {
		if _, _, err := conn.ReadMessage(); err != nil {
			break
		}
	}
}
```

- [ ] **Step 5: Update `cmd/k999s/main.go`** to create hub and pass it

```go
import "github.com/k999s/dashboard/internal/ws"

func main() {
	// ... existing config + k8sClient setup ...
	hub := ws.NewHub()
	router := api.NewRouter(k8sClient, webFS, hub)
	// ...
}
```

- [ ] **Step 6: Update `internal/api/handlers_test.go`** to pass nil hub

```go
func newTestRouter() *api.Router {
	// ...
	return api.NewRouter(client, embed.FS{}, nil)
}
```

Update `NewRouter` to handle nil hub:
```go
func NewRouter(k8sClient *k8s.Client, webFS embed.FS, hub *ws.Hub) *Router {
	r := &Router{engine: gin.New(), k8s: k8sClient, hub: hub}
	// ...
	if hub != nil {
		r.engine.GET("/ws", r.handleWebSocket)
	}
}
```

- [ ] **Step 7: Run all Go tests**

```bash
go test ./... 2>&1 | tail -8
```

Expected: all PASS

- [ ] **Step 8: Commit**

```bash
git add internal/ws/ internal/api/ cmd/k999s/main.go
git commit -m "feat: add websocket hub for broadcasting live resource updates"
```

---

## Task 5: Frontend — API Client Actions + TypeScript Types

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`

- [ ] **Step 1: Append new types to `web/src/lib/types.ts`**

```typescript
export interface ServiceSummary {
  name: string
  namespace: string
  type: string
  clusterIP: string
  ports: string
  age: string
}

export interface NodeSummary {
  name: string
  status: 'Ready' | 'NotReady' | string
  roles: string
  age: string
  version: string
}

export interface NamespaceSummary {
  name: string
  status: string
  age: string
}

export interface ConfigMapSummary {
  name: string
  namespace: string
  dataCount: number
  age: string
}

export interface SecretSummary {
  name: string
  namespace: string
  type: string
  dataCount: number
  age: string
}
```

- [ ] **Step 2: Write failing tests for new API functions in `web/src/lib/api.test.ts`**

Append to existing test file:

```typescript
describe('deletePod', () => {
  it('calls DELETE endpoint', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await deletePod('default', 'nginx')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/pods/default/nginx', { method: 'DELETE' })
  })
})

describe('scaleDeployment', () => {
  it('calls POST with replicas body', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true })
    await scaleDeployment('default', 'api', 3)
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/deployments/default/api/scale',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ replicas: 3 }) })
    )
  })
})
```

Also add imports at top of test file:
```typescript
import { fetchPods, fetchNamespaces, fetchContexts, deletePod, scaleDeployment } from './api'
```

- [ ] **Step 3: Run — expect FAIL**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web
npx vitest run src/lib/api.test.ts 2>&1 | tail -8
```

Expected: `FAIL` — `deletePod` not found

- [ ] **Step 4: Add action functions + new fetch functions to `web/src/lib/api.ts`**

Append to existing file:

```typescript
import type { ServiceSummary, NodeSummary, NamespaceSummary, ConfigMapSummary, SecretSummary } from './types'

async function action(path: string, method: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export const deletePod = (ns: string, name: string) =>
  action(`/api/v1/pods/${ns}/${name}`, 'DELETE')

export const restartPod = (ns: string, name: string) =>
  action(`/api/v1/pods/${ns}/${name}/restart`, 'POST')

export const scaleDeployment = (ns: string, name: string, replicas: number) =>
  action(`/api/v1/deployments/${ns}/${name}/scale`, 'POST', { replicas })

export const rolloutRestartDeployment = (ns: string, name: string) =>
  action(`/api/v1/deployments/${ns}/${name}/rollout-restart`, 'POST')

export const deleteDeployment = (ns: string, name: string) =>
  action(`/api/v1/deployments/${ns}/${name}`, 'DELETE')

export async function fetchServices(namespace: string): Promise<ServiceSummary[]> {
  const data = await get<{ items: ServiceSummary[] }>(`/api/v1/services?namespace=${namespace}`)
  return data.items
}

export async function fetchNodes(): Promise<NodeSummary[]> {
  const data = await get<{ items: NodeSummary[] }>('/api/v1/nodes')
  return data.items
}

export async function fetchNamespaceSummaries(): Promise<NamespaceSummary[]> {
  const data = await get<{ items: NamespaceSummary[] }>('/api/v1/namespace-summaries')
  return data.items
}

export async function fetchConfigMaps(namespace: string): Promise<ConfigMapSummary[]> {
  const data = await get<{ items: ConfigMapSummary[] }>(`/api/v1/configmaps?namespace=${namespace}`)
  return data.items
}

export async function fetchSecrets(namespace: string): Promise<SecretSummary[]> {
  const data = await get<{ items: SecretSummary[] }>(`/api/v1/secrets?namespace=${namespace}`)
  return data.items
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run src/lib/api.test.ts 2>&1 | tail -8
```

Expected: all PASS (5 total)

- [ ] **Step 6: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/lib/
git commit -m "feat: add action api functions and new resource types"
```

---

## Task 6: Wire Pod Actions + useWebSocket Hook

**Files:**
- Create: `web/src/hooks/useWebSocket.ts`
- Modify: `web/src/pages/Pods.tsx`

- [ ] **Step 1: Create `web/src/hooks/useWebSocket.ts`**

```typescript
import { useEffect, useRef, useCallback } from 'react'

export interface WsMessage<T = unknown> {
  type: string
  data: T
}

export function useWebSocket(onMessage: (msg: WsMessage) => void) {
  const wsRef = useRef<WebSocket | null>(null)
  const onMessageRef = useRef(onMessage)
  onMessageRef.current = onMessage

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as WsMessage
        onMessageRef.current(msg)
      } catch { /* ignore malformed */ }
    }

    ws.onclose = () => {
      // reconnect after 3s
      setTimeout(connect, 3000)
    }

    wsRef.current = ws
  }, [])

  useEffect(() => {
    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [connect])
}
```

- [ ] **Step 2: Update `web/src/pages/Pods.tsx`** — wire Delete + Restart buttons with confirmation

Replace the entire file:

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createColumnHelper, flexRender, getCoreRowModel,
  getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState,
} from '@tanstack/react-table'
import { RefreshCw, Trash2, Terminal, FileText } from 'lucide-react'
import { fetchPods, deletePod, restartPod } from '@/lib/api'
import { useWebSocket } from '@/hooks/useWebSocket'
import type { PodSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const columnHelper = createColumnHelper<PodSummary>()

function StatusBadge({ status }: { status: string }) {
  const isHealthy = status === 'Running' || status === 'Succeeded'
  const isError = ['CrashLoopBackOff', 'Error', 'OOMKilled', 'Failed'].includes(status)
  return (
    <span className={cn('text-xs font-medium', isHealthy ? 'text-green-600' : isError ? 'text-red-600' : 'text-yellow-600')}>
      ● {status}
    </span>
  )
}

export function Pods() {
  const outletContext = useOutletContext<{ namespace: string } | null>()
  const namespace = outletContext?.namespace ?? ''
  const [pods, setPods] = useState<PodSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  const load = useCallback(() => {
    fetchPods(namespace).then(setPods).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  // Live updates via WebSocket
  useWebSocket((msg) => {
    if (msg.type === 'pods_update') {
      setPods(msg.data as PodSummary[])
    }
  })

  const handleDelete = async (pod: PodSummary) => {
    if (!confirm(`Delete pod ${pod.name}?`)) return
    await deletePod(pod.namespace, pod.name).catch(console.error)
    load()
  }

  const handleRestart = async (pod: PodSummary) => {
    if (!confirm(`Restart pod ${pod.name}? (will be deleted and recreated by controller)`)) return
    await restartPod(pod.namespace, pod.name).catch(console.error)
    load()
  }

  const columns = [
    columnHelper.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-primary-900 text-xs">{i.getValue()}</span> }),
    columnHelper.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    columnHelper.accessor('status', { header: 'Status', cell: (i) => <StatusBadge status={i.getValue()} /> }),
    columnHelper.accessor('ready', { header: 'Ready', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    columnHelper.accessor('restarts', { header: 'Restarts', cell: (i) => <span className={cn('text-xs', i.getValue() > 0 ? 'text-red-500 font-medium' : '')}>{i.getValue()}</span> }),
    columnHelper.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    columnHelper.display({
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs flex items-center gap-1" title="Logs — Plan 3"><FileText size={11} />Logs</button>
          <button className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs flex items-center gap-1" title="Exec — Plan 3"><Terminal size={11} />Exec</button>
          <button onClick={() => handleRestart(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs flex items-center gap-1"><RefreshCw size={11} />Restart</button>
          <button onClick={() => handleDelete(row.original)} className="p-1 text-red-500 hover:bg-red-50 rounded text-xs flex items-center gap-1"><Trash2 size={11} />Delete</button>
        </div>
      ),
    }),
  ]

  const table = useReactTable({
    data: pods, columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const unhealthyCount = pods.filter(p => !['Running', 'Succeeded'].includes(p.status)).length

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Pods</h1>
          <p className="text-[11px] text-primary-500">{pods.length} pods{unhealthyCount > 0 ? ` · ${unhealthyCount} unhealthy` : ''}</p>
        </div>
        <div className="flex gap-2 items-center">
          <button onClick={load} className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-primary-200">↻ Refresh</button>
          <input placeholder="Filter pods..." value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)}
            className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-48" />
        </div>
      </div>
      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} onClick={h.column.getToggleSortingHandler()}
                    className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider cursor-pointer select-none">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={cn('border-t border-primary-50 hover:bg-primary-50/50 transition-colors',
                ['CrashLoopBackOff', 'Error', 'Failed'].includes(row.original.status) ? 'bg-red-50/30' : '')}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run all frontend tests**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web
npx vitest run 2>&1 | tail -8
```

Expected: all PASS (note: Pods.test.tsx may need mock update — if it fails on `useWebSocket`, mock it)

If `Pods.test.tsx` fails due to `useWebSocket`, add to the top of `Pods.test.tsx`:
```typescript
vi.mock('@/hooks/useWebSocket', () => ({ useWebSocket: vi.fn() }))
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/hooks/ web/src/pages/Pods.tsx
git commit -m "feat: wire pod delete/restart actions and websocket live updates"
```

---

## Task 7: Deployments Page

**Files:**
- Create: `web/src/pages/Deployments.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create `web/src/pages/Deployments.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createColumnHelper, flexRender, getCoreRowModel,
  getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState,
} from '@tanstack/react-table'
import { fetchDeployments, scaleDeployment, rolloutRestartDeployment, deleteDeployment } from '@/lib/api'
import type { DeploymentSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const col = createColumnHelper<DeploymentSummary>()

export function Deployments() {
  const outletContext = useOutletContext<{ namespace: string } | null>()
  const namespace = outletContext?.namespace ?? ''
  const [items, setItems] = useState<DeploymentSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [scaleTarget, setScaleTarget] = useState<DeploymentSummary | null>(null)
  const [scaleValue, setScaleValue] = useState(1)

  const load = useCallback(() => {
    fetchDeployments(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const handleScale = async () => {
    if (!scaleTarget) return
    await scaleDeployment(scaleTarget.namespace, scaleTarget.name, scaleValue).catch(console.error)
    setScaleTarget(null)
    load()
  }

  const handleRolloutRestart = async (d: DeploymentSummary) => {
    if (!confirm(`Rollout restart ${d.name}?`)) return
    await rolloutRestartDeployment(d.namespace, d.name).catch(console.error)
    load()
  }

  const handleDelete = async (d: DeploymentSummary) => {
    if (!confirm(`Delete deployment ${d.name}?`)) return
    await deleteDeployment(d.namespace, d.name).catch(console.error)
    load()
  }

  const columns = [
    col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
    col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.accessor('ready', { header: 'Ready', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('upToDate', { header: 'Up-to-date', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('available', { header: 'Available', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
    col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    col.display({
      id: 'actions', header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-1">
          <button onClick={() => { setScaleTarget(row.original); setScaleValue(parseInt(row.original.ready.split('/')[1] || '1')) }}
            className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs">⚖️ Scale</button>
          <button onClick={() => handleRolloutRestart(row.original)}
            className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs">↻ Restart</button>
          <button onClick={() => handleDelete(row.original)}
            className="p-1 text-red-500 hover:bg-red-50 rounded text-xs">🗑 Delete</button>
        </div>
      ),
    }),
  ]

  const table = useReactTable({
    data: items, columns,
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
          <h1 className="text-base font-bold text-primary-900">Deployments</h1>
          <p className="text-[11px] text-primary-500">{items.length} deployments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-primary-200">↻ Refresh</button>
          <input placeholder="Filter..." value={globalFilter} onChange={(e) => setGlobalFilter(e.target.value)}
            className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none w-40" />
        </div>
      </div>

      {/* Scale modal */}
      {scaleTarget && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 shadow-xl w-72">
            <h3 className="font-bold text-sm text-primary-900 mb-3">Scale: {scaleTarget.name}</h3>
            <label className="text-xs text-gray-600 block mb-1">Replicas</label>
            <input type="number" min={0} max={50} value={scaleValue} onChange={(e) => setScaleValue(parseInt(e.target.value))}
              className="border border-primary-200 rounded px-3 py-1.5 text-sm w-full mb-4 outline-none focus:border-primary-400" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setScaleTarget(null)} className="text-xs px-3 py-1.5 rounded border border-gray-200">Cancel</button>
              <button onClick={handleScale} className="text-xs px-3 py-1.5 rounded bg-primary-600 text-white">Apply</button>
            </div>
          </div>
        </div>
      )}

      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} onClick={h.column.getToggleSortingHandler()}
                    className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider cursor-pointer">
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
    </div>
  )
}
```

- [ ] **Step 2: Update `web/src/App.tsx`** — import and wire Deployments page

```typescript
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Pods } from '@/pages/Pods'
import { Deployments } from '@/pages/Deployments'

function Placeholder({ title }: { title: string }) {
  return <div className="text-primary-700 font-medium">{title} — coming soon</div>
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Placeholder title="Cluster Overview" />} />
        <Route path="/pods" element={<Pods />} />
        <Route path="/deployments" element={<Deployments />} />
        <Route path="/statefulsets" element={<Placeholder title="StatefulSets" />} />
        <Route path="/services" element={<Placeholder title="Services" />} />
        <Route path="/configmaps" element={<Placeholder title="ConfigMaps" />} />
        <Route path="/nodes" element={<Placeholder title="Nodes" />} />
        <Route path="/namespaces" element={<Placeholder title="Namespaces" />} />
        <Route path="/explorer" element={<Placeholder title="Resource Explorer" />} />
      </Route>
    </Routes>
  )
}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/pages/Deployments.tsx web/src/App.tsx
git commit -m "feat: add deployments page with scale modal and rollout-restart"
```

---

## Task 8: Services, Nodes, Namespaces, ConfigMaps, Secrets Pages

**Files:**
- Create: `web/src/pages/Services.tsx`
- Create: `web/src/pages/Nodes.tsx`
- Create: `web/src/pages/Namespaces.tsx`
- Create: `web/src/pages/ConfigMaps.tsx`
- Create: `web/src/pages/Secrets.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create `web/src/pages/Services.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { fetchServices } from '@/lib/api'
import type { ServiceSummary } from '@/lib/types'

const col = createColumnHelper<ServiceSummary>()
const columns = [
  col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor('type', { header: 'Type', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor('clusterIP', { header: 'Cluster IP', cell: (i) => <span className="text-xs font-mono">{i.getValue()}</span> }),
  col.accessor('ports', { header: 'Ports', cell: (i) => <span className="text-xs text-gray-600">{i.getValue()}</span> }),
  col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

export function Services() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<ServiceSummary[]>([])
  const load = useCallback(() => { fetchServices(namespace).then(setItems).catch(console.error) }, [namespace])
  useEffect(() => { load() }, [load])
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">Services</h1><p className="text-[11px] text-primary-500">{items.length} services</p></div>
        <button onClick={load} className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-primary-200">↻ Refresh</button>
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

- [ ] **Step 2: Create `web/src/pages/Nodes.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { fetchNodes } from '@/lib/api'
import type { NodeSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const col = createColumnHelper<NodeSummary>()
const columns = [
  col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor('status', { header: 'Status', cell: (i) => <span className={cn('text-xs font-medium', i.getValue() === 'Ready' ? 'text-green-600' : 'text-red-600')}>● {i.getValue()}</span> }),
  col.accessor('roles', { header: 'Roles', cell: (i) => <span className="text-xs text-gray-600">{i.getValue()}</span> }),
  col.accessor('version', { header: 'Version', cell: (i) => <span className="text-xs font-mono text-gray-600">{i.getValue()}</span> }),
  col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

export function Nodes() {
  const [items, setItems] = useState<NodeSummary[]>([])
  const load = useCallback(() => { fetchNodes().then(setItems).catch(console.error) }, [])
  useEffect(() => { load() }, [load])
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">Nodes</h1><p className="text-[11px] text-primary-500">{items.length} nodes</p></div>
        <button onClick={load} className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-primary-200">↻ Refresh</button>
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

- [ ] **Step 3: Create `web/src/pages/Namespaces.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { fetchNamespaceSummaries } from '@/lib/api'
import type { NamespaceSummary } from '@/lib/types'

const col = createColumnHelper<NamespaceSummary>()
const columns = [
  col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor('status', { header: 'Status', cell: (i) => <span className="text-xs text-green-600">● {i.getValue()}</span> }),
  col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

export function Namespaces() {
  const [items, setItems] = useState<NamespaceSummary[]>([])
  const load = useCallback(() => { fetchNamespaceSummaries().then(setItems).catch(console.error) }, [])
  useEffect(() => { load() }, [load])
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">Namespaces</h1><p className="text-[11px] text-primary-500">{items.length} namespaces</p></div>
        <button onClick={load} className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-primary-200">↻ Refresh</button>
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

- [ ] **Step 4: Create `web/src/pages/ConfigMaps.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { fetchConfigMaps } from '@/lib/api'
import type { ConfigMapSummary } from '@/lib/types'

const col = createColumnHelper<ConfigMapSummary>()
const columns = [
  col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor('dataCount', { header: 'Keys', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

export function ConfigMaps() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<ConfigMapSummary[]>([])
  const load = useCallback(() => { fetchConfigMaps(namespace).then(setItems).catch(console.error) }, [namespace])
  useEffect(() => { load() }, [load])
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">ConfigMaps</h1><p className="text-[11px] text-primary-500">{items.length} configmaps</p></div>
        <button onClick={load} className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-primary-200">↻ Refresh</button>
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

- [ ] **Step 5: Create `web/src/pages/Secrets.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable } from '@tanstack/react-table'
import { fetchSecrets } from '@/lib/api'
import type { SecretSummary } from '@/lib/types'

const col = createColumnHelper<SecretSummary>()
const columns = [
  col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor('type', { header: 'Type', cell: (i) => <span className="text-xs text-gray-600">{i.getValue()}</span> }),
  col.accessor('dataCount', { header: 'Keys', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

export function Secrets() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<SecretSummary[]>([])
  const load = useCallback(() => { fetchSecrets(namespace).then(setItems).catch(console.error) }, [namespace])
  useEffect(() => { load() }, [load])
  const table = useReactTable({ data: items, columns, getCoreRowModel: getCoreRowModel() })
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div><h1 className="text-base font-bold text-primary-900">Secrets</h1><p className="text-[11px] text-primary-500">{items.length} secrets</p></div>
        <button onClick={load} className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-primary-200">↻ Refresh</button>
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

- [ ] **Step 6: Update `web/src/App.tsx`** — wire all pages

```typescript
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Pods } from '@/pages/Pods'
import { Deployments } from '@/pages/Deployments'
import { Services } from '@/pages/Services'
import { Nodes } from '@/pages/Nodes'
import { Namespaces } from '@/pages/Namespaces'
import { ConfigMaps } from '@/pages/ConfigMaps'
import { Secrets } from '@/pages/Secrets'

function Placeholder({ title }: { title: string }) {
  return <div className="text-primary-700 font-medium">{title} — coming soon</div>
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Placeholder title="Cluster Overview" />} />
        <Route path="/pods" element={<Pods />} />
        <Route path="/deployments" element={<Deployments />} />
        <Route path="/statefulsets" element={<Placeholder title="StatefulSets" />} />
        <Route path="/services" element={<Services />} />
        <Route path="/configmaps" element={<ConfigMaps />} />
        <Route path="/secrets" element={<Secrets />} />
        <Route path="/nodes" element={<Nodes />} />
        <Route path="/namespaces" element={<Namespaces />} />
        <Route path="/explorer" element={<Placeholder title="Resource Explorer" />} />
      </Route>
    </Routes>
  )
}
```

Also add Secrets to Sidebar. Modify `web/src/components/layout/Sidebar.tsx` — add Secrets to Config & Storage group:

```typescript
{ label: 'Secrets', to: '/secrets', icon: <Lock size={14} /> },
```

Add `Lock` to lucide-react imports.

- [ ] **Step 7: Run all tests**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web && npx vitest run 2>&1 | tail -8
go test ./... 2>&1 | tail -8
```

Expected: all PASS

- [ ] **Step 8: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 9: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/pages/ web/src/App.tsx web/src/components/layout/Sidebar.tsx
git commit -m "feat: add services, nodes, namespaces, configmaps, secrets pages"
```

---

## Verification Checklist

Plan 2 เสร็จแล้วต้องทำได้ทั้งหมดนี้:

- [ ] `go test ./...` → PASS
- [ ] `cd web && npx vitest run` → PASS
- [ ] กด Delete บน Pods page → pod หาย (ถ้าเชื่อมต่อ cluster จริง)
- [ ] กด Restart บน Pods page → confirm dialog → pod recreated
- [ ] กด Scale บน Deployments page → modal เปิด → ใส่ replica count → Apply
- [ ] กด Rollout Restart บน Deployments page → confirm → deployment restarts
- [ ] `/services` → table แสดง services
- [ ] `/nodes` → table แสดง nodes + status badge
- [ ] `/namespaces` → table แสดง namespaces
- [ ] `/configmaps` → table แสดง configmaps
- [ ] `/secrets` → table แสดง secrets

---

## Next: Plan 3

Pod Exec/Shell (xterm.js), Log streaming, Port-forward, Events page, Top (metrics) page

# k999s — Plan 3: Pod Logs Streaming + Exec Terminal + Events + Top

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม log streaming (WebSocket), pod exec terminal (xterm.js), Events page, และ Top (metrics) page

**Architecture:** Log streaming และ Exec ใช้ WebSocket endpoints แยกต่างหากจาก general hub (`/ws/pods/:ns/:name/logs` และ `/ws/pods/:ns/:name/exec`). K8s Client เก็บ `rest.Config` ไว้สำหรับ exec ที่ต้องการ SPDY protocol. Metrics ต้องการ `metrics-server` ใน cluster — แสดง warning ถ้าไม่มี.

**Tech Stack:** client-go remotecommand (exec), k8s.io/metrics (Top), @xterm/xterm + @xterm/addon-fit (terminal UI), gorilla/websocket (already installed)

---

## What exists (Plan 1+2)

```
internal/k8s/client.go      — Client{kube, currentContext, kubeconfigPath} — NO restConfig yet
internal/k8s/actions.go     — Delete, Restart, Scale, RolloutRestart, DeleteDeployment
internal/api/router.go      — NewRouter(k8sClient, webFS, hub) — WS route at /ws only
internal/api/handlers.go    — all existing handlers including handleWebSocket
web/src/pages/Pods.tsx      — Logs + Exec buttons exist but disabled
web/src/hooks/useWebSocket.ts — general hub WebSocket hook
```

## File Map

```
internal/k8s/
  client.go         MODIFY — add restConfig *rest.Config field + store in NewClient
  types.go          MODIFY — add EventSummary, PodMetricsSummary, NodeMetricsSummary
  streaming.go      NEW    — StreamLogs, ExecPod
  events.go         NEW    — ListEvents
  metrics.go        NEW    — ListPodMetrics, ListNodeMetrics (graceful fallback)
internal/api/
  router.go         MODIFY — add /ws/pods/:ns/:name/logs and /ws/pods/:ns/:name/exec routes
  handlers.go       MODIFY — add handlePodLogs, handlePodExec, handleListEvents, handlePodMetrics, handleNodeMetrics
web/src/
  components/
    LogViewer.tsx   NEW    — streaming log panel (slide-over)
    ExecTerminal.tsx NEW   — xterm.js terminal modal
  pages/
    Events.tsx      NEW
    Top.tsx         NEW
  lib/
    types.ts        MODIFY — add EventSummary, PodMetricsSummary, NodeMetricsSummary
  App.tsx           MODIFY — add /events, /top routes
  components/layout/Sidebar.tsx  MODIFY — add Events, Top nav items
  pages/Pods.tsx    MODIFY — wire Logs + Exec buttons
```

---

## Task 1: K8s — restConfig + StreamLogs + ExecPod

**Files:**
- Modify: `internal/k8s/client.go`
- Create: `internal/k8s/streaming.go`

- [ ] **Step 1: Install remotecommand (part of client-go — verify it resolves)**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
go get k8s.io/client-go/tools/remotecommand
```

Expected: no new version downloaded (already transitive dep), or version pinned.

- [ ] **Step 2: Add `restConfig` field to Client in `internal/k8s/client.go`**

Change the `Client` struct and `NewClient` to store restConfig:

```go
import "k8s.io/client-go/rest"

// Client wraps the Kubernetes clientset with domain-specific methods.
type Client struct {
	kube           kubernetes.Interface
	restConfig     *rest.Config // needed for exec; nil in test clients
	currentContext string
	kubeconfigPath string
}

// NewClient creates a real client from kubeconfig file.
func NewClient(kubeconfigPath, context string) (*Client, error) {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	if kubeconfigPath != "" {
		loadingRules.ExplicitPath = kubeconfigPath
	}
	configOverrides := &clientcmd.ConfigOverrides{}
	if context != "" {
		configOverrides.CurrentContext = context
	}
	kubeConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, configOverrides)
	restConfig, err := kubeConfig.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("build rest config: %w", err)
	}
	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("create clientset: %w", err)
	}
	rawConfig, _ := kubeConfig.RawConfig()
	return &Client{
		kube:           clientset,
		restConfig:     restConfig,
		currentContext: rawConfig.CurrentContext,
		kubeconfigPath: kubeconfigPath,
	}, nil
}
```

`NewClientFromKubernetesClient` remains unchanged — `restConfig` stays nil for test clients.

- [ ] **Step 3: Create `internal/k8s/streaming.go`**

```go
package k8s

import (
	"context"
	"fmt"
	"io"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/tools/remotecommand"
)

// StreamLogs returns a ReadCloser that streams pod logs.
// Caller must close the returned stream.
func (c *Client) StreamLogs(ctx context.Context, namespace, name, container string, follow, previous bool) (io.ReadCloser, error) {
	opts := &corev1.PodLogOptions{
		Container: container,
		Follow:    follow,
		Previous:  previous,
	}
	req := c.kube.CoreV1().Pods(namespace).GetLogs(name, opts)
	return req.Stream(ctx)
}

// ExecPod opens an interactive shell in the named pod/container.
// stdin/stdout/stderr are bridged to the K8s exec stream.
// Returns an error if restConfig is unavailable (test clients).
func (c *Client) ExecPod(ctx context.Context, namespace, name, container string, cmd []string, stdin io.Reader, stdout, stderr io.Writer) error {
	if c.restConfig == nil {
		return fmt.Errorf("exec not available: no REST config (test client)")
	}
	req := c.kube.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(name).
		Namespace(namespace).
		SubResource("exec").
		Param("container", container).
		Param("stdin", "true").
		Param("stdout", "true").
		Param("stderr", "true").
		Param("tty", "true")
	for _, arg := range cmd {
		req = req.Param("command", arg)
	}
	exec, err := remotecommand.NewSPDYExecutor(c.restConfig, "POST", req.URL())
	if err != nil {
		return fmt.Errorf("create executor: %w", err)
	}
	return exec.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin:  stdin,
		Stdout: stdout,
		Stderr: stderr,
		Tty:    true,
	})
}

// ContainersForPod returns the container names of a pod.
func (c *Client) ContainersForPod(ctx context.Context, namespace, name string) ([]string, error) {
	pod, err := c.kube.CoreV1().Pods(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(pod.Spec.Containers))
	for _, c := range pod.Spec.Containers {
		names = append(names, c.Name)
	}
	return names, nil
}
```

- [ ] **Step 4: Verify it compiles**

```bash
go build ./internal/k8s/... 2>&1
```

Expected: no errors.

- [ ] **Step 5: Run existing K8s tests — expect PASS**

```bash
go test ./internal/k8s/... -v 2>&1 | tail -12
```

Expected: all existing 7 tests still pass.

- [ ] **Step 6: Commit**

```bash
git add internal/k8s/client.go internal/k8s/streaming.go
git commit -m "feat: add restConfig to k8s client and StreamLogs/ExecPod/ContainersForPod methods"
```

---

## Task 2: K8s — Events + Metrics Types and Methods

**Files:**
- Modify: `internal/k8s/types.go`
- Create: `internal/k8s/events.go`
- Create: `internal/k8s/metrics.go`
- Modify: `internal/k8s/client_test.go` (add ListEvents test)

- [ ] **Step 1: Append to `internal/k8s/types.go`**

```go
type EventSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Reason    string `json:"reason"`
	Message   string `json:"message"`
	Type      string `json:"type"` // Normal | Warning
	Object    string `json:"object"`
	Count     int32  `json:"count"`
	Age       string `json:"age"`
}

type PodMetricsSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	CPU       string `json:"cpu"`
	Memory    string `json:"memory"`
}

type NodeMetricsSummary struct {
	Name   string `json:"name"`
	CPU    string `json:"cpu"`
	Memory string `json:"memory"`
}
```

- [ ] **Step 2: Write failing test for ListEvents — append to `internal/k8s/client_test.go`**

```go
func TestListEvents_ReturnsList(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Event{
			ObjectMeta: metav1.ObjectMeta{Name: "evt-1", Namespace: "default"},
			Reason:     "BackOff",
			Message:    "Back-off restarting failed container",
			Type:       "Warning",
			Count:      3,
			InvolvedObject: corev1.ObjectReference{
				Kind: "Pod", Name: "api-pod",
			},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	events, err := client.ListEvents(context.Background(), "default")
	require.NoError(t, err)
	assert.Len(t, events, 1)
	assert.Equal(t, "Warning", events[0].Type)
	assert.Equal(t, "BackOff", events[0].Reason)
}
```

- [ ] **Step 3: Run — expect FAIL**

```bash
go test ./internal/k8s/... -run TestListEvents -v 2>&1 | tail -5
```

- [ ] **Step 4: Create `internal/k8s/events.go`**

```go
package k8s

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

// ListEvents returns event summaries for the given namespace ("" = all).
func (c *Client) ListEvents(ctx context.Context, namespace string) ([]EventSummary, error) {
	list, err := c.kube.CoreV1().Events(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	out := make([]EventSummary, 0, len(list.Items))
	for _, e := range list.Items {
		out = append(out, EventSummary{
			Name:      e.Name,
			Namespace: e.Namespace,
			Reason:    e.Reason,
			Message:   e.Message,
			Type:      e.Type,
			Object:    fmt.Sprintf("%s/%s", e.InvolvedObject.Kind, e.InvolvedObject.Name),
			Count:     e.Count,
			Age:       formatAge(e.CreationTimestamp.Time),
		})
	}
	return out, nil
}
```

- [ ] **Step 5: Install k8s.io/metrics**

```bash
go get k8s.io/metrics@v0.36.1
```

- [ ] **Step 6: Create `internal/k8s/metrics.go`**

```go
package k8s

import (
	"context"
	"fmt"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"
)

// ListPodMetrics returns CPU/memory usage per pod.
// Returns an empty list (not error) if metrics-server is unavailable.
func (c *Client) ListPodMetrics(ctx context.Context, namespace string) ([]PodMetricsSummary, error) {
	if c.restConfig == nil {
		return nil, fmt.Errorf("metrics not available: no REST config")
	}
	mc, err := metricsclient.NewForConfig(c.restConfig)
	if err != nil {
		return nil, err
	}
	list, err := mc.MetricsV1beta1().PodMetricses(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		// metrics-server not installed — return empty list
		return []PodMetricsSummary{}, nil
	}
	out := make([]PodMetricsSummary, 0, len(list.Items))
	for _, m := range list.Items {
		var cpuTotal, memTotal int64
		for _, c := range m.Containers {
			cpuTotal += c.Usage.Cpu().MilliValue()
			memTotal += c.Usage.Memory().Value()
		}
		out = append(out, PodMetricsSummary{
			Name:      m.Name,
			Namespace: m.Namespace,
			CPU:       fmt.Sprintf("%dm", cpuTotal),
			Memory:    formatBytes(memTotal),
		})
	}
	return out, nil
}

// ListNodeMetrics returns CPU/memory usage per node.
// Returns an empty list (not error) if metrics-server is unavailable.
func (c *Client) ListNodeMetrics(ctx context.Context) ([]NodeMetricsSummary, error) {
	if c.restConfig == nil {
		return nil, fmt.Errorf("metrics not available: no REST config")
	}
	mc, err := metricsclient.NewForConfig(c.restConfig)
	if err != nil {
		return nil, err
	}
	list, err := mc.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{})
	if err != nil {
		return []NodeMetricsSummary{}, nil
	}
	out := make([]NodeMetricsSummary, 0, len(list.Items))
	for _, m := range list.Items {
		out = append(out, NodeMetricsSummary{
			Name:   m.Name,
			CPU:    fmt.Sprintf("%dm", m.Usage.Cpu().MilliValue()),
			Memory: formatBytes(m.Usage.Memory().Value()),
		})
	}
	return out, nil
}

func formatBytes(b int64) string {
	const mi = 1024 * 1024
	if b >= 1024*mi {
		return fmt.Sprintf("%.1fGi", float64(b)/float64(1024*mi))
	}
	return fmt.Sprintf("%dMi", b/mi)
}
```

- [ ] **Step 7: Run ALL k8s tests — expect PASS**

```bash
go test ./internal/k8s/... -v 2>&1 | tail -15
```

Expected: 8 tests pass (7 existing + 1 new TestListEvents)

- [ ] **Step 8: Commit**

```bash
git add internal/k8s/types.go internal/k8s/events.go internal/k8s/metrics.go internal/k8s/client_test.go
go mod tidy
git add go.mod go.sum
git commit -m "feat: add events and metrics methods to k8s client"
```

---

## Task 3: API — Logs Streaming, Exec, Events, Metrics Endpoints

**Files:**
- Modify: `internal/api/router.go`
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/handlers_test.go`

- [ ] **Step 1: Add failing test — append to `internal/api/handlers_test.go`**

```go
func TestGetEvents_ReturnsList(t *testing.T) {
	router := newTestRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/events?namespace=default", nil)
	router.ServeHTTP(w, req)
	assert.Equal(t, http.StatusOK, w.Code)
}

func TestGetPodMetrics_ReturnsOK(t *testing.T) {
	router := newTestRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/pod-metrics?namespace=default", nil)
	router.ServeHTTP(w, req)
	// 200 with empty list OR 500 if metrics-server absent — both acceptable
	assert.True(t, w.Code == http.StatusOK || w.Code == http.StatusInternalServerError)
}
```

- [ ] **Step 2: Run — expect FAIL**

```bash
go test ./internal/api/... -run "TestGetEvents|TestGetPodMetrics" -v 2>&1 | tail -8
```

- [ ] **Step 3: Add routes to `internal/api/router.go`**

Inside `NewRouter`, after existing resource list routes, add:

```go
// Streaming WebSocket endpoints (pod-specific, NOT the general hub)
if hub != nil {
    r.engine.GET("/ws", r.handleWebSocket)
}
r.engine.GET("/ws/pods/:namespace/:name/logs", r.handlePodLogs)
r.engine.GET("/ws/pods/:namespace/:name/exec", r.handlePodExec)

// Additional REST endpoints
v1.GET("/events", r.handleListEvents)
v1.GET("/pod-metrics", r.handlePodMetrics)
v1.GET("/node-metrics", r.handleNodeMetrics)
v1.GET("/pods/:namespace/:name/containers", r.handlePodContainers)
```

Note: log/exec WS endpoints are always registered (no hub needed — each is a dedicated per-connection stream, not hub-broadcast).

Remove the old `if hub != nil` block and replace with the new one above. The full updated `NewRouter` route block should be:

```go
v1 := r.engine.Group("/api/v1")
v1.GET("/pods", r.handleListPods)
v1.GET("/namespaces", r.handleListNamespaces)
v1.GET("/contexts", r.handleListContexts)
v1.GET("/deployments", r.handleListDeployments)
v1.DELETE("/pods/:namespace/:name", r.handleDeletePod)
v1.POST("/pods/:namespace/:name/restart", r.handleRestartPod)
v1.POST("/deployments/:namespace/:name/scale", r.handleScaleDeployment)
v1.POST("/deployments/:namespace/:name/rollout-restart", r.handleRolloutRestartDeployment)
v1.DELETE("/deployments/:namespace/:name", r.handleDeleteDeployment)
v1.GET("/services", r.handleListServices)
v1.GET("/nodes", r.handleListNodes)
v1.GET("/namespace-summaries", r.handleListNamespaceSummaries)
v1.GET("/configmaps", r.handleListConfigMaps)
v1.GET("/secrets", r.handleListSecrets)
v1.GET("/events", r.handleListEvents)
v1.GET("/pod-metrics", r.handlePodMetrics)
v1.GET("/node-metrics", r.handleNodeMetrics)
v1.GET("/pods/:namespace/:name/containers", r.handlePodContainers)

// Pod streaming (dedicated WS per connection — not hub broadcast)
r.engine.GET("/ws/pods/:namespace/:name/logs", r.handlePodLogs)
r.engine.GET("/ws/pods/:namespace/:name/exec", r.handlePodExec)

// General hub broadcast
if hub != nil {
    r.engine.GET("/ws", r.handleWebSocket)
}
```

- [ ] **Step 4: Add new handlers to `internal/api/handlers.go`**

Add these imports to the existing `import` block in handlers.go:
```go
import (
	"bufio"
	"context"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)
```

Then append these handler functions:

```go
func (r *Router) handleListEvents(c *gin.Context) {
	events, err := r.k8s.ListEvents(c.Request.Context(), c.Query("namespace"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": events})
}

func (r *Router) handlePodMetrics(c *gin.Context) {
	metrics, err := r.k8s.ListPodMetrics(c.Request.Context(), c.Query("namespace"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": metrics})
}

func (r *Router) handleNodeMetrics(c *gin.Context) {
	metrics, err := r.k8s.ListNodeMetrics(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": metrics})
}

func (r *Router) handlePodContainers(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	containers, err := r.k8s.ContainersForPod(c.Request.Context(), ns, name)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": containers})
}

func (r *Router) handlePodLogs(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	container := c.Query("container")
	follow := c.Query("follow") == "true"
	previous := c.Query("previous") == "true"

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	// Cancel context when client disconnects
	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				cancel()
				return
			}
		}
	}()

	stream, err := r.k8s.StreamLogs(ctx, ns, name, container, follow, previous)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("error: "+err.Error()))
		return
	}
	defer stream.Close()

	scanner := bufio.NewScanner(stream)
	for scanner.Scan() {
		if ctx.Err() != nil {
			break
		}
		if err := conn.WriteMessage(websocket.TextMessage, scanner.Bytes()); err != nil {
			break
		}
	}
}

func (r *Router) handlePodExec(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	container := c.Query("container")

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	stdinR, stdinW := io.Pipe()
	stdoutR, stdoutW := io.Pipe()

	// WebSocket → stdin
	go func() {
		defer stdinW.Close()
		for {
			_, msg, err := conn.ReadMessage()
			if err != nil {
				cancel()
				return
			}
			_, _ = stdinW.Write(msg)
		}
	}()

	// stdout → WebSocket
	go func() {
		defer stdoutR.Close()
		buf := make([]byte, 4096)
		for {
			n, err := stdoutR.Read(buf)
			if n > 0 {
				_ = conn.WriteMessage(websocket.BinaryMessage, buf[:n])
			}
			if err != nil {
				return
			}
		}
	}()

	cmd := []string{"sh", "-c", "bash 2>/dev/null || sh"}
	if err := r.k8s.ExecPod(ctx, ns, name, container, cmd, stdinR, stdoutW, stdoutW); err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("\r\n[session ended: "+err.Error()+"]\r\n"))
	}
	stdoutW.Close()
}
```


- [ ] **Step 5: Run all Go tests — expect PASS**

```bash
go test ./... 2>&1 | tail -10
```

- [ ] **Step 6: Verify build**

```bash
go build ./cmd/k999s 2>&1
```

- [ ] **Step 7: Commit**

```bash
git add internal/api/
git commit -m "feat: add log streaming, exec, events, metrics API endpoints"
```

---

## Task 4: Frontend — Types + API Functions

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/lib/api.test.ts`

- [ ] **Step 1: Append to `web/src/lib/types.ts`**

```typescript
export interface EventSummary {
  name: string
  namespace: string
  reason: string
  message: string
  type: 'Normal' | 'Warning' | string
  object: string
  count: number
  age: string
}

export interface PodMetricsSummary {
  name: string
  namespace: string
  cpu: string
  memory: string
}

export interface NodeMetricsSummary {
  name: string
  cpu: string
  memory: string
}
```

- [ ] **Step 2: Write failing test — append to `web/src/lib/api.test.ts`**

Update the import line at top of api.test.ts:
```typescript
import { fetchPods, fetchNamespaces, fetchContexts, deletePod, scaleDeployment, fetchEvents } from './api'
```

Append:
```typescript
describe('fetchEvents', () => {
  it('calls events endpoint with namespace', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
    await fetchEvents('default')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/events?namespace=default')
  })
})
```

- [ ] **Step 3: Run — expect FAIL**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web
npx vitest run src/lib/api.test.ts 2>&1 | tail -8
```

- [ ] **Step 4: Append to `web/src/lib/api.ts`**

```typescript
import type { EventSummary, PodMetricsSummary, NodeMetricsSummary } from './types'

export async function fetchEvents(namespace: string): Promise<EventSummary[]> {
  const data = await get<{ items: EventSummary[] }>(`/api/v1/events?namespace=${namespace}`)
  return data.items
}

export async function fetchPodMetrics(namespace: string): Promise<PodMetricsSummary[]> {
  const data = await get<{ items: PodMetricsSummary[] }>(`/api/v1/pod-metrics?namespace=${namespace}`)
  return data.items
}

export async function fetchNodeMetrics(): Promise<NodeMetricsSummary[]> {
  const data = await get<{ items: NodeMetricsSummary[] }>('/api/v1/node-metrics')
  return data.items
}

export async function fetchPodContainers(namespace: string, podName: string): Promise<string[]> {
  const data = await get<{ items: string[] }>(`/api/v1/pods/${namespace}/${podName}/containers`)
  return data.items
}

/** Returns a WebSocket URL for pod log streaming */
export function podLogsWsUrl(namespace: string, name: string, container: string, follow: boolean, previous: boolean): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({ container, follow: String(follow), previous: String(previous) })
  return `${protocol}//${window.location.host}/ws/pods/${namespace}/${name}/logs?${params}`
}

/** Returns a WebSocket URL for pod exec */
export function podExecWsUrl(namespace: string, name: string, container: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({ container })
  return `${protocol}//${window.location.host}/ws/pods/${namespace}/${name}/exec?${params}`
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run src/lib/api.test.ts 2>&1 | tail -8
```

Expected: 6 tests pass

- [ ] **Step 6: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/lib/
git commit -m "feat: add events/metrics/log-streaming types and api functions"
```

---

## Task 5: Frontend — LogViewer Component + Wire Logs Button

**Files:**
- Create: `web/src/components/LogViewer.tsx`
- Modify: `web/src/pages/Pods.tsx`

- [ ] **Step 1: Create `web/src/components/LogViewer.tsx`**

```typescript
import { useEffect, useState, useRef, useCallback } from 'react'
import { X, Download, ChevronDown } from 'lucide-react'
import { podLogsWsUrl } from '@/lib/api'

interface LogViewerProps {
  namespace: string
  podName: string
  containers: string[]
  onClose: () => void
}

export function LogViewer({ namespace, podName, containers, onClose }: LogViewerProps) {
  const [container, setContainer] = useState(containers[0] ?? '')
  const [previous, setPrevious] = useState(false)
  const [lines, setLines] = useState<string[]>([])
  const [connected, setConnected] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const autoScrollRef = useRef(true)

  const connect = useCallback(() => {
    wsRef.current?.close()
    setLines([])
    setConnected(false)

    const ws = new WebSocket(podLogsWsUrl(namespace, podName, container, true, previous))
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    ws.onmessage = (e) => {
      setLines((prev) => {
        const next = [...prev, e.data as string]
        return next.length > 5000 ? next.slice(-5000) : next
      })
      if (autoScrollRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' })
      }
    }
  }, [namespace, podName, container, previous])

  useEffect(() => {
    connect()
    return () => wsRef.current?.close()
  }, [connect])

  const handleDownload = () => {
    const blob = new Blob([lines.join('\n')], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${podName}-${container}.log`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '60%', minWidth: 480,
      background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
      zIndex: 50, display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        background: '#1e1b4b', color: '#c7d2fe', padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>
            📋 {namespace}/{podName}
          </span>
          <span style={{ fontSize: 10, color: connected ? '#86efac' : '#fca5a5' }}>
            ● {connected ? 'streaming' : 'disconnected'}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {containers.length > 1 && (
            <select
              value={container}
              onChange={(e) => setContainer(e.target.value)}
              style={{ background: 'rgba(255,255,255,0.1)', color: '#c7d2fe', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}
            >
              {containers.map((c) => <option key={c} value={c} style={{ color: '#000' }}>{c}</option>)}
            </select>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, cursor: 'pointer' }}>
            <input type="checkbox" checked={previous} onChange={(e) => setPrevious(e.target.checked)} />
            Previous
          </label>
          <button onClick={handleDownload} title="Download logs"
            style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <Download size={14} />
          </button>
          <button onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Log output */}
      <div
        onScroll={(e) => {
          const el = e.currentTarget
          autoScrollRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50
        }}
        style={{
          flex: 1, overflowY: 'auto', background: '#0f0e1a', padding: '8px 12px',
          fontFamily: '"Fira Code", "Cascadia Code", monospace', fontSize: 11,
          lineHeight: 1.6, color: '#c7d2fe',
        }}
      >
        {lines.length === 0 && !connected && (
          <div style={{ color: '#6366f1', padding: 16 }}>Connecting...</div>
        )}
        {lines.map((line, i) => (
          <div key={i} style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all',
            color: line.includes('ERROR') || line.includes('error') ? '#fca5a5'
              : line.includes('WARN') || line.includes('warn') ? '#fcd34d'
              : '#c7d2fe',
          }}>
            {line}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Scroll to bottom button */}
      {!autoScrollRef.current && (
        <button
          onClick={() => { autoScrollRef.current = true; bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }}
          style={{ position: 'absolute', bottom: 20, right: 20, background: '#4f46e5', color: '#fff', border: 'none', borderRadius: '50%', width: 32, height: 32, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <ChevronDown size={16} />
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Update `web/src/pages/Pods.tsx`** — wire Logs button

Add state + handler for the log viewer. Replace the Logs button and add the LogViewer panel:

Add these imports:
```typescript
import { LogViewer } from '@/components/LogViewer'
import { fetchPodContainers } from '@/lib/api'
```

Add state inside `Pods()` function (after existing state):
```typescript
const [logTarget, setLogTarget] = useState<{ pod: PodSummary; containers: string[] } | null>(null)

const handleOpenLogs = async (pod: PodSummary) => {
  const containers = await fetchPodContainers(pod.namespace, pod.name).catch(() => [pod.name])
  setLogTarget({ pod, containers })
}
```

Replace the disabled Logs button in the actions column:
```typescript
<button
  onClick={() => handleOpenLogs(row.original)}
  className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs flex items-center gap-1"
>
  <FileText size={11} />Logs
</button>
```

Add the LogViewer panel just before the closing `</div>` of the return:
```typescript
{logTarget && (
  <LogViewer
    namespace={logTarget.pod.namespace}
    podName={logTarget.pod.name}
    containers={logTarget.containers}
    onClose={() => setLogTarget(null)}
  />
)}
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web && npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 4: Run all frontend tests**

```bash
npx vitest run 2>&1 | tail -8
```

- [ ] **Step 5: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/components/LogViewer.tsx web/src/pages/Pods.tsx
git commit -m "feat: add log viewer panel with streaming and wire Logs button"
```

---

## Task 6: Frontend — ExecTerminal (xterm.js) + Wire Exec Button

**Files:**
- Create: `web/src/components/ExecTerminal.tsx`
- Modify: `web/src/pages/Pods.tsx`

- [ ] **Step 1: Install xterm.js**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web
npm install @xterm/xterm @xterm/addon-fit
```

- [ ] **Step 2: Create `web/src/components/ExecTerminal.tsx`**

```typescript
import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { podExecWsUrl } from '@/lib/api'

interface ExecTerminalProps {
  namespace: string
  podName: string
  container: string
  onClose: () => void
}

export function ExecTerminal({ namespace, podName, container, onClose }: ExecTerminalProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: '"Fira Code", "Cascadia Code", "Courier New", monospace',
      theme: {
        background: '#0f0e1a',
        foreground: '#c7d2fe',
        cursor: '#818cf8',
        selectionBackground: 'rgba(129,140,248,0.3)',
      },
    })
    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    const ws = new WebSocket(podExecWsUrl(namespace, podName, container))
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => term.write('\r\n\x1b[1;34mConnected to ' + podName + '\x1b[0m\r\n')
    ws.onclose = () => term.write('\r\n\x1b[1;31m[session ended]\x1b[0m\r\n')
    ws.onerror = () => term.write('\r\n\x1b[1;31m[connection error]\x1b[0m\r\n')

    ws.onmessage = (e) => {
      if (e.data instanceof ArrayBuffer) {
        term.write(new Uint8Array(e.data))
      } else {
        term.write(e.data as string)
      }
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    })

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      ws.close()
      term.dispose()
      window.removeEventListener('resize', handleResize)
    }
  }, [namespace, podName, container])

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)',
      zIndex: 100, display: 'flex', flexDirection: 'column',
    }}>
      {/* Title bar */}
      <div style={{
        background: '#1e1b4b', padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <span style={{ color: '#818cf8', fontSize: 12, fontFamily: 'monospace', fontWeight: 600 }}>
          💻 exec: {namespace}/{podName}{container ? ` — ${container}` : ''}
        </span>
        <button
          onClick={onClose}
          style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: '#c7d2fe', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', fontSize: 12 }}
        >
          ✕ Close
        </button>
      </div>
      {/* Terminal */}
      <div ref={containerRef} style={{ flex: 1, padding: 4, background: '#0f0e1a', minHeight: 0 }} />
    </div>
  )
}
```

- [ ] **Step 3: Update `web/src/pages/Pods.tsx`** — wire Exec button

Add import:
```typescript
import { ExecTerminal } from '@/components/ExecTerminal'
```

Add state inside `Pods()`:
```typescript
const [execTarget, setExecTarget] = useState<{ pod: PodSummary; container: string } | null>(null)

const handleOpenExec = async (pod: PodSummary) => {
  const containers = await fetchPodContainers(pod.namespace, pod.name).catch(() => [])
  setExecTarget({ pod, container: containers[0] ?? '' })
}
```

Replace the disabled Exec button:
```typescript
<button
  onClick={() => handleOpenExec(row.original)}
  className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs flex items-center gap-1"
>
  <Terminal size={11} />Exec
</button>
```

Add ExecTerminal modal before closing `</div>`:
```typescript
{execTarget && (
  <ExecTerminal
    namespace={execTarget.pod.namespace}
    podName={execTarget.pod.name}
    container={execTarget.container}
    onClose={() => setExecTarget(null)}
  />
)}
```

- [ ] **Step 4: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 5: Run all frontend tests**

```bash
npx vitest run 2>&1 | tail -8
```

Expected: all pass (ExecTerminal has no unit tests — requires browser + cluster)

- [ ] **Step 6: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/components/ExecTerminal.tsx web/src/pages/Pods.tsx web/package.json web/package-lock.json
git commit -m "feat: add exec terminal with xterm.js and wire Exec button"
```

---

## Task 7: Frontend — Events Page + Top Page + Sidebar

**Files:**
- Create: `web/src/pages/Events.tsx`
- Create: `web/src/pages/Top.tsx`
- Modify: `web/src/App.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Create `web/src/pages/Events.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import { createColumnHelper, flexRender, getCoreRowModel, getSortedRowModel, getFilteredRowModel, useReactTable, type SortingState } from '@tanstack/react-table'
import { fetchEvents } from '@/lib/api'
import type { EventSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const col = createColumnHelper<EventSummary>()

const columns = [
  col.accessor('type', {
    header: 'Type',
    cell: (i) => (
      <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded',
        i.getValue() === 'Warning' ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-600'
      )}>
        {i.getValue()}
      </span>
    ),
  }),
  col.accessor('reason', { header: 'Reason', cell: (i) => <span className="text-xs font-medium text-primary-900">{i.getValue()}</span> }),
  col.accessor('object', { header: 'Object', cell: (i) => <span className="text-xs font-mono text-gray-600">{i.getValue()}</span> }),
  col.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor('message', { header: 'Message', cell: (i) => <span className="text-xs text-gray-700 max-w-xs truncate block">{i.getValue()}</span> }),
  col.accessor('count', { header: 'Count', cell: (i) => <span className={cn('text-xs', i.getValue() > 1 ? 'text-orange-600 font-medium' : '')}>{i.getValue()}</span> }),
  col.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

export function Events() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [items, setItems] = useState<EventSummary[]>([])
  const [filter, setFilter] = useState<'all' | 'Warning' | 'Normal'>('all')
  const [sorting, setSorting] = useState<SortingState>([])

  const load = useCallback(() => {
    fetchEvents(namespace).then(setItems).catch(console.error)
  }, [namespace])

  useEffect(() => { load() }, [load])

  const filtered = filter === 'all' ? items : items.filter((e) => e.type === filter)

  const table = useReactTable({
    data: filtered, columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const warningCount = items.filter((e) => e.type === 'Warning').length

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Events</h1>
          <p className="text-[11px] text-primary-500">
            {items.length} events{warningCount > 0 ? ` · ${warningCount} warnings` : ''}
          </p>
        </div>
        <div className="flex gap-2 items-center">
          {(['all', 'Warning', 'Normal'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={cn('text-xs px-2 py-1 rounded border transition-colors',
                filter === f ? 'bg-primary-600 text-white border-primary-600' : 'text-primary-600 border-primary-200 hover:bg-primary-50'
              )}>
              {f === 'all' ? 'All' : f}
            </button>
          ))}
          <button onClick={load} className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-primary-200">↻</button>
        </div>
      </div>

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
              <tr key={row.id} className={cn('border-t border-primary-50 hover:bg-primary-50/50',
                row.original.type === 'Warning' ? 'bg-red-50/20' : '')}>
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

- [ ] **Step 2: Create `web/src/pages/Top.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
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

export function Top() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [podMetrics, setPodMetrics] = useState<PodMetricsSummary[]>([])
  const [nodeMetrics, setNodeMetrics] = useState<NodeMetricsSummary[]>([])
  const [noMetricsServer, setNoMetricsServer] = useState(false)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'cpu', desc: true }])

  const load = useCallback(() => {
    Promise.all([
      fetchPodMetrics(namespace).catch(() => { setNoMetricsServer(true); return [] }),
      fetchNodeMetrics().catch(() => []),
    ]).then(([pods, nodes]) => {
      setPodMetrics(pods)
      setNodeMetrics(nodes)
      if (pods.length > 0) setNoMetricsServer(false)
    })
  }, [namespace])

  useEffect(() => { load() }, [load])

  // Auto-refresh every 15s
  useEffect(() => {
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [load])

  const parseCPU = (s: string) => parseInt(s.replace('m', '')) || 0
  const maxCPU = Math.max(...podMetrics.map(p => parseCPU(p.cpu)), 1)

  const podColumns = [
    podCol.accessor('name', { header: 'Pod', cell: (i) => <span className="text-xs font-medium text-primary-900">{i.getValue()}</span> }),
    podCol.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
    podCol.accessor('cpu', {
      header: 'CPU',
      cell: (i) => (
        <div className="flex items-center gap-2 min-w-24">
          <span className="text-xs font-mono w-12">{i.getValue()}</span>
          <UsageBar value={parseCPU(i.getValue())} max={maxCPU} />
        </div>
      ),
    }),
    podCol.accessor('memory', { header: 'Memory', cell: (i) => <span className="text-xs font-mono">{i.getValue()}</span> }),
  ]

  const nodeColumns = [
    nodeCol.accessor('name', { header: 'Node', cell: (i) => <span className="text-xs font-medium text-primary-900">{i.getValue()}</span> }),
    nodeCol.accessor('cpu', { header: 'CPU', cell: (i) => <span className="text-xs font-mono">{i.getValue()}</span> }),
    nodeCol.accessor('memory', { header: 'Memory', cell: (i) => <span className="text-xs font-mono">{i.getValue()}</span> }),
  ]

  const podTable = useReactTable({ data: podMetrics, columns: podColumns, state: { sorting }, onSortingChange: setSorting, getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel() })
  const nodeTable = useReactTable({ data: nodeMetrics, columns: nodeColumns, getCoreRowModel: getCoreRowModel() })

  if (noMetricsServer) {
    return (
      <div>
        <h1 className="text-base font-bold text-primary-900 mb-3">Top</h1>
        <div className="border border-yellow-200 bg-yellow-50 rounded-lg p-4 text-sm text-yellow-800">
          <strong>metrics-server not available</strong><br />
          Install it with: <code className="bg-yellow-100 px-1 rounded">kubectl apply -f https://github.com/kubernetes-sigs/metrics-server/releases/latest/download/components.yaml</code>
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-base font-bold text-primary-900">Top</h1>
          <p className="text-[11px] text-primary-500">Auto-refreshes every 15s</p>
        </div>
        <button onClick={load} className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-primary-200">↻ Refresh</button>
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

- [ ] **Step 3: Update `web/src/App.tsx`** — add Events and Top routes

Add imports and routes:
```typescript
import { Events } from '@/pages/Events'
import { Top } from '@/pages/Top'

// Add routes inside AppLayout:
<Route path="/events" element={<Events />} />
<Route path="/top" element={<Top />} />
```

- [ ] **Step 4: Update `web/src/components/layout/Sidebar.tsx`** — add Events + Top to Overview group

```typescript
import { ..., Activity, BarChart2 } from 'lucide-react'

// In navGroups, update Overview group:
{
  title: 'Overview',
  items: [
    { label: 'Cluster Overview', to: '/', icon: <LayoutDashboard size={14} /> },
    { label: 'Events', to: '/events', icon: <Activity size={14} /> },
    { label: 'Top', to: '/top', icon: <BarChart2 size={14} /> },
  ],
},
```

- [ ] **Step 5: Run all tests**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web && npx vitest run 2>&1 | tail -8
go test ./... 2>&1 | tail -8
```

- [ ] **Step 6: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -10
```

- [ ] **Step 7: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/pages/Events.tsx web/src/pages/Top.tsx web/src/App.tsx web/src/components/layout/Sidebar.tsx
git commit -m "feat: add events page with warning filter and top page with metrics-server fallback"
```

---

## Verification Checklist

- [ ] `go test ./...` → PASS
- [ ] `cd web && npx vitest run` → PASS
- [ ] `cd web && npx tsc --noEmit` → no errors
- [ ] Logs button in Pods page opens slide-over panel with streaming logs
- [ ] Exec button opens full-screen xterm.js terminal
- [ ] `/events` page shows K8s events with Warning/Normal filter
- [ ] `/top` page shows CPU/Memory — or shows install instructions if no metrics-server
- [ ] `make build && ./k999s --version` — binary builds and shows version

---

## Next: Plan 4

Topology diagram (React Flow), Resource Explorer (dynamic api-resources discovery + Get/Describe)

# Port-forward + Deployment Rollback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two new actions: (1) port-forward from localhost to a Pod or Service via client-go SPDY tunnel with an Active Port-Forwards panel, and (2) rollback a Deployment to its previous revision.

**Architecture:** Port-forward uses `client-go/tools/portforward` to bind a local port, managed by a per-Router in-memory map of `pfEntry` structs with stop channels. Services are resolved to a backing pod before forwarding. Rollback finds the previous ReplicaSet by revision annotation and patches the Deployment's pod template spec. Both features follow the existing REST handler → client-go pattern.

**Tech Stack:** `k8s.io/client-go/tools/portforward`, `k8s.io/client-go/transport/spdy`, `k8s.io/apimachinery/pkg/labels`, existing gin handlers, React + TanStack Table

---

## File Map

| File | Change |
|---|---|
| `internal/k8s/portforward.go` | New — StartPortForward + ResolveServiceToPod |
| `internal/k8s/portforward_test.go` | New — ResolveServiceToPod tests |
| `internal/k8s/actions.go` | Add RollbackDeployment |
| `internal/k8s/actions_test.go` | Add TestRollbackDeployment tests |
| `internal/api/router.go` | Add pfEntries map, pfEntry type, new routes |
| `internal/api/handlers.go` | Add handleStartPortForward, handleListPortForwards, handleStopPortForward, handleRollbackDeployment |
| `web/src/lib/types.ts` | Add PortForwardEntry interface |
| `web/src/lib/api.ts` | Add startPortForward, listPortForwards, stopPortForward, rollbackDeployment |
| `web/src/components/PortForwardModal.tsx` | New — modal for entering ports |
| `web/src/components/PortForwardPanel.tsx` | New — floating panel showing active forwards |
| `web/src/pages/Pods.tsx` | Add Port Forward button |
| `web/src/pages/Services.tsx` | Add Port Forward button |
| `web/src/pages/Deployments.tsx` | Add Rollback button |
| `web/src/components/layout/AppLayout.tsx` | Mount PortForwardPanel |

---

## Task 1: Port-forward Go Client

**Files:**
- Create: `internal/k8s/portforward.go`
- Create: `internal/k8s/portforward_test.go`

- [ ] **Step 1: Write failing test in `internal/k8s/portforward_test.go`**

```go
package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestResolveServiceToPod_FindsRunningPod(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{Name: "my-svc", Namespace: "default"},
			Spec: corev1.ServiceSpec{
				Selector: map[string]string{"app": "my-app"},
				Ports: []corev1.ServicePort{
					{Port: 80, TargetPort: intOrString(8080)},
				},
			},
		},
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-pod",
				Namespace: "default",
				Labels:    map[string]string{"app": "my-app"},
			},
			Status: corev1.PodStatus{Phase: corev1.PodRunning},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	podName, targetPort, err := client.ResolveServiceToPod(context.Background(), "default", "my-svc")
	require.NoError(t, err)
	assert.Equal(t, "my-pod", podName)
	assert.Equal(t, 8080, targetPort)
}

func TestResolveServiceToPod_NoRunningPods(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Service{
			ObjectMeta: metav1.ObjectMeta{Name: "my-svc", Namespace: "default"},
			Spec: corev1.ServiceSpec{
				Selector: map[string]string{"app": "my-app"},
				Ports:    []corev1.ServicePort{{Port: 80, TargetPort: intOrString(8080)}},
			},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	_, _, err := client.ResolveServiceToPod(context.Background(), "default", "my-svc")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no running pods")
}

// intOrString creates an IntOrString with integer value (used for TargetPort in tests).
func intOrString(val int) intstr.IntOrString {
	return intstr.FromInt(val)
}
```

Add this import block at top of file:
```go
import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/client-go/kubernetes/fake"
)
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
go test ./internal/k8s/... -run "TestResolveServiceToPod" -v
```

Expected: `FAIL` — `client.ResolveServiceToPod` undefined.

- [ ] **Step 3: Create `internal/k8s/portforward.go`**

```go
package k8s

import (
	"context"
	"fmt"
	"io"
	"net/http"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/labels"
	"k8s.io/client-go/tools/portforward"
	"k8s.io/client-go/transport/spdy"
)

// StartPortForward binds localhost:localPort → pod:remotePort using client-go SPDY.
// Blocks until stopCh is closed or an error occurs. Signals readyCh when the tunnel is up.
// Returns an error if restConfig is nil (test clients).
func (c *Client) StartPortForward(
	ctx context.Context,
	namespace, podName string,
	localPort, remotePort int,
	stopCh <-chan struct{},
	readyCh chan struct{},
) error {
	if c.restConfig == nil {
		return fmt.Errorf("port-forward not available: no REST config (test client)")
	}
	url := c.kube.CoreV1().RESTClient().Post().
		Resource("pods").
		Namespace(namespace).
		Name(podName).
		SubResource("portforward").
		URL()

	transport, upgrader, err := spdy.RoundTripperFor(c.restConfig)
	if err != nil {
		return fmt.Errorf("create spdy transport: %w", err)
	}
	dialer := spdy.NewDialer(upgrader, &http.Client{Transport: transport}, http.MethodPost, url)

	fw, err := portforward.New(
		dialer,
		[]string{fmt.Sprintf("%d:%d", localPort, remotePort)},
		stopCh,
		readyCh,
		io.Discard,
		io.Discard,
	)
	if err != nil {
		return fmt.Errorf("create port forwarder: %w", err)
	}
	return fw.ForwardPorts()
}

// ResolveServiceToPod finds a running pod backing the given service and returns
// the pod name and the service's first targetPort as an integer.
func (c *Client) ResolveServiceToPod(ctx context.Context, namespace, serviceName string) (podName string, targetPort int, err error) {
	svc, err := c.kube.CoreV1().Services(namespace).Get(ctx, serviceName, metav1.GetOptions{})
	if err != nil {
		return "", 0, fmt.Errorf("get service: %w", err)
	}
	if len(svc.Spec.Ports) == 0 {
		return "", 0, fmt.Errorf("service %s has no ports", serviceName)
	}
	tp := svc.Spec.Ports[0].TargetPort
	if tp.IntValue() != 0 {
		targetPort = tp.IntValue()
	} else {
		targetPort = int(svc.Spec.Ports[0].Port)
	}

	selector := labels.Set(svc.Spec.Selector).String()
	pods, err := c.kube.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{LabelSelector: selector})
	if err != nil {
		return "", 0, fmt.Errorf("list pods: %w", err)
	}
	for _, pod := range pods.Items {
		if pod.Status.Phase == corev1.PodRunning {
			return pod.Name, targetPort, nil
		}
	}
	return "", 0, fmt.Errorf("no running pods found for service %s", serviceName)
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
go test ./internal/k8s/... -run "TestResolveServiceToPod" -v
```

Expected: `PASS`.

- [ ] **Step 5: Verify build**

```bash
go build ./...
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add internal/k8s/portforward.go internal/k8s/portforward_test.go
git commit -m "feat(port-forward): add StartPortForward and ResolveServiceToPod"
```

---

## Task 2: Port-forward Router + Handlers

**Files:**
- Modify: `internal/api/router.go`
- Modify: `internal/api/handlers.go`

- [ ] **Step 1: Add pfEntry type and pfEntries map to `internal/api/router.go`**

Add the struct definition before the `Router` struct:

```go
type pfEntry struct {
	ID         string `json:"id"`
	Namespace  string `json:"namespace"`
	TargetKind string `json:"targetKind"`
	TargetName string `json:"targetName"`
	LocalPort  int    `json:"localPort"`
	RemotePort int    `json:"remotePort"`
	stopCh     chan struct{}
}
```

Add `pfEntries` and `pfMu` to the `Router` struct:

```go
type Router struct {
	engine     *gin.Engine
	k8s        *k8s.Client
	hub        *ws.Hub
	diagnostic diagnostic.Provider
	cfg        *config.Config
	helm       *helmclient.Client
	mu         sync.RWMutex
	pfEntries  map[string]*pfEntry  // ← add
	pfMu       sync.Mutex           // ← add
}
```

In `NewRouter`, initialize `pfEntries` after creating the struct:

```go
r := &Router{
	engine:     gin.New(),
	k8s:        k8sClient,
	hub:        hub,
	diagnostic: diag,
	cfg:        cfg,
	helm:       helmclient.NewClient(cfg.KubeconfigPath, cfg.CurrentContext),
	pfEntries:  make(map[string]*pfEntry),  // ← add
}
```

- [ ] **Step 2: Add port-forward routes to `internal/api/router.go`**

Add after the HPA routes:

```go
v1.POST("/port-forward", r.handleStartPortForward)
v1.GET("/port-forward", r.handleListPortForwards)
v1.DELETE("/port-forward/:id", r.handleStopPortForward)
```

Also add `"context"`, `"log"`, `"time"`, `"fmt"` to the router.go imports if not already present (check existing imports first).

- [ ] **Step 3: Add handlers to `internal/api/handlers.go`**

Append at the end of the file:

```go
func (r *Router) handleStartPortForward(c *gin.Context) {
	var body struct {
		Namespace  string `json:"namespace"`
		TargetKind string `json:"targetKind"`
		TargetName string `json:"targetName"`
		LocalPort  int    `json:"localPort"`
		RemotePort int    `json:"remotePort"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	podName := body.TargetName
	remotePort := body.RemotePort

	if body.TargetKind == "Service" {
		var err error
		podName, remotePort, err = r.k8s.ResolveServiceToPod(c.Request.Context(), body.Namespace, body.TargetName)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	id := fmt.Sprintf("%d", time.Now().UnixNano())
	stopCh := make(chan struct{})
	readyCh := make(chan struct{})

	entry := &pfEntry{
		ID:         id,
		Namespace:  body.Namespace,
		TargetKind: body.TargetKind,
		TargetName: body.TargetName,
		LocalPort:  body.LocalPort,
		RemotePort: body.RemotePort,
		stopCh:     stopCh,
	}

	r.pfMu.Lock()
	r.pfEntries[id] = entry
	r.pfMu.Unlock()

	go func() {
		if err := r.k8s.StartPortForward(context.Background(), body.Namespace, podName, body.LocalPort, remotePort, stopCh, readyCh); err != nil {
			log.Printf("port-forward %s: %v", id, err)
		}
		r.pfMu.Lock()
		delete(r.pfEntries, id)
		r.pfMu.Unlock()
	}()

	select {
	case <-readyCh:
	case <-time.After(5 * time.Second):
		close(stopCh)
		r.pfMu.Lock()
		delete(r.pfEntries, id)
		r.pfMu.Unlock()
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "port-forward timed out"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"id": id, "localPort": body.LocalPort})
}

func (r *Router) handleListPortForwards(c *gin.Context) {
	r.pfMu.Lock()
	entries := make([]*pfEntry, 0, len(r.pfEntries))
	for _, e := range r.pfEntries {
		entries = append(entries, e)
	}
	r.pfMu.Unlock()
	c.JSON(http.StatusOK, gin.H{"items": entries})
}

func (r *Router) handleStopPortForward(c *gin.Context) {
	id := c.Param("id")
	r.pfMu.Lock()
	entry, ok := r.pfEntries[id]
	if ok {
		delete(r.pfEntries, id)
	}
	r.pfMu.Unlock()
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "port-forward not found"})
		return
	}
	close(entry.stopCh)
	c.Status(http.StatusNoContent)
}
```

Add `"log"` to the imports in `handlers.go` — `"context"`, `"fmt"`, and `"time"` are already imported there.

- [ ] **Step 4: Verify build**

```bash
go build ./...
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add internal/api/router.go internal/api/handlers.go
git commit -m "feat(port-forward): add REST handlers and pfEntry manager"
```

---

## Task 3: Port-forward Frontend

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`
- Create: `web/src/components/PortForwardModal.tsx`
- Create: `web/src/components/PortForwardPanel.tsx`
- Modify: `web/src/pages/Pods.tsx`
- Modify: `web/src/pages/Services.tsx`
- Modify: `web/src/components/layout/AppLayout.tsx`

- [ ] **Step 1: Add `PortForwardEntry` to `web/src/lib/types.ts`**

Append at end of file:

```typescript
export interface PortForwardEntry {
  id: string
  namespace: string
  targetKind: 'Pod' | 'Service'
  targetName: string
  localPort: number
  remotePort: number
}
```

- [ ] **Step 2: Add API functions to `web/src/lib/api.ts`**

Add `PortForwardEntry` to the type import on line 1.

Append at end of file:

```typescript
export async function startPortForward(req: {
  namespace: string
  targetKind: string
  targetName: string
  localPort: number
  remotePort: number
}): Promise<{ id: string; localPort: number }> {
  const res = await fetch('/api/v1/port-forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function listPortForwards(): Promise<PortForwardEntry[]> {
  const data = await get<{ items: PortForwardEntry[] }>('/api/v1/port-forward')
  return data.items
}

export const stopPortForward = (id: string) =>
  action(`/api/v1/port-forward/${id}`, 'DELETE')
```

- [ ] **Step 3: Create `web/src/components/PortForwardModal.tsx`**

```tsx
import { useState } from 'react'
import { startPortForward } from '@/lib/api'

interface Props {
  namespace: string
  targetKind: 'Pod' | 'Service'
  targetName: string
  defaultRemotePort?: number
  onClose: () => void
}

export function PortForwardModal({ namespace, targetKind, targetName, defaultRemotePort = 80, onClose }: Props) {
  const [localPort, setLocalPort] = useState(defaultRemotePort)
  const [remotePort, setRemotePort] = useState(defaultRemotePort)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleStart = async () => {
    setLoading(true)
    setError('')
    try {
      await startPortForward({ namespace, targetKind, targetName, localPort, remotePort })
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start port-forward')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 shadow-xl w-72">
        <h3 className="font-bold text-sm text-primary-900 mb-1">Port Forward</h3>
        <p className="text-[11px] text-gray-500 mb-3">{targetKind}: {targetName}</p>
        <label className="text-xs text-gray-600 block mb-1">Local Port</label>
        <input
          type="number"
          min={1024}
          max={65535}
          value={localPort}
          onChange={(e) => setLocalPort(parseInt(e.target.value))}
          className="border border-primary-200 rounded px-3 py-1.5 text-sm w-full mb-3 outline-none focus:border-primary-400"
        />
        <label className="text-xs text-gray-600 block mb-1">Remote Port</label>
        <input
          type="number"
          min={1}
          max={65535}
          value={remotePort}
          onChange={(e) => setRemotePort(parseInt(e.target.value))}
          className="border border-primary-200 rounded px-3 py-1.5 text-sm w-full mb-4 outline-none focus:border-primary-400"
        />
        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="text-xs px-3 py-1.5 rounded border border-gray-200">Cancel</button>
          <button onClick={handleStart} disabled={loading} className="text-xs px-3 py-1.5 rounded bg-primary-600 text-white disabled:opacity-50">
            {loading ? 'Starting...' : 'Start'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `web/src/components/PortForwardPanel.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { listPortForwards, stopPortForward } from '@/lib/api'
import type { PortForwardEntry } from '@/lib/types'
import { X } from 'lucide-react'

export function PortForwardPanel() {
  const [entries, setEntries] = useState<PortForwardEntry[]>([])

  const refresh = () => {
    listPortForwards().then(setEntries).catch(console.error)
  }

  useEffect(() => {
    refresh()
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [])

  if (entries.length === 0) return null

  const handleStop = async (id: string) => {
    await stopPortForward(id).catch(console.error)
    refresh()
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 bg-white border border-primary-100 rounded-xl shadow-lg w-72">
      <div className="px-3 py-2 border-b border-primary-50">
        <span className="text-[11px] font-bold text-primary-700">Active Port-Forwards ({entries.length})</span>
      </div>
      <div className="divide-y divide-primary-50">
        {entries.map((e) => (
          <div key={e.id} className="px-3 py-2 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-primary-900 truncate">{e.targetName}</p>
              <a
                href={`http://localhost:${e.localPort}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-primary-500 hover:text-primary-700 underline"
              >
                localhost:{e.localPort} → :{e.remotePort}
              </a>
            </div>
            <button
              onClick={() => handleStop(e.id)}
              className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded flex-shrink-0"
              title="Stop"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add Port Forward button to `web/src/pages/Pods.tsx`**

Add import at top:
```typescript
import { PortForwardModal } from '@/components/PortForwardModal'
```

Add state variable inside `Pods` function:
```typescript
const [pfTarget, setPfTarget] = useState<PodSummary | null>(null)
```

Add button to the actions column (after the existing YAML button, before other buttons):
```tsx
<button
  onClick={() => setPfTarget(row.original)}
  className="p-1 text-purple-600 hover:bg-purple-50 rounded"
  title="Port Forward"
>
  <Cable size={13} />
</button>
```

Import `Cable` from lucide-react (add to existing lucide import line).

Render modal below the table:
```tsx
{pfTarget && (
  <PortForwardModal
    namespace={pfTarget.namespace}
    targetKind="Pod"
    targetName={pfTarget.name}
    onClose={() => setPfTarget(null)}
  />
)}
```

- [ ] **Step 6: Add Port Forward button to `web/src/pages/Services.tsx`**

Add import at top:
```typescript
import { useState } from 'react'
import { PortForwardModal } from '@/components/PortForwardModal'
import { Cable } from 'lucide-react'
import type { ServiceSummary } from '@/lib/types'
```

Add state inside `Services`:
```typescript
const [pfTarget, setPfTarget] = useState<ServiceSummary | null>(null)
```

Add `Cable` button to the actions column (alongside existing FileCode2 button):
```tsx
<div className="flex gap-1">
  <button onClick={() => setYamlTarget(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded" title="View/Edit YAML">
    <FileCode2 size={13} />
  </button>
  <button onClick={() => setPfTarget(row.original)} className="p-1 text-purple-600 hover:bg-purple-50 rounded" title="Port Forward">
    <Cable size={13} />
  </button>
</div>
```

Render modal at bottom of return:
```tsx
{pfTarget && (
  <PortForwardModal
    namespace={pfTarget.namespace}
    targetKind="Service"
    targetName={pfTarget.name}
    onClose={() => setPfTarget(null)}
  />
)}
```

- [ ] **Step 7: Mount `PortForwardPanel` in `web/src/components/layout/AppLayout.tsx`**

Add import:
```typescript
import { PortForwardPanel } from '@/components/PortForwardPanel'
```

Mount inside the return JSX, just before the closing `</div>`:
```tsx
  <div className="h-screen flex flex-col overflow-hidden bg-white">
    <TopBar ... />
    <div className="flex flex-1 overflow-hidden">
      <Sidebar ... />
      <main className="flex-1 overflow-auto p-4">
        <Outlet context={{ namespace, context: currentContext }} />
      </main>
    </div>
    <PortForwardPanel />  {/* ← add this line */}
  </div>
```

- [ ] **Step 8: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts web/src/components/PortForwardModal.tsx web/src/components/PortForwardPanel.tsx web/src/pages/Pods.tsx web/src/pages/Services.tsx web/src/components/layout/AppLayout.tsx
git commit -m "feat(port-forward): add modal, panel, and Pod/Service buttons"
```

---

## Task 4: Rollback Go Backend

**Files:**
- Modify: `internal/k8s/actions.go`
- Modify: `internal/k8s/actions_test.go`
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/router.go`

- [ ] **Step 1: Write failing test — append to `internal/k8s/actions_test.go`**

Add `"encoding/json"`, `"strconv"` to imports if not present. Add `appsv1 "k8s.io/api/apps/v1"` if not already imported (it is). Append:

```go
func TestRollbackDeployment_PatchesToPreviousRevision(t *testing.T) {
	replicas := int32(1)
	fakeClient := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{
				Name:        "my-app",
				Namespace:   "default",
				Annotations: map[string]string{"deployment.kubernetes.io/revision": "2"},
				UID:         "deploy-uid",
			},
			Spec: appsv1.DeploymentSpec{Replicas: &replicas},
		},
		&appsv1.ReplicaSet{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-app-v1",
				Namespace: "default",
				Annotations: map[string]string{"deployment.kubernetes.io/revision": "1"},
				OwnerReferences: []metav1.OwnerReference{
					{Kind: "Deployment", Name: "my-app", UID: "deploy-uid"},
				},
			},
			Spec: appsv1.ReplicaSetSpec{
				Template: corev1.PodTemplateSpec{
					ObjectMeta: metav1.ObjectMeta{Labels: map[string]string{"version": "v1"}},
				},
			},
		},
		&appsv1.ReplicaSet{
			ObjectMeta: metav1.ObjectMeta{
				Name:      "my-app-v2",
				Namespace: "default",
				Annotations: map[string]string{"deployment.kubernetes.io/revision": "2"},
				OwnerReferences: []metav1.OwnerReference{
					{Kind: "Deployment", Name: "my-app", UID: "deploy-uid"},
				},
			},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.RollbackDeployment(context.Background(), "default", "my-app")
	require.NoError(t, err)
}

func TestRollbackDeployment_NoPreviousRevision(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&appsv1.Deployment{
			ObjectMeta: metav1.ObjectMeta{
				Name:        "my-app",
				Namespace:   "default",
				Annotations: map[string]string{"deployment.kubernetes.io/revision": "1"},
			},
		},
	)
	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	err := client.RollbackDeployment(context.Background(), "default", "my-app")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "no previous revision")
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
go test ./internal/k8s/... -run "TestRollbackDeployment" -v
```

Expected: `FAIL`.

- [ ] **Step 3: Add `RollbackDeployment` to `internal/k8s/actions.go`**

Add `"encoding/json"`, `"strconv"`, and `appsv1 "k8s.io/api/apps/v1"` to imports in `actions.go`. Append:

```go
func (c *Client) RollbackDeployment(ctx context.Context, namespace, name string) error {
	deploy, err := c.kube.AppsV1().Deployments(namespace).Get(ctx, name, metav1.GetOptions{})
	if err != nil {
		return fmt.Errorf("get deployment: %w", err)
	}
	currentRevision, err := strconv.ParseInt(deploy.Annotations["deployment.kubernetes.io/revision"], 10, 64)
	if err != nil {
		return fmt.Errorf("parse revision annotation: %w", err)
	}
	targetRevision := fmt.Sprintf("%d", currentRevision-1)

	rsList, err := c.kube.AppsV1().ReplicaSets(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return fmt.Errorf("list replicasets: %w", err)
	}

	var targetRS *appsv1.ReplicaSet
	for i := range rsList.Items {
		rs := &rsList.Items[i]
		if rs.Annotations["deployment.kubernetes.io/revision"] != targetRevision {
			continue
		}
		for _, ref := range rs.OwnerReferences {
			if ref.Kind == "Deployment" && ref.Name == name {
				targetRS = rs
				break
			}
		}
		if targetRS != nil {
			break
		}
	}
	if targetRS == nil {
		return fmt.Errorf("no previous revision found for deployment %s", name)
	}

	templateJSON, err := json.Marshal(targetRS.Spec.Template)
	if err != nil {
		return fmt.Errorf("marshal template: %w", err)
	}
	patch := fmt.Sprintf(`{"spec":{"template":%s}}`, string(templateJSON))
	_, err = c.kube.AppsV1().Deployments(namespace).Patch(
		ctx, name, types.MergePatchType, []byte(patch), metav1.PatchOptions{},
	)
	return err
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
go test ./internal/k8s/... -run "TestRollbackDeployment" -v
```

Expected: `PASS`.

- [ ] **Step 5: Add handler to `internal/api/handlers.go`**

Append:

```go
func (r *Router) handleRollbackDeployment(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")
	if err := r.k8s.RollbackDeployment(c.Request.Context(), ns, name); err != nil {
		if strings.Contains(err.Error(), "no previous revision") {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.Status(http.StatusNoContent)
}
```

- [ ] **Step 6: Add route to `internal/api/router.go`**

Add after the existing rollout-restart route:

```go
v1.POST("/deployments/:namespace/:name/rollback", r.handleRollbackDeployment)
```

- [ ] **Step 7: Verify full build**

```bash
go build ./...
```

Expected: no output.

- [ ] **Step 8: Commit**

```bash
git add internal/k8s/actions.go internal/k8s/actions_test.go internal/api/handlers.go internal/api/router.go
git commit -m "feat(rollback): add RollbackDeployment backend"
```

---

## Task 5: Rollback React Frontend

**Files:**
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/pages/Deployments.tsx`

- [ ] **Step 1: Add `rollbackDeployment` to `web/src/lib/api.ts`**

Append at end of file:

```typescript
export const rollbackDeployment = (ns: string, name: string) =>
  action(`/api/v1/deployments/${ns}/${name}/rollback`, 'POST')
```

- [ ] **Step 2: Update `web/src/pages/Deployments.tsx`**

Add `rollbackDeployment` to the imports from `@/lib/api`:

```typescript
import { fetchDeployments, scaleDeployment, rolloutRestartDeployment, deleteDeployment, rollbackDeployment } from '@/lib/api'
```

Update the `confirmAction` state type to include `'rollback'`:

```typescript
const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'restart' | 'rollback'; deployment: DeploymentSummary } | null>(null)
```

Add rollback handling in `handleConfirm`:

```typescript
const handleConfirm = async () => {
  if (!confirmAction) return
  const { type, deployment } = confirmAction
  setConfirmAction(null)
  if (type === 'delete') {
    await deleteDeployment(deployment.namespace, deployment.name).catch(console.error)
  } else if (type === 'restart') {
    await rolloutRestartDeployment(deployment.namespace, deployment.name).catch(console.error)
  } else if (type === 'rollback') {
    await rollbackDeployment(deployment.namespace, deployment.name).catch(console.error)
  }
  load()
}
```

Add rollback button in the actions column (after the restart button):

```tsx
<button
  onClick={() => setConfirmAction({ type: 'rollback', deployment: row.original })}
  className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs">↩ Rollback</button>
```

Update the ConfirmModal to handle rollback title:

```tsx
{confirmAction && (
  <ConfirmModal
    title={
      confirmAction.type === 'delete'
        ? `Delete deployment "${confirmAction.deployment.name}"?`
        : confirmAction.type === 'restart'
        ? `Rollout restart "${confirmAction.deployment.name}"?`
        : `Rollback "${confirmAction.deployment.name}" to previous revision?`
    }
    message={
      confirmAction.type === 'delete'
        ? 'This will permanently delete the deployment.'
        : confirmAction.type === 'restart'
        ? 'This will restart all pods managed by this deployment.'
        : 'This will revert the deployment to the previous revision.'
    }
    confirmLabel={confirmAction.type === 'delete' ? 'Delete' : confirmAction.type === 'restart' ? 'Restart' : 'Rollback'}
    onConfirm={handleConfirm}
    onCancel={() => setConfirmAction(null)}
  />
)}
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
git add web/src/lib/api.ts web/src/pages/Deployments.tsx
git commit -m "feat(rollback): add Rollback button to Deployments page"
```

---

## Task 6: Final Verification

- [ ] **Step 1: Full test suite**

```bash
go test ./...
cd web && npx vitest run
cd web && npx tsc --noEmit
```

Expected: all pass, no TypeScript errors.

- [ ] **Step 2: Full build**

```bash
make build
```

Expected: `./k999s` builds successfully.

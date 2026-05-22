# Live Updates (WebSocket Informers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire Kubernetes informers for Pods and Events into the existing WebSocket hub so the frontend auto-refreshes when resources change — no manual refresh needed.

**Architecture:** A new `StartInformers(ctx, kube, hub)` function creates two SharedIndexInformers (pods + events). On any Add/Update/Delete event, it calls `hub.Broadcast("pods_update", nil)` or `hub.Broadcast("events_update", nil)`. The frontend already handles `pods_update` in Pods.tsx; Events.tsx gets the same hook. Informers start as goroutines in main.go and stop cleanly when context is cancelled.

**Tech Stack:** `k8s.io/client-go/tools/cache` (SharedIndexInformer, NewListWatchFromClient), existing `ws.Hub`, existing `useWebSocket` React hook

---

## File Map

| File | Change |
|---|---|
| `internal/k8s/client.go` | Add `Kube() kubernetes.Interface` accessor |
| `internal/k8s/informers.go` | New — BroadcastHub interface + StartInformers function |
| `internal/k8s/informers_test.go` | New — broadcast-on-sync tests |
| `cmd/k999s/main.go` | Start informers with context |
| `web/src/pages/Events.tsx` | Add useWebSocket + events_update handler |

---

## Task 1: Kube Accessor + Informers Go Backend

**Files:**
- Modify: `internal/k8s/client.go`
- Create: `internal/k8s/informers.go`
- Create: `internal/k8s/informers_test.go`

- [ ] **Step 1: Write failing tests in `internal/k8s/informers_test.go`**

```go
package k8s_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

type mockHub struct {
	mu     sync.Mutex
	calls  map[string]int
}

func (m *mockHub) Broadcast(msgType string, _ any) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.calls == nil {
		m.calls = make(map[string]int)
	}
	m.calls[msgType]++
}

func (m *mockHub) count(msgType string) int {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.calls[msgType]
}

func TestStartInformers_BroadcastsPodsUpdate(t *testing.T) {
	hub := &mockHub{}
	fakeClient := fake.NewSimpleClientset(
		&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "default"}},
	)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	k8s.StartInformers(ctx, fakeClient, hub)
	time.Sleep(300 * time.Millisecond) // allow informer to process initial list

	assert.Greater(t, hub.count("pods_update"), 0, "expected pods_update broadcast")
}

func TestStartInformers_BroadcastsEventsUpdate(t *testing.T) {
	hub := &mockHub{}
	fakeClient := fake.NewSimpleClientset(
		&corev1.Event{ObjectMeta: metav1.ObjectMeta{Name: "ev-1", Namespace: "default"}},
	)
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	k8s.StartInformers(ctx, fakeClient, hub)
	time.Sleep(300 * time.Millisecond)

	assert.Greater(t, hub.count("events_update"), 0, "expected events_update broadcast")
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
go test ./internal/k8s/... -run "TestStartInformers" -v
```

Expected: `FAIL` — `k8s.StartInformers` undefined.

- [ ] **Step 3: Add `Kube()` accessor to `internal/k8s/client.go`**

Append after the `NewClientFromKubernetesClient` function (around line 57):

```go
// Kube returns the underlying kubernetes.Interface for use by informers.
func (c *Client) Kube() kubernetes.Interface { return c.kube }
```

- [ ] **Step 4: Create `internal/k8s/informers.go`**

```go
package k8s

import (
	"context"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/fields"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/cache"
)

// BroadcastHub is satisfied by *ws.Hub — defined here to avoid import cycle.
type BroadcastHub interface {
	Broadcast(msgType string, data any)
}

// StartInformers starts pod and event informers that broadcast to hub on any change.
// Returns immediately; informers run as goroutines until ctx is cancelled.
func StartInformers(ctx context.Context, kube kubernetes.Interface, hub BroadcastHub) {
	startPodInformer(ctx, kube, hub)
	startEventInformer(ctx, kube, hub)
}

func startPodInformer(ctx context.Context, kube kubernetes.Interface, hub BroadcastHub) {
	lw := cache.NewListWatchFromClient(
		kube.CoreV1().RESTClient(),
		"pods",
		corev1.NamespaceAll,
		fields.Everything(),
	)
	inf := cache.NewSharedIndexInformer(lw, &corev1.Pod{}, 0, cache.Indexers{})
	inf.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(_ any) { hub.Broadcast("pods_update", nil) },
		UpdateFunc: func(_, _ any) { hub.Broadcast("pods_update", nil) },
		DeleteFunc: func(_ any) { hub.Broadcast("pods_update", nil) },
	})
	go inf.Run(ctx.Done())
}

func startEventInformer(ctx context.Context, kube kubernetes.Interface, hub BroadcastHub) {
	lw := cache.NewListWatchFromClient(
		kube.CoreV1().RESTClient(),
		"events",
		corev1.NamespaceAll,
		fields.Everything(),
	)
	inf := cache.NewSharedIndexInformer(lw, &corev1.Event{}, 0, cache.Indexers{})
	inf.AddEventHandler(cache.ResourceEventHandlerFuncs{
		AddFunc:    func(_ any) { hub.Broadcast("events_update", nil) },
		UpdateFunc: func(_, _ any) { hub.Broadcast("events_update", nil) },
		DeleteFunc: func(_ any) { hub.Broadcast("events_update", nil) },
	})
	go inf.Run(ctx.Done())
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
go test ./internal/k8s/... -run "TestStartInformers" -v
```

Expected: `PASS`.

- [ ] **Step 6: Verify full build**

```bash
go build ./...
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add internal/k8s/client.go internal/k8s/informers.go internal/k8s/informers_test.go
git commit -m "feat(live-updates): add Kube() accessor and pod/event informers"
```

---

## Task 2: Wire Informers in main.go + Events.tsx

**Files:**
- Modify: `cmd/k999s/main.go`
- Modify: `web/src/pages/Events.tsx`

- [ ] **Step 1: Update `cmd/k999s/main.go`**

After `hub := ws.NewHub()` and before `router := api.NewRouter(...)`, add:

```go
ctx, cancel := context.WithCancel(context.Background())
defer cancel()
go k8s.StartInformers(ctx, k8sClient.Kube(), hub)
```

Add `"context"` to the imports if not already present.

The full relevant section becomes:
```go
hub := ws.NewHub()

ctx, cancel := context.WithCancel(context.Background())
defer cancel()
go k8s.StartInformers(ctx, k8sClient.Kube(), hub)

router := api.NewRouter(k8sClient, frontend.FS, hub, provider, cfg)
```

- [ ] **Step 2: Verify build**

```bash
go build ./...
```

Expected: no output.

- [ ] **Step 3: Update `web/src/pages/Events.tsx`**

Add `useWebSocket` to the imports (line 2):

```typescript
import { useWebSocket } from '@/hooks/useWebSocket'
```

Add the hook inside the `Events` function body, after the `useEffect` call:

```tsx
useWebSocket((msg) => {
  if (msg.type === 'events_update') load()
})
```

- [ ] **Step 4: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run all tests**

```bash
go test ./...
cd web && npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add cmd/k999s/main.go web/src/pages/Events.tsx
git commit -m "feat(live-updates): wire informers in main.go and add events_update to Events page"
```

---

## Task 3: Final Verification

- [ ] **Step 1: Full build**

```bash
make build
```

Expected: `./k999s` builds successfully.

- [ ] **Step 2: Smoke test (optional, requires cluster)**

```bash
./k999s
# Open browser → Pods page → delete a pod from another terminal
# Verify Pods table refreshes automatically without manual refresh
```

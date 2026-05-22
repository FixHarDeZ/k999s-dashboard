# Design Spec: Live Updates (WebSocket Informers)

**Date:** 2026-05-22  
**Status:** Approved  
**Approach:** Signal-only broadcast via Kubernetes informers → frontend re-fetches on signal

---

## Overview

Wire Kubernetes informers for Pods and Events into the existing WebSocket hub so the frontend receives a signal whenever a resource changes and re-fetches fresh data automatically — no manual refresh needed.

---

## Current State

- `internal/ws/Hub` and `Broadcast()` already exist
- `useWebSocket` hook in `web/src/hooks/useWebSocket.ts` already auto-reconnects
- `Pods.tsx` already handles `pods_update` message by calling `load()`
- Hub is created in `cmd/k999s/main.go` and passed to the router
- No informers exist yet — nothing broadcasts to the hub

---

## Architecture

```
k8s API server
    ↓ (watch stream)
SharedIndexInformer (pods)     → hub.Broadcast("pods_update", nil)
SharedIndexInformer (events)   → hub.Broadcast("events_update", nil)
    ↓
ws.Hub → all connected WebSocket clients
    ↓
Frontend:
  Pods.tsx   → load() on "pods_update"
  Events.tsx → load() on "events_update"
```

---

## Go Backend

### New File: `internal/k8s/informers.go`

**Interface** (allows testing with a mock hub):
```go
type BroadcastHub interface {
    Broadcast(msgType string, data any)
}
```

**Function:**
```go
func StartInformers(ctx context.Context, kube kubernetes.Interface, hub BroadcastHub)
```

- Creates two `cache.NewSharedIndexInformer` instances:
  - Pods: `kube.CoreV1().Pods(metav1.NamespaceAll)` resource, resync = 0
  - Events: `kube.CoreV1().Events(metav1.NamespaceAll)` resource, resync = 0
- Each informer uses `cache.ResourceEventHandlerFuncs` with AddFunc/UpdateFunc/DeleteFunc all calling `hub.Broadcast("pods_update", nil)` or `hub.Broadcast("events_update", nil)` respectively
- Both informers run as goroutines via `go informer.Run(ctx.Done())`
- Function returns immediately after starting goroutines; context cancellation stops informers cleanly

### Update: `internal/k8s/client.go`

Add public accessor so `StartInformers` can receive the interface without coupling to `*Client`:

```go
func (c *Client) Kube() kubernetes.Interface { return c.kube }
```

### Update: `cmd/k999s/main.go`

Add after creating hub and before starting the router:

```go
ctx, cancel := context.WithCancel(context.Background())
defer cancel()
go k8s.StartInformers(ctx, k8sClient.Kube(), hub)
```

---

## Frontend

### `web/src/pages/Events.tsx`

Add `useWebSocket` import and hook (same pattern as Pods.tsx):

```tsx
import { useWebSocket } from '@/hooks/useWebSocket'

// inside Events component:
useWebSocket((msg) => {
  if (msg.type === 'events_update') load()
})
```

### `web/src/pages/Pods.tsx`

No changes needed — handler already exists.

---

## Testing

### Go: `internal/k8s/informers_test.go`

- Create a mock hub (`mockHub` that records calls to `Broadcast`)
- Inject a `fake.NewSimpleClientset` with a pod
- Call `StartInformers` with a cancelable context
- Create/update/delete the pod via the fake client
- Assert `mockHub.Broadcast` was called with `"pods_update"`
- Same pattern for events

### Frontend

- No new test files needed — hook behavior is tested transitively through existing Pods tests

---

## Out of Scope

- Live updates for Deployments, Services, Nodes, or other resources
- Debouncing broadcast calls (acceptable for local tool)
- Namespace-scoped informers (broadcast cluster-wide; frontend already filters by namespace on re-fetch)

# Design Spec: Port-forward + Deployment Rollback

**Date:** 2026-05-22  
**Status:** Approved  
**Approach:** REST + server-side goroutine for port-forward; ReplicaSet revision patch for rollback

---

## Overview

Two independent action features added to k999s:

1. **Port-forward** — start a `client-go` port-forward tunnel from localhost to a Pod or Service (via pod resolution), managed by the server, tracked in an Active Port-Forwards panel
2. **Rollback** — revert a Deployment to its previous revision (equivalent to `kubectl rollout undo`)

---

## Feature 1: Port-forward

### Go Backend

#### `internal/k8s/portforward.go` (new file)

```go
func (c *Client) StartPortForward(
    ctx context.Context,
    namespace, podName string,
    localPort, remotePort int,
    stopCh <-chan struct{},
    readyCh chan struct{},
) error
```

Uses `k8s.io/client-go/tools/portforward` package. Requires `c.restConfig` (already available on the Client struct). Binds `127.0.0.1:localPort` → `pod:remotePort`. Blocks until `stopCh` is closed or an error occurs.

For **Services**: resolve service → find a running pod matching the service's label selector → forward to that pod at the service's `targetPort`. Implemented as a helper `resolveServiceToPod(ctx, namespace, serviceName) (podName, targetPort, error)` in the same file.

#### Port-forward Manager in `internal/api/router.go`

Add to `Router` struct:
```go
pfEntries map[string]*pfEntry  // key: generated UUID
pfMu      sync.Mutex
```

```go
type pfEntry struct {
    ID         string
    Namespace  string
    TargetName string  // pod or service name
    TargetKind string  // "Pod" | "Service"
    LocalPort  int
    RemotePort int
    stopCh     chan struct{}
}
```

#### Handlers

**POST `/api/v1/port-forward`**

Request body:
```json
{
  "namespace": "default",
  "targetKind": "Pod",       // or "Service"
  "targetName": "nginx-abc",
  "localPort": 8080,
  "remotePort": 80
}
```

- For Service: call `resolveServiceToPod` to get pod name + target port
- Generate UUID as entry ID
- Create `stopCh` channel, add entry to `pfEntries` map
- Launch goroutine: `c.k8s.StartPortForward(...)` — goroutine removes entry from map on exit
- Wait for `readyCh` (max 5s) before responding
- Return `{"id": "<uuid>", "localPort": 8080}`

**GET `/api/v1/port-forward`**

Returns all active entries:
```json
{"items": [{"id": "...", "namespace": "default", "targetKind": "Pod", "targetName": "nginx-abc", "localPort": 8080, "remotePort": 80}]}
```

**DELETE `/api/v1/port-forward/:id`**

- Find entry by ID, close its `stopCh`, remove from map
- Returns 204

#### Routes added to `internal/api/router.go`

```
POST   /api/v1/port-forward
GET    /api/v1/port-forward
DELETE /api/v1/port-forward/:id
```

Also add `OPTIONS` support for these routes (already covered by existing CORS middleware).

### TypeScript Types (`web/src/lib/types.ts`)

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

### API Functions (`web/src/lib/api.ts`)

```typescript
export async function startPortForward(req: {
  namespace: string
  targetKind: string
  targetName: string
  localPort: number
  remotePort: number
}): Promise<{ id: string; localPort: number }>

export async function listPortForwards(): Promise<PortForwardEntry[]>

export const stopPortForward = (id: string) =>
  action(`/api/v1/port-forward/${id}`, 'DELETE')
```

### React Frontend

#### `web/src/components/PortForwardModal.tsx` (new)

Modal triggered from Pods or Services row. Fields:
- Local Port (number input, default: remote port value)
- Remote Port (number input, pre-filled from container/service port if available)
- "Start" button → calls `startPortForward` → closes modal

#### `web/src/components/PortForwardPanel.tsx` (new)

Floating panel, bottom-right corner. Hidden when no active forwards.

- Polls `listPortForwards()` every 5s
- Displays each entry: `{targetName}  :{localPort} → :{remotePort}  [localhost:{localPort}]  [Stop]`
- `localhost:{localPort}` is a clickable link (`<a href="http://localhost:{localPort}" target="_blank">`)
- "Stop" button calls `stopPortForward(id)` then refreshes list

#### `web/src/pages/Pods.tsx`

Add "Port Forward" button to actions column → opens `PortForwardModal` with `targetKind="Pod"`.

#### `web/src/pages/Services.tsx`

Add "Port Forward" button to actions column → opens `PortForwardModal` with `targetKind="Service"`.

#### `web/src/components/layout/AppLayout.tsx`

Mount `<PortForwardPanel />` at root so it's visible on every page.

---

## Feature 2: Deployment Rollback

### Go Backend

#### `internal/k8s/actions.go`

```go
func (c *Client) RollbackDeployment(ctx context.Context, namespace, name string) error
```

Algorithm:
1. Get Deployment → read annotation `deployment.kubernetes.io/revision` → parse as int N
2. List all ReplicaSets in namespace with `ownerReferences` pointing to this deployment
3. Find RS where annotation `deployment.kubernetes.io/revision` = N-1
4. If not found: return error "no previous revision found"
5. Merge-patch the Deployment's `spec.template` with the RS's `spec.template`

#### Handler + Route

```go
func (r *Router) handleRollbackDeployment(c *gin.Context)
// POST /api/v1/deployments/:namespace/:name/rollback
```

Returns 204 on success, 400 if no previous revision exists.

### TypeScript / React

**`web/src/lib/api.ts`**
```typescript
export const rollbackDeployment = (ns: string, name: string) =>
  action(`/api/v1/deployments/${ns}/${name}/rollback`, 'POST')
```

**`web/src/pages/Deployments.tsx`**

Add "Rollback" button to actions column → `ConfirmModal` ("Roll back to previous revision?") → `rollbackDeployment()` → `load()`

---

## Testing

### Go Tests

**`internal/k8s/portforward_test.go`**
- `TestResolveServiceToPod_FindsMatchingPod` — fake client with service + matching pod, verify pod name returned
- `TestResolveServiceToPod_NoPodsFound` — returns error

**`internal/k8s/actions_test.go`** (append)
- `TestRollbackDeployment_PatchesToPreviousRevision` — fake client with deployment (revision 2) + two ReplicaSets (revision 1, 2), verify deployment spec.template is patched to RS revision 1's template
- `TestRollbackDeployment_NoPreviousRevision` — returns error when no N-1 RS found

### Frontend Tests

**`web/src/components/PortForwardPanel.test.tsx`** (new)
- Renders "no active forwards" state when list is empty
- Renders entry with localhost link when list has items

**`web/src/pages/Deployments.test.tsx`** (new or update existing)
- Rollback button is present in actions column

---

## Out of Scope

- Port-forward for Deployments (resolve to pod is ambiguous with multiple replicas)
- Port-forward persistence across server restarts
- Multiple simultaneous forwards to the same pod:port combination (last one wins)
- Rollback to arbitrary revision (only previous revision supported)
- Rollback for StatefulSets or DaemonSets

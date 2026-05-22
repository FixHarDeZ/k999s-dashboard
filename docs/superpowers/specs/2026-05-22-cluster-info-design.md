# Design Spec: Cluster Info Panel (Batch E1)

**Date:** 2026-05-22  
**Status:** Approved  
**Approach:** New `/api/v1/cluster-info` endpoint + card at top of Overview page

---

## Overview

Add a Cluster Info card to the top of the Overview page showing: active context name, cluster name, user, Kubernetes server version, and cluster-wide CPU/MEM utilization percentages.

---

## Go Backend

### `internal/k8s/types.go`

Add:
```go
type ClusterInfo struct {
    ContextName string `json:"contextName"`
    ClusterName string `json:"clusterName"`
    UserName    string `json:"userName"`
    K8sVersion  string `json:"k8sVersion"`
    CPUPercent  string `json:"cpuPercent"` // "5%" or "—"
    MemPercent  string `json:"memPercent"` // "50%" or "—"
}
```

### `internal/k8s/client.go` — `GetClusterInfo() (ClusterInfo, error)`

```go
func (c *Client) GetClusterInfo(ctx context.Context) (ClusterInfo, error)
```

1. **Context/Cluster/User** — load raw kubeconfig via `clientcmd.NewNonInteractiveDeferredLoadingClientConfig(...)` → `RawConfig()` → find current context entry → read `Cluster` and `AuthInfo` names.

2. **K8s version** — `c.kube.Discovery().ServerVersion()` → `v.GitVersion` (e.g. `"v1.35.0"`).

3. **CPU/MEM percent** — list nodes for allocatable, list node metrics for usage, compute aggregate:
   - `CPUPercent = sum(node usage millicores) / sum(node allocatable millicores) * 100`
   - `MemPercent = sum(node usage bytes) / sum(node allocatable bytes) * 100`
   - If metrics-server unavailable (error on ListNodeMetrics), set both to `"—"`.

### `internal/api/handlers.go`

```go
func (r *Router) handleGetClusterInfo(c *gin.Context) {
    info, err := r.k8s.GetClusterInfo(c.Request.Context())
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, info)
}
```

### `internal/api/router.go`

```go
v1.GET("/cluster-info", r.handleGetClusterInfo)
```

---

## Frontend

### `web/src/lib/types.ts`

```typescript
export interface ClusterInfo {
  contextName: string
  clusterName: string
  userName: string
  k8sVersion: string
  cpuPercent: string
  memPercent: string
}
```

### `web/src/lib/api.ts`

```typescript
export async function fetchClusterInfo(): Promise<ClusterInfo> {
  return get<ClusterInfo>('/api/v1/cluster-info')
}
```

### `web/src/pages/Overview.tsx`

Add `ClusterInfoCard` section at the top of the page (before existing node health / pod sections):

```
┌─────────────────────────────────────────────┐
│ Cluster                                      │
│ Context: aks-scb-...                        │
│ Cluster: aks-scb-mandatory-aks-np-cluster   │
│ User:    clusterAdmin_...                   │
│ K8s Rev: v1.35.0                           │
│ CPU:  5%  ████░░░░░░                       │
│ MEM: 50%  █████░░░░░                       │
└─────────────────────────────────────────────┘
```

Displayed as a horizontal row of key-value pairs (compact grid, 2 columns on wide screens). CPU/MEM show a thin progress bar beside the percentage. Loaded on mount with `fetchClusterInfo()`.

---

## Testing

- `GetClusterInfo` integration is hard to unit-test (depends on kubeconfig + metrics). Test coverage via `go build ./...` only.
- Frontend: update Overview test to mock `fetchClusterInfo` and verify card renders contextName.

---

## Out of Scope

- Auto-refresh of cluster info (fetch once on mount)
- k999s app version display (no equivalent to "K9s Rev")

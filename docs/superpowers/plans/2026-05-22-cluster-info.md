# Cluster Info Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Cluster Info card at the top of the Overview page showing context, cluster, user, K8s version, and cluster-wide CPU/MEM utilization.

**Architecture:** New `GetClusterInfo()` method on `*Client` reads kubeconfig raw config for context/cluster/user, calls `Discovery().ServerVersion()` for K8s version, and aggregates node allocatable vs metrics for CPU/MEM percentages. A new `GET /api/v1/cluster-info` endpoint exposes this. Overview.tsx fetches on mount and renders a compact info card above the existing stats row.

**Tech Stack:** `client-go` Discovery API, `clientcmd` RawConfig, `metrics/pkg/client`, React useState

---

## File Map

| File | Change |
|---|---|
| `internal/k8s/types.go` | Add `ClusterInfo` struct |
| `internal/k8s/client.go` | Add `GetClusterInfo()` method |
| `internal/api/handlers.go` | Add `handleGetClusterInfo` |
| `internal/api/router.go` | Add `GET /api/v1/cluster-info` |
| `web/src/lib/types.ts` | Add `ClusterInfo` interface |
| `web/src/lib/api.ts` | Add `fetchClusterInfo()` |
| `web/src/pages/Overview.tsx` | Add cluster info card at top |

---

## Task 1: Go Backend

**Files:**
- Modify: `internal/k8s/types.go`
- Modify: `internal/k8s/client.go`
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/router.go`

- [ ] **Step 1: Add `ClusterInfo` struct to `internal/k8s/types.go`**

Append after the `HPASummary` struct:

```go
type ClusterInfo struct {
	ContextName string `json:"contextName"`
	ClusterName string `json:"clusterName"`
	UserName    string `json:"userName"`
	K8sVersion  string `json:"k8sVersion"`
	CPUPercent  string `json:"cpuPercent"`
	MemPercent  string `json:"memPercent"`
}
```

- [ ] **Step 2: Add `GetClusterInfo()` to `internal/k8s/client.go`**

Add `metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"` to imports if not already present (it's already in metrics.go but client.go needs it separately if calling from here — alternatively inline the metrics call as shown below).

Append after `GetContexts()`:

```go
// GetClusterInfo returns context/cluster/user/version and CPU/MEM utilization.
func (c *Client) GetClusterInfo(ctx context.Context) (ClusterInfo, error) {
	info := ClusterInfo{
		ContextName: c.currentContext,
		CPUPercent:  "—",
		MemPercent:  "—",
	}

	// Read cluster + user from raw kubeconfig.
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	if c.kubeconfigPath != "" {
		loadingRules.ExplicitPath = c.kubeconfigPath
	}
	rawConfig, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		loadingRules, &clientcmd.ConfigOverrides{},
	).RawConfig()
	if err == nil {
		if ctx2, ok := rawConfig.Contexts[c.currentContext]; ok {
			info.ClusterName = ctx2.Cluster
			info.UserName = ctx2.AuthInfo
		}
	}

	// K8s server version.
	if sv, err := c.kube.Discovery().ServerVersion(); err == nil {
		info.K8sVersion = sv.GitVersion
	}

	// CPU/MEM: aggregate node allocatable vs usage.
	nodeList, err := c.kube.CoreV1().Nodes().List(ctx, metav1.ListOptions{})
	if err != nil {
		return info, nil
	}
	var totalCPUm, totalMemB int64
	for _, n := range nodeList.Items {
		totalCPUm += n.Status.Allocatable.Cpu().MilliValue()
		totalMemB += n.Status.Allocatable.Memory().Value()
	}

	if c.restConfig != nil && totalCPUm > 0 {
		mc, err := metricsclient.NewForConfig(c.restConfig)
		if err == nil {
			if ml, err := mc.MetricsV1beta1().NodeMetricses().List(ctx, metav1.ListOptions{}); err == nil {
				var usedCPUm, usedMemB int64
				for _, m := range ml.Items {
					usedCPUm += m.Usage.Cpu().MilliValue()
					usedMemB += m.Usage.Memory().Value()
				}
				info.CPUPercent = fmt.Sprintf("%d%%", usedCPUm*100/totalCPUm)
				if totalMemB > 0 {
					info.MemPercent = fmt.Sprintf("%d%%", usedMemB*100/totalMemB)
				}
			}
		}
	}

	return info, nil
}
```

Add `metricsclient "k8s.io/metrics/pkg/client/clientset/versioned"` to the imports block in `client.go`.

- [ ] **Step 3: Verify build**

```bash
go build ./...
```

Expected: no output.

- [ ] **Step 4: Add handler to `internal/api/handlers.go`**

Append:

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

- [ ] **Step 5: Add route to `internal/api/router.go`**

Add after `v1.GET("/contexts", ...)`:

```go
v1.GET("/cluster-info", r.handleGetClusterInfo)
```

- [ ] **Step 6: Verify full build**

```bash
go build ./...
```

Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add internal/k8s/types.go internal/k8s/client.go internal/api/handlers.go internal/api/router.go
git commit -m "feat(cluster-info): add GetClusterInfo backend and /api/v1/cluster-info endpoint"
```

---

## Task 2: Frontend — Types, API, Overview Card

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/pages/Overview.tsx`

- [ ] **Step 1: Add `ClusterInfo` interface to `web/src/lib/types.ts`**

Append at end of file:

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

- [ ] **Step 2: Add `fetchClusterInfo` to `web/src/lib/api.ts`**

Add `ClusterInfo` to the import on line 1. Append at end:

```typescript
export async function fetchClusterInfo(): Promise<ClusterInfo> {
  return get<ClusterInfo>('/api/v1/cluster-info')
}
```

- [ ] **Step 3: Update `web/src/pages/Overview.tsx`**

Add `fetchClusterInfo` to the import from `@/lib/api`. Add `ClusterInfo` to the type import.

Add state inside `Overview`:
```typescript
const [clusterInfo, setClusterInfo] = useState<ClusterInfo | null>(null)
```

Add to the `load` callback:
```typescript
fetchClusterInfo().then(setClusterInfo).catch(console.error)
```

Add the cluster info card **before** the stats row (`{/* Stats row */}` comment). Insert this block:

```tsx
{clusterInfo && (
  <div style={{
    background: '#fff', border: '1px solid #e0e7ff', borderRadius: 10,
    padding: '12px 16px', marginBottom: 16,
  }}>
    <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8 }}>Cluster</div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 24px' }}>
      {[
        ['Context', clusterInfo.contextName],
        ['Cluster', clusterInfo.clusterName],
        ['User', clusterInfo.userName],
        ['K8s Rev', clusterInfo.k8sVersion],
      ].map(([label, value]) => (
        <div key={label} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ fontSize: 10, color: '#9ca3af', minWidth: 52, flexShrink: 0 }}>{label}:</span>
          <span style={{ fontSize: 11, color: '#1e1b4b', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value || '—'}</span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#9ca3af', minWidth: 52, flexShrink: 0 }}>CPU:</span>
        <span style={{ fontSize: 11, color: '#1e1b4b', fontWeight: 500 }}>{clusterInfo.cpuPercent}</span>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span style={{ fontSize: 10, color: '#9ca3af', minWidth: 52, flexShrink: 0 }}>MEM:</span>
        <span style={{ fontSize: 11, color: '#1e1b4b', fontWeight: 500 }}>{clusterInfo.memPercent}</span>
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 4: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Run tests**

```bash
go test ./...
cd web && npx vitest run
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add web/src/lib/types.ts web/src/lib/api.ts web/src/pages/Overview.tsx
git commit -m "feat(cluster-info): add cluster info card to Overview page"
```

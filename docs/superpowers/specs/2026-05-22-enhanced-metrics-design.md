# Design Spec: Enhanced Metrics (Batch E2)

**Date:** 2026-05-22  
**Status:** Approved  
**Approach:** Enrich PodSummary/NodeSummary with request/limit/allocatable fields; frontend joins with existing metrics endpoints and computes percentages

---

## Overview

Extend the Pods page to show CPU and MEM with request/limit ratios, and the Nodes page to show CPU and MEM with allocatable ratios. All values degrade gracefully to `"—"` when metrics-server is unavailable.

---

## Column Format

**Pods:**
```
CPU    %CPU/R  %CPU/L   MEM     %MEM/R  %MEM/L
45m    45%     9%       128Mi   100%    25%
—      —       —        —       —       —       ← metrics-server absent
100m   —       —        64Mi    —       —       ← no requests/limits set
```

**Nodes:**
```
CPU    %CPU/A   MEM     %MEM/A
2.1    21%      8.2Gi   40%
—      —        —       —       ← metrics-server absent
```

(A = Allocatable)

---

## Go Backend

### `internal/k8s/types.go` — Extend `PodSummary`

Add 4 fields:
```go
CPURequest string `json:"cpuRequest"` // "100m", "1.5", or "—" if no request set
CPULimit   string `json:"cpuLimit"`   // "500m" or "—" if no limit
MemRequest string `json:"memRequest"` // "128Mi" or "—"
MemLimit   string `json:"memLimit"`   // "256Mi" or "—"
```

### `internal/k8s/types.go` — Extend `NodeSummary`

Add 2 fields:
```go
CPUAllocatable string `json:"cpuAllocatable"` // "4" (cores)
MemAllocatable string `json:"memAllocatable"` // "16Gi"
```

### `internal/k8s/client.go` — Resource formatting helpers

Add two pure functions (no methods, testable):
```go
// formatCPUQuantity formats a CPU resource.Quantity as "Xm" (millicores) or "X.X" (cores).
// Returns "—" if quantity is zero (not set).
func formatCPUQuantity(q resource.Quantity) string

// formatMemQuantity formats a memory resource.Quantity as "XMi" or "X.XGi".
// Returns "—" if quantity is zero.
func formatMemQuantity(q resource.Quantity) string
```

Import needed: `"k8s.io/apimachinery/pkg/api/resource"`

### `internal/k8s/client.go` — `toPodSummary`

Extend to sum container requests/limits:
```go
var cpuReq, cpuLim, memReq, memLim resource.Quantity
for _, c := range p.Spec.Containers {
    cpuReq.Add(c.Resources.Requests[corev1.ResourceCPU])
    cpuLim.Add(c.Resources.Limits[corev1.ResourceCPU])
    memReq.Add(c.Resources.Requests[corev1.ResourceMemory])
    memLim.Add(c.Resources.Limits[corev1.ResourceMemory])
}
```

Set `CPURequest: formatCPUQuantity(cpuReq)` etc. Init containers are excluded (workload containers only).

### `internal/k8s/client.go` — `toNodeSummary`

Extend:
```go
CPUAllocatable: formatCPUQuantity(node.Status.Allocatable[corev1.ResourceCPU]),
MemAllocatable: formatMemQuantity(node.Status.Allocatable[corev1.ResourceMemory]),
```

---

## Frontend

### `web/src/lib/types.ts` — Extend `PodSummary`

```typescript
cpuRequest: string  // "100m" or "—"
cpuLimit: string    // "500m" or "—"
memRequest: string  // "128Mi" or "—"
memLimit: string    // "256Mi" or "—"
```

### `web/src/lib/types.ts` — Extend `NodeSummary`

```typescript
cpuAllocatable: string  // "4"
memAllocatable: string  // "16Gi"
```

### `web/src/lib/resourceUtils.ts` (new file)

Utility functions for parsing and computing percentages:

```typescript
// Parse CPU string ("100m" → 100, "1.5" → 1500, "—" → null)
export function parseMillicores(s: string): number | null

// Parse memory string ("128Mi" → 128, "1Gi" → 1024, "—" → null) — result in MiB
export function parseMiB(s: string): number | null

// Compute percentage string, returns "—" if either value is null/zero
export function pct(usage: string, total: string, parser: (s: string) => number | null): string
```

### `web/src/pages/Pods.tsx`

- Fetch `/api/v1/pod-metrics` alongside `/api/v1/pods` (parallel Promise.all)
- Build a `Map<string, PodMetricsSummary>` keyed by `${ns}/${name}`
- Add 6 columns: **CPU** | **%CPU/R** | **%CPU/L** | **MEM** | **%MEM/R** | **%MEM/L**
- If pod not in metrics map → all 6 show `"—"`

### `web/src/pages/Nodes.tsx`

- Fetch `/api/v1/node-metrics` alongside `/api/v1/nodes` (parallel Promise.all)
- Build a `Map<string, NodeMetricsSummary>` keyed by `name`
- Add 4 columns: **CPU** | **%CPU/A** | **MEM** | **%MEM/A**
- If node not in metrics map → all 4 show `"—"`

---

## Testing

### Go: `internal/k8s/client_test.go`

- `TestFormatCPUQuantity` — "100m CPU request → '100m'", "1500m → '1.5'", "zero → '—'"
- `TestFormatMemQuantity` — "134217728 bytes → '128Mi'", "1073741824 → '1Gi'", "zero → '—'"
- `TestListPods_IncludesRequests` — fake pod with CPU request 100m → item has `cpuRequest: "100m"`

### Frontend: `web/src/lib/resourceUtils.test.ts` (new)

- `parseMillicores("100m")` → 100
- `parseMillicores("1.5")` → 1500
- `parseMillicores("—")` → null
- `parseMiB("128Mi")` → 128
- `parseMiB("1Gi")` → 1024
- `pct("100m", "200m", parseMillicores)` → "50%"
- `pct("—", "200m", parseMillicores)` → "—"

---

## Out of Scope

- Init container resources (excluded intentionally — workload containers only)
- Per-container breakdown
- Historical metrics / graphs

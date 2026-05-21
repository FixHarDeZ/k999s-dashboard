# Design: Istio / Gateway API / Canary Pages

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Implement three new dashboard pages for CRD-based resources that are already detected and linked in the sidebar but currently show nothing. All three pages are read-only with a YAML side panel. No new backend Go endpoints are required.

---

## Architecture

### Files to Create

| File | Purpose |
|------|---------|
| `web/src/components/YamlSidePanel.tsx` | Shared slide-over panel showing resource YAML |
| `web/src/pages/Istio.tsx` | Istio page: VirtualService + DestinationRule tabs |
| `web/src/pages/Gateway.tsx` | Gateway API page: Gateway + HTTPRoute tabs |
| `web/src/pages/Canary.tsx` | Canary page: Flagger Canary + Argo Rollouts tabs |

### Files to Modify

| File | Change |
|------|--------|
| `web/src/App.tsx` | Add routes `/istio`, `/gateway`, `/canary` |
| `web/src/lib/types.ts` | Split `CRDPresence.canary` → `flaggerCanary` + `argoRollouts` |
| `internal/k8s/crd_detect.go` | Split Canary detection into `FlaggerCanary` + `ArgoRollouts` |

### Data Flow

```
Page mount
  → fetchAPIResources()                        ← discover actual version per CRD type
  → fetchResourceList(group, ver, resource, ns) ← list table rows
  → [row click] fetchResourceGet(...)           ← fetch YAML for side panel
```

No new Go endpoints. Uses existing:
- `GET /api/v1/api-resources`
- `GET /api/v1/resource-list?group=&version=&resource=&namespace=`
- `GET /api/v1/resource-get?group=&version=&resource=&namespace=&name=`
- `GET /api/v1/detected-crds`

---

## Backend Changes

### `internal/k8s/crd_detect.go`

Split `Canary bool` into two fields:

```go
type CRDPresence struct {
    Istio         bool `json:"istio"`
    GatewayAPI    bool `json:"gatewayApi"`
    FlaggerCanary bool `json:"flaggerCanary"`
    ArgoRollouts  bool `json:"argoRollouts"`
}
```

Detection groups:
- `FlaggerCanary`: `flagger.app`
- `ArgoRollouts`: `argoproj.io`

---

## Frontend Components

### `YamlSidePanel.tsx`

Props:
```ts
interface YamlSidePanelProps {
  group: string
  version: string
  resource: string
  namespace: string
  name: string
  onClose: () => void
}
```

- Slide-over panel from the right (same pattern as LogViewer)
- Fetches YAML via `fetchResourceGet` on mount
- Full / Clean toggle (Clean = strip `status` and `managedFields`)
- Loading spinner + error state

---

## Page Designs

### `Istio.tsx`

Two tabs: **VirtualService** | **DestinationRule**

Namespace filter from `useOutletContext`. RefreshButton. Filter input.

**VirtualService columns:**

| Column | Source |
|--------|--------|
| Name | `metadata.name` |
| Namespace | `metadata.namespace` |
| Hosts | `spec.hosts?.join(', ')` |
| Gateways | `spec.gateways?.length` count |
| HTTP Routes | `spec.http?.length` count |
| Age | derived from `metadata.creationTimestamp` |

**DestinationRule columns:**

| Column | Source |
|--------|--------|
| Name | `metadata.name` |
| Namespace | `metadata.namespace` |
| Host | `spec.host` |
| Subsets | `spec.subsets?.map(s => s.name).join(', ')` |
| Traffic Policy | `spec.trafficPolicy ? 'Configured' : '—'` |
| Age | derived from `metadata.creationTimestamp` |

Version discovery: find `networking.istio.io/virtualservices` in `fetchAPIResources()`. Default fallback: `v1beta1`.

---

### `Gateway.tsx`

Two tabs: **Gateway** | **HTTPRoute**

**Gateway columns:**

| Column | Source |
|--------|--------|
| Name | `metadata.name` |
| Namespace | `metadata.namespace` |
| Gateway Class | `spec.gatewayClassName` |
| Listeners | `spec.listeners?.length` count |
| Age | derived from `metadata.creationTimestamp` |

**HTTPRoute columns:**

| Column | Source |
|--------|--------|
| Name | `metadata.name` |
| Namespace | `metadata.namespace` |
| Hostnames | `spec.hostnames?.join(', ')` |
| Parent Refs | `spec.parentRefs?.map(r => r.name).join(', ')` |
| Rules | `spec.rules?.length` count |
| Age | derived from `metadata.creationTimestamp` |

Version discovery: find `gateway.networking.k8s.io/gateways` in `fetchAPIResources()`. Default fallback: `v1`.

---

### `Canary.tsx`

Two tabs shown only if the corresponding CRD is present (`detectedCRDs.flaggerCanary`, `detectedCRDs.argoRollouts`). If only one exists, show without tabs.

**Flagger Canary columns:**

| Column | Source |
|--------|--------|
| Name | `metadata.name` |
| Namespace | `metadata.namespace` |
| Target | `spec.targetRef?.name` |
| Phase | `status.phase` — colored badge |
| Weight | `status.canaryWeight` — progress bar (0 → maxWeight%) |
| Max Weight | `spec.analysis?.maxWeight ?? spec.canaryAnalysis?.maxWeight` |
| Age | derived from `metadata.creationTimestamp` |

Phase badge colors:
- `Initialized` → gray
- `Waiting` / `Paused` → yellow  
- `Progressing` → blue
- `Promoting` → purple
- `Finalising` → teal
- `Succeeded` → green
- `Failed` → red

**Argo Rollouts columns:**

| Column | Source |
|--------|--------|
| Name | `metadata.name` |
| Namespace | `metadata.namespace` |
| Strategy | `spec.strategy?.canary ? 'Canary' : 'BlueGreen'` |
| Phase | `status.phase` — colored badge |
| Ready | `status.readyReplicas / spec.replicas` |
| Current Step | `status.currentStepIndex` |
| Age | derived from `metadata.creationTimestamp` |

Phase badge colors: `Healthy`→green, `Progressing`→blue, `Paused`→yellow, `Degraded`→red, `Unknown`→gray.

Version discovery: find `flagger.app/canaries` or `argoproj.io/rollouts` in `fetchAPIResources()`. Fallbacks: `v1beta1` / `v1alpha1`.

---

## Shared Helpers

Both helpers are inlined per-page (no separate utility file needed at this scope):

```ts
function getAge(item: Record<string, unknown>): string {
  // same as ResourceExplorer extractAge()
}

function safeGet(obj: unknown, ...keys: string[]): unknown {
  // safe nested access
}
```

---

## Error States

- **CRD not installed** (should not happen — page only shows when detected): empty state "No resources found"
- **Version mismatch / API error**: error banner with message
- **Empty namespace**: show all namespaces (namespace='' means all)

---

## Out of Scope

- Edit/apply YAML mutations (read-only per design decision)
- Istio security resources (PeerAuthentication, AuthorizationPolicy)
- Gateway API GRPCRoute, TCPRoute
- Real-time WebSocket updates

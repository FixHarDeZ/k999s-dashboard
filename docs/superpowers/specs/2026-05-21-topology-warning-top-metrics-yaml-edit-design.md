# Design Spec: Topology Warning + Top Rolling Metrics + YAML Edit (v0.3.0)

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Three independent frontend (and one backend) enhancements to the k999s dashboard:

1. **Topology All-Namespace Warning** — modal confirm before loading topology when in All Namespaces mode
2. **Top: Session Rolling Min/Max** — track CPU/MEM min & max per pod/node since page load
3. **YAML View + Edit on Sidebar Pages** — extend `YamlSidePanel` with edit mode; add YAML button to 6 existing pages + implement StatefulSets page from scratch

---

## Feature 1 — Topology All-Namespace Warning

### Problem

When the user is in "All Namespaces" mode (`namespace === ''`) and navigates to Topology, the page silently falls back to `'default'` namespace (line 231 of `Topology.tsx`: `ctx?.namespace || 'default'`). The user gets no feedback that All Namespaces topology may be very large and hard to render.

### Solution

Show a custom themed modal inside `Topology.tsx` when `ctx?.namespace === ''`, before making any fetch. The user must explicitly confirm to proceed.

### Design

**State:** `confirmed: boolean` (starts `false`), `cancelled: boolean` (starts `false`)

**Render logic:**
- If `ctx?.namespace === ''` AND `cancelled === true` → render static placeholder message
- If `ctx?.namespace === ''` AND `confirmed === false` AND `cancelled === false` → render warning modal, skip fetch
- If `ctx?.namespace !== ''` OR `confirmed === true` → render topology normally

**Modal content:**
- Warning icon + title: "All Namespaces — ข้อมูลอาจเยอะมาก"
- Body: อธิบายว่าโหลด topology ทุก namespace อาจทำให้ graph แสดงผลช้าหรือ layout ซับซ้อน
- Two buttons:
  - **"โหลดทั้งหมด"** → sets `confirmed = true` → triggers fetch with `namespace = ''`
  - **"ยกเลิก"** → sets `cancelled = true` → renders a static placeholder "เลือก namespace ก่อนใช้ Topology" (no navigation needed, user can change namespace from TopBar)

**Topology fetch fix:** When `confirmed === true`, pass actual `namespace` (which is `''`) to `fetchTopology`. Remove the `|| 'default'` fallback so All Namespaces actually works.

**Files changed:** `web/src/pages/Topology.tsx` only

---

## Feature 2 — Top: Session Rolling Min/Max

### Problem

The Top page currently shows only the current CPU/MEM snapshot. Users who want to understand peak or baseline usage need to watch manually. k9s shows historical min/max.

### Solution

Track a rolling min/max per pod/node using a `useRef` Map. Updated on every 15s poll tick. Reset when namespace changes.

### Design

**Data structure (ref, not state — no re-render cost):**
```ts
type MinMax = { minCpu: number; maxCpu: number; minMem: number; maxMem: number }
podHistory = useRef<Map<string, MinMax>>(new Map())
nodeHistory = useRef<Map<string, MinMax>>(new Map())
```

**Key:** `${namespace}/${name}` for pods; `name` for nodes

**Parse helpers (already have `parseCPU`):**
```ts
parseMem(s: string): number  // e.g. "128Mi" → 131072 (Ki), "1Gi" → 1048576 (Ki)
formatMem(ki: number): string  // 131072 → "128Mi"
```

**On each poll:** after setting `setPodMetrics`, iterate new data and update `podHistory.current` (update min/max only, never shrink).

**Reset:** in the `load` `useCallback`'s cleanup or in a `useEffect` on `namespace` change — clear both history maps.

**Pod table columns (replace current CPU/Memory columns):**

| Column | Display |
|---|---|
| CPU | `45m` / `20m` / `67m` (current / min / max) in monospace, small |
| Memory | `128Mi` / `96Mi` / `144Mi` |

Shown as: `<current>` on first line, `<min>/<max>` on second line in muted color.

**Node table:** same pattern (no namespace key needed).

**UsageBar:** continues to use current value vs session max for the progress bar.

**Files changed:** `web/src/pages/Top.tsx` only

---

## Feature 3 — YAML View + Edit on Sidebar Pages

### 3a — Extend `YamlSidePanel` with Edit Mode

**New props:**
```ts
editable?: boolean   // default false — adds [Edit] button
```

**Edit mode state (internal):**
```ts
editMode: boolean
editContent: string   // editable YAML text
applying: boolean
applyError: string | null
applySuccess: boolean
```

**Header buttons when `editable=true`:**
- View mode: `[Full]` / `[Clean]` toggle + `[Edit]` button
- Edit mode: `[Apply]` + `[Cancel]` buttons (hide Full/Clean toggle)

**Apply flow:**
1. Parse `editContent` as YAML → convert back to JSON
2. Call `applyResource(json)` (existing API function)
3. On success: show green "Applied" badge 2s → exit edit mode, reload YAML
4. On error: show red error message inline

**Reload after apply:** add internal `reloadKey: number` state (starts 0). After successful apply, increment `reloadKey`. The fetch `useEffect` depends on `reloadKey` so it re-fetches automatically.

**Files changed:** `web/src/components/YamlSidePanel.tsx`

---

### 3b — Add YAML Button to Existing Pages

Each page gets a `yamlTarget` state (`{ name, namespace } | null`) and renders `<YamlSidePanel ... editable />` when set.

**Resource parameters per page:**

| Page | group | version | resource |
|---|---|---|---|
| Pods | `''` | `v1` | `pods` |
| Deployments | `apps` | `v1` | `deployments` |
| Services | `''` | `v1` | `services` |
| ConfigMaps | `''` | `v1` | `configmaps` |
| Secrets | `''` | `v1` | `secrets` |
| Namespaces | `''` | `v1` | `namespaces` (namespace param = `''`) |

**YAML button:** `<FileCode size={13}>` icon button, added to the Actions column of each page's table. Same visual style as existing action buttons (Trash2, RefreshCw, etc.).

**Files changed:** `Pods.tsx`, `Deployments.tsx`, `Services.tsx`, `ConfigMaps.tsx`, `Secrets.tsx`, `Namespaces.tsx`

---

### 3c — StatefulSets Page (full implementation)

#### Go Backend

**`internal/k8s/client.go`** — add `ListStatefulSets`:
```go
type StatefulSetSummary struct {
    Name      string `json:"name"`
    Namespace string `json:"namespace"`
    Ready     string `json:"ready"`   // "2/3"
    Age       string `json:"age"`
}

func (c *Client) ListStatefulSets(ctx context.Context, namespace string) ([]StatefulSetSummary, error)
```

**`internal/api/`** — add handler `handleListStatefulSets` (same pattern as `handleListDeployments`)

**`internal/api/router.go`** — add route:
```go
v1.GET("/statefulsets", r.handleListStatefulSets)
```

#### TypeScript Frontend

**`web/src/lib/types.ts`** — add:
```ts
export interface StatefulSetSummary {
  name: string
  namespace: string
  ready: string
  age: string
}
```

**`web/src/lib/api.ts`** — add:
```ts
export async function fetchStatefulSets(namespace: string): Promise<StatefulSetSummary[]>
```

**`web/src/pages/StatefulSets.tsx`** — new page:
- Same structure as `Deployments.tsx`
- Columns: Name, Namespace, Ready, Age + YAML action button
- `YamlSidePanel` with `group='apps'`, `version='v1'`, `resource='statefulsets'`, `editable`
- No delete/scale actions (scope: view + YAML only for now)

**`web/src/App.tsx`** — wire `StatefulSets` page into existing route (it currently renders a placeholder)

---

## Testing

- Go: add `TestListStatefulSets` in `internal/k8s/` following existing test patterns
- Frontend: no new component tests required (existing YamlSidePanel tests still pass; StatefulSets page is straightforward table)
- TypeScript check: `cd web && npx tsc --noEmit` must pass

---

## Out of Scope

- StatefulSets: scale, delete, rollout-restart actions (add in a later session)
- Topology: auto-retry or progressive loading for large clusters
- Top: persistent min/max across page navigations (cleared on unmount is fine)

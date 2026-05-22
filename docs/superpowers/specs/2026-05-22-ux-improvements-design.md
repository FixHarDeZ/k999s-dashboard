# Design Spec: UX Improvements (Batch E3)

**Date:** 2026-05-22  
**Status:** Approved

---

## Overview

Four targeted UX improvements: Node column in Pods table, warning banners when pods/deployments aren't fully ready, View Logs button in Overview unhealthy pod list, and Age column in Helm page.

---

## 1. Pods Page: Node Column

`PodSummary.node` field already exists — just add a table column.

**`web/src/pages/Pods.tsx`**  
Add column after `ip` column:
```tsx
col.accessor('node', {
  header: 'Node',
  cell: (i) => <span className="text-xs text-gray-500 font-mono truncate max-w-[120px] block">{i.getValue()}</span>,
})
```

No backend changes needed.

---

## 2. Warning Banners (Pods + Deployments)

**Pods page — `web/src/pages/Pods.tsx`**

Count pods where `status !== 'Running'` after loading. Render banner above table if count > 0:

```tsx
{notRunningCount > 0 && (
  <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
    <span>⚠</span>
    <span>{notRunningCount} pod{notRunningCount > 1 ? 's' : ''} not Running</span>
  </div>
)}
```

`notRunningCount` is derived state: `items.filter(p => p.status !== 'Running').length`

**Deployments page — `web/src/pages/Deployments.tsx`**

Count deployments where ready < total. Parse `ready` string ("2/3") to extract numerator/denominator:

```tsx
const notReadyCount = items.filter(d => {
  const [r, t] = d.ready.split('/').map(Number)
  return !isNaN(r) && !isNaN(t) && r < t
}).length
```

Render same-style banner:
```
⚠ N deployment(s) not fully ready
```

No backend changes needed for either.

---

## 3. Overview: View Logs Button

**`web/src/pages/Overview.tsx`**

In the unhealthy pods section, each row already has an AI Diagnose button. Add a "View Logs" (📋) button alongside it.

**Flow:**
1. User clicks 📋 on an unhealthy pod row
2. If pod has > 1 container: show an inline container selector (small dropdown) — same pattern as existing LogViewer usage in Pods.tsx
3. Once container selected (or if only 1 container, auto-select): open `LogViewer` component

**State needed** (use the actual pod item type from Overview.tsx's unhealthy list — likely `PodSummary`):
```typescript
const [logTarget, setLogTarget] = useState<{ pod: PodSummary; container: string } | null>(null)
const [containerSelectTarget, setContainerSelectTarget] = useState<PodSummary | null>(null)
const [availableContainers, setAvailableContainers] = useState<string[]>([])
```

When 📋 is clicked:
```typescript
const handleLogClick = async (pod: PodSummary) => {
  const containers = await fetchPodContainers(pod.namespace, pod.name)
  if (containers.length === 1) {
    setLogTarget({ pod, container: containers[0] })
  } else {
    setAvailableContainers(containers)
    setContainerSelectTarget(pod)
  }
}
```

Container selector: small modal with a list of container names → click to open LogViewer.

`LogViewer` is already used in Pods.tsx — import same component:
```tsx
{logTarget && (
  <LogViewer
    namespace={logTarget.pod.namespace}
    podName={logTarget.pod.name}
    container={logTarget.container}
    onClose={() => setLogTarget(null)}
  />
)}
```

**`fetchPodContainers`** already exists in `web/src/lib/api.ts` — no backend changes needed.

---

## 4. Helm Page: Age Column (Updated column)

`HelmReleaseSummary` has `updated` field (string from helm CLI, e.g. `"2024-01-15 10:30:00 +0700 ICT"`).

**`web/src/pages/Helm.tsx`**  
Add `updated` column:
```tsx
col.accessor('updated', {
  header: 'Updated',
  cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span>,
})
```

No backend changes needed (field already in HelmReleaseSummary).

---

## Testing

### Go

No new backend code — no new Go tests required.

### Frontend

**`web/src/pages/Pods.test.tsx`** — add test:
- Mock pods with 1 Running + 1 CrashLoopBackOff → verify warning banner renders with "1 pod not Running"

**`web/src/pages/Deployments.test.tsx`** — new test file:
- Mock deployments with ready "1/2" → verify "1 deployment not fully ready" banner

---

## Out of Scope

- Warning sounds or notifications
- Auto-dismiss of warning banners
- Log streaming controls (tail size, follow toggle) — these are already in LogViewer

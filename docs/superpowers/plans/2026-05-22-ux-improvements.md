# UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four targeted UX improvements: warning banners on Pods/Deployments pages when pods aren't fully ready, View Logs button next to AI Diagnose in Overview's unhealthy pod list, and Updated column in Helm page.

**Architecture:** All changes are frontend-only (no new Go endpoints). Warning banners derive from existing data already loaded in each page. The Overview log button reuses the existing `LogViewer` component (which handles container selection internally) and the existing `fetchPodContainers` API function. Helm's Updated column uses the already-present `updated` field in `HelmReleaseSummary`.

**Tech Stack:** React, TanStack Table, existing `LogViewer` component, existing `fetchPodContainers` API

---

## File Map

| File | Change |
|---|---|
| `web/src/pages/Pods.tsx` | Warning banner when pods not Running |
| `web/src/pages/Deployments.tsx` | Warning banner when deployments not fully ready |
| `web/src/pages/Overview.tsx` | View Logs button + LogViewer for unhealthy pods |
| `web/src/pages/Helm.tsx` | Add Updated column |

---

## Task 1: Warning Banners (Pods + Deployments)

**Files:**
- Modify: `web/src/pages/Pods.tsx`
- Modify: `web/src/pages/Deployments.tsx`

- [ ] **Step 1: Add warning banner to `web/src/pages/Pods.tsx`**

Read the file first to locate the `return (` statement and the `<div>` opening of the page.

Derive the not-running count from `items` (add this line just before the `return`):
```typescript
const notRunningCount = items.filter(p => p.status !== 'Running').length
```

Add warning banner **between** the header row (`<div className="flex items-center justify-between mb-3">`) and the table div (`<div className="border border-primary-100 rounded-lg...`):

```tsx
{notRunningCount > 0 && (
  <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
    <span>⚠</span>
    <span>{notRunningCount} pod{notRunningCount > 1 ? 's' : ''} not Running</span>
  </div>
)}
```

- [ ] **Step 2: Add warning banner to `web/src/pages/Deployments.tsx`**

Read the file first to locate the return structure.

Derive not-ready count (add just before `return`):
```typescript
const notReadyCount = items.filter(d => {
  const parts = d.ready.split('/')
  const r = parseInt(parts[0], 10)
  const t = parseInt(parts[1], 10)
  return !isNaN(r) && !isNaN(t) && r < t
}).length
```

Add warning banner between the header row and the scale modal (or table if no scale modal visible):

```tsx
{notReadyCount > 0 && (
  <div className="mb-3 flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs text-yellow-800">
    <span>⚠</span>
    <span>{notReadyCount} deployment{notReadyCount > 1 ? 's' : ''} not fully ready</span>
  </div>
)}
```

- [ ] **Step 3: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Run frontend tests**

```bash
cd web && npx vitest run
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Pods.tsx web/src/pages/Deployments.tsx
git commit -m "feat(ux): add not-Running warning banners to Pods and Deployments pages"
```

---

## Task 2: Overview — View Logs Button

**Files:**
- Modify: `web/src/pages/Overview.tsx`

- [ ] **Step 1: Update `web/src/pages/Overview.tsx`**

Read the full file to understand the current structure (especially lines 1-10 for imports and lines 75-100 for the unhealthy pods section).

**Add imports:**
```typescript
import { LogViewer } from '@/components/LogViewer'
import { fetchPodContainers } from '@/lib/api'
```

**Add state** inside `Overview` (after the existing `diagTarget` state):
```typescript
const [logTarget, setLogTarget] = useState<{ pod: typeof unhealthyPods[0]; containers: string[] } | null>(null)
```

Note: `unhealthyPods` is derived from `pods` using `UNHEALTHY_STATUSES`. The type of each element is `PodSummary` (imported from `@/lib/types`). So the state type is:
```typescript
const [logTarget, setLogTarget] = useState<{ pod: PodSummary; containers: string[] } | null>(null)
```

**Add handler** inside `Overview` (after `load` callback):
```typescript
const handleLogClick = async (pod: PodSummary) => {
  const containers = await fetchPodContainers(pod.namespace, pod.name).catch(() => [pod.name])
  setLogTarget({ pod, containers })
}
```

**Add log button** next to the existing AI Diagnose button. The current button block (around lines 88-94) looks like:
```tsx
<button
  onClick={() => setDiagTarget({ namespace: pod.namespace, name: pod.name })}
  style={{ background: '#f5f3ff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: '#7c3aed', cursor: 'pointer', fontWeight: 600 }}
  title="AI Diagnose"
>
  🔍
</button>
```

Change that `<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>` section to add the log button **before** the AI button:

```tsx
<div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
  <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', 'bg-red-50 text-red-600')}>
    {pod.status}
  </span>
  <button
    onClick={() => handleLogClick(pod)}
    style={{ background: '#f0fdf4', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: '#16a34a', cursor: 'pointer', fontWeight: 600 }}
    title="View Logs"
  >
    📋
  </button>
  <button
    onClick={() => setDiagTarget({ namespace: pod.namespace, name: pod.name })}
    style={{ background: '#f5f3ff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: '#7c3aed', cursor: 'pointer', fontWeight: 600 }}
    title="AI Diagnose"
  >
    🔍
  </button>
</div>
```

**Render LogViewer** at the end of the return JSX (after the existing `DiagnosticPanel` block or at the end before the closing `</div>`):

```tsx
{logTarget && (
  <LogViewer
    namespace={logTarget.pod.namespace}
    podName={logTarget.pod.name}
    containers={logTarget.containers}
    onClose={() => setLogTarget(null)}
  />
)}
```

- [ ] **Step 2: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run frontend tests**

```bash
cd web && npx vitest run
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add web/src/pages/Overview.tsx
git commit -m "feat(ux): add View Logs button to Overview unhealthy pod list"
```

---

## Task 3: Helm — Updated Column

**Files:**
- Modify: `web/src/pages/Helm.tsx`

- [ ] **Step 1: Read `web/src/pages/Helm.tsx`**

Read the file to find the columns array and locate where to insert the `updated` column.

- [ ] **Step 2: Add Updated column to `web/src/pages/Helm.tsx`**

In the columns array, add an `updated` column after the `status` column:

```typescript
col.accessor('updated', {
  header: 'Updated',
  cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span>,
}),
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
git add web/src/pages/Helm.tsx
git commit -m "feat(ux): add Updated column to Helm releases page"
```

---

## Task 4: Final Verification

- [ ] **Step 1: Full build**

```bash
make build
```

Expected: `./k999s` binary built successfully.

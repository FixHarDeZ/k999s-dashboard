# Design Spec: Batch A — UI Polish (Confirm Modal, Auto-refresh, Log Tail, Overview AI)

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Four small UI improvements to the k999s dashboard:

1. **ConfirmModal component** — replace native `window.confirm()` with a styled modal across all destructive actions
2. **Auto-refresh interval picker** — configurable polling interval for Pods and Deployments pages (session-only)
3. **Log tail lines** — dropdown to show last N lines in LogViewer (Go backend + frontend)
4. **AI Diagnose on Overview** — 🔍 button per unhealthy pod on the Overview page

---

## Feature 1 — ConfirmModal Component

### Problem

Pods and Deployments currently use `window.confirm()` for destructive actions (delete, restart). The native browser dialog doesn't match the app's design and is jarring UX.

### Solution

Create a shared `ConfirmModal` component and replace every `window.confirm()` call.

### Design

**New file:** `web/src/components/ConfirmModal.tsx`

Props:
```ts
interface ConfirmModalProps {
  title: string        // e.g. "Delete pod nginx-abc"
  message?: string     // optional detail, e.g. "This action cannot be undone."
  confirmLabel?: string  // default "Confirm"
  danger?: boolean       // default true — red confirm button
  onConfirm: () => void
  onCancel: () => void
}
```

Renders: dark backdrop + centered white card with title, optional message, Cancel (neutral) + Confirm (red if `danger`, primary if not) buttons.

**Usage pattern — replace:**
```tsx
// OLD:
if (!confirm(`Delete pod ${pod.name}?`)) return
await deletePod(...)

// NEW:
setConfirmTarget({ action: 'delete', pod })  // sets state
// render: {confirmTarget && <ConfirmModal title={...} onConfirm={handleConfirmedDelete} onCancel={() => setConfirmTarget(null)} />}
```

**Files changed:**
- Create: `web/src/components/ConfirmModal.tsx`
- Modify: `web/src/pages/Pods.tsx` — replace 2 `window.confirm()` calls (delete, restart)
- Modify: `web/src/pages/Deployments.tsx` — replace 2 `window.confirm()` calls (delete, rollout-restart)

**State approach for each page:**

Pods gets `confirmAction: { type: 'delete' | 'restart'; pod: PodSummary } | null`

Deployments gets `confirmAction: { type: 'delete' | 'restart'; deployment: DeploymentSummary } | null`

When user confirms, the actual handler runs. When user cancels, state clears.

---

## Feature 2 — Auto-refresh Interval Picker

### Problem

Pods and Deployments have no configurable refresh rate. Users monitoring active deployments want faster polling; users doing admin work want slower or no polling.

### Solution

Add a small `<select>` dropdown next to the RefreshButton in both pages. State is session-only (not persisted).

### Design

**Options:** Off / 5s / 10s / 15s / 30s  
**Default:** Off (no auto-refresh)  
**Position:** inline with the header controls, left of RefreshButton

**State:**
```tsx
const [refreshInterval, setRefreshInterval] = useState<number | null>(null)
```

**Effect:**
```tsx
useEffect(() => {
  if (!refreshInterval) return
  const id = setInterval(load, refreshInterval * 1000)
  return () => clearInterval(id)
}, [load, refreshInterval])
```

**Dropdown UI:**
```tsx
<select
  value={refreshInterval ?? ''}
  onChange={e => setRefreshInterval(e.target.value ? Number(e.target.value) : null)}
  className="text-xs border border-primary-200 rounded-md px-2 py-1.5 outline-none focus:border-primary-400 text-primary-700"
>
  <option value="">Off</option>
  <option value="5">5s</option>
  <option value="10">10s</option>
  <option value="15">15s</option>
  <option value="30">30s</option>
</select>
```

**Files changed:**
- Modify: `web/src/pages/Pods.tsx`
- Modify: `web/src/pages/Deployments.tsx`

---

## Feature 3 — Log Tail Lines

### Problem

LogViewer streams all pod logs from the beginning. For busy pods with many lines, users want to see only the last N lines (like `kubectl logs --tail=100`).

### Solution

Add `tailLines` parameter through the full stack: Go client → handler → WebSocket URL → LogViewer dropdown.

### Design

**Backend — `internal/k8s/streaming.go`**

Change `StreamLogs` signature to accept `tailLines int64` (0 = all):

```go
func (c *Client) StreamLogs(ctx context.Context, namespace, name, container string, follow, previous bool, tailLines int64) (io.ReadCloser, error) {
    opts := &corev1.PodLogOptions{
        Container: container,
        Follow:    follow,
        Previous:  previous,
    }
    if tailLines > 0 {
        opts.TailLines = &tailLines
    }
    req := c.kube.CoreV1().Pods(namespace).GetLogs(name, opts)
    return req.Stream(ctx)
}
```

**Backend — `internal/api/handlers.go`**

`handlePodLogs` reads `?tail=` query param:

```go
tailStr := c.Query("tail")
var tailLines int64
if tailStr != "" {
    if n, err := strconv.ParseInt(tailStr, 10, 64); err == nil && n > 0 {
        tailLines = n
    }
}
stream, err := r.k8s.StreamLogs(ctx, ns, name, container, follow, previous, tailLines)
```

Add `"strconv"` to imports.

**Frontend — `web/src/lib/api.ts`**

Update `podLogsWsUrl` to accept optional `tail` param:

```ts
export function podLogsWsUrl(namespace: string, name: string, container: string, follow: boolean, previous: boolean, tail?: number): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({ container, follow: String(follow), previous: String(previous) })
  if (tail) params.set('tail', String(tail))
  return `${protocol}//${window.location.host}/ws/pods/${namespace}/${name}/logs?${params}`
}
```

**Frontend — `web/src/components/LogViewer.tsx`**

Add `tail` state + dropdown:
```tsx
const [tail, setTail] = useState<number>(0)  // 0 = all
```

Dropdown options: **All / 100 / 200 / 300 / 400 / 500** — placed next to container selector.

`tail` added to `connect` useCallback dependencies and passed to `podLogsWsUrl`. Reconnects when tail changes.

**Files changed:**
- Modify: `internal/k8s/streaming.go`
- Modify: `internal/api/handlers.go`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/components/LogViewer.tsx`

---

## Feature 4 — AI Diagnose on Overview

### Problem

The Overview page shows unhealthy pods but gives no action. Users must navigate to the Pods page to run AI diagnosis. Adding a 🔍 button directly on the Overview saves navigation.

### Solution

Add `diagTarget` state to Overview and render `DiagnosticPanel` inline.

### Design

**State:**
```tsx
const [diagTarget, setDiagTarget] = useState<{ namespace: string; name: string } | null>(null)
```

**Each unhealthy pod row** — add a small 🔍 button on the right:
```tsx
<button
  onClick={() => setDiagTarget({ namespace: pod.namespace, name: pod.name })}
  className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-700 hover:bg-purple-200 font-medium"
  title="AI Diagnose"
>
  🔍
</button>
```

**At bottom of Overview return JSX:**
```tsx
{diagTarget && (
  <DiagnosticPanel
    namespace={diagTarget.namespace}
    podName={diagTarget.name}
    onClose={() => setDiagTarget(null)}
  />
)}
```

Import `DiagnosticPanel` from `@/components/DiagnosticPanel`.

**Files changed:**
- Modify: `web/src/pages/Overview.tsx`

---

## Testing

- `cd web && npx tsc --noEmit` — must pass
- `cd web && npx vitest run` — all 31 tests must still pass
- `go test ./...` — must pass (StreamLogs signature change propagates to any call sites)

---

## Out of Scope

- Confirm modal for YamlSidePanel Apply (that's an explicit edit action, the Apply button label is sufficient)
- Auto-refresh on pages other than Pods and Deployments
- Log tail persistence across sessions

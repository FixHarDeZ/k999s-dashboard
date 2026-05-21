# Batch A — UI Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ConfirmModal component, auto-refresh interval picker, log tail lines, and AI Diagnose on Overview to the k999s dashboard.

**Architecture:** Four independent frontend (and one small backend) changes. No new pages, no new API endpoints except adding `?tail=` to the existing pod-logs WebSocket. Each task can be committed and reviewed independently.

**Tech Stack:** TypeScript, React, Go (client-go), lucide-react, Tailwind v4

---

## File Map

| File | Change |
|---|---|
| `web/src/components/ConfirmModal.tsx` | **Create** — shared confirm dialog |
| `web/src/pages/Pods.tsx` | Replace `window.confirm()` → ConfirmModal; add auto-refresh picker |
| `web/src/pages/Deployments.tsx` | Replace `window.confirm()` → ConfirmModal; add auto-refresh picker |
| `internal/k8s/streaming.go` | Add `tailLines int64` param to `StreamLogs` |
| `internal/api/handlers.go` | Parse `?tail=` query param in `handlePodLogs`; add `strconv` import |
| `web/src/lib/api.ts` | Add optional `tail` param to `podLogsWsUrl` |
| `web/src/components/LogViewer.tsx` | Add tail state + dropdown |
| `web/src/pages/Overview.tsx` | Add `diagTarget` state + 🔍 button + `DiagnosticPanel` |

---

## Task 1: ConfirmModal Component + Replace window.confirm()

**Files:**
- Create: `web/src/components/ConfirmModal.tsx`
- Modify: `web/src/pages/Pods.tsx`
- Modify: `web/src/pages/Deployments.tsx`

- [ ] **Step 1.1: Create ConfirmModal.tsx**

Create `web/src/components/ConfirmModal.tsx`:

```tsx
import { X } from 'lucide-react'

interface ConfirmModalProps {
  title: string
  message?: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmModal({ title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <>
      <div className="fixed inset-0 bg-black/30 z-50" onClick={onCancel} />
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div className="bg-white rounded-xl shadow-xl p-6 w-80 pointer-events-auto">
          <div className="flex items-start justify-between mb-2">
            <h3 className="font-bold text-sm text-primary-900">{title}</h3>
            <button onClick={onCancel} className="p-0.5 hover:bg-primary-50 rounded ml-2">
              <X size={14} className="text-primary-400" />
            </button>
          </div>
          {message && <p className="text-xs text-gray-500 mb-4">{message}</p>}
          <div className="flex gap-2 justify-end mt-4">
            <button
              onClick={onCancel}
              className="text-xs px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`text-xs px-3 py-1.5 rounded text-white ${danger ? 'bg-red-500 hover:bg-red-600' : 'bg-primary-600 hover:bg-primary-700'}`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 1.2: Update Pods.tsx — replace window.confirm() with ConfirmModal**

In `web/src/pages/Pods.tsx`, make these changes:

**Add import** (after existing imports):
```tsx
import { ConfirmModal } from '@/components/ConfirmModal'
```

**Add state** (after `const [yamlTarget, ...]` on line 78):
```tsx
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'restart'; pod: PodSummary } | null>(null)
```

**Replace** `handleDelete` and `handleRestart` with:
```tsx
  const handleConfirm = async () => {
    if (!confirmAction) return
    const { type, pod } = confirmAction
    setConfirmAction(null)
    if (type === 'delete') {
      await deletePod(pod.namespace, pod.name).catch(console.error)
    } else {
      await restartPod(pod.namespace, pod.name).catch(console.error)
    }
    load()
  }
```

**In the actions column**, replace the two button `onClick` handlers:
```tsx
// OLD:
<button onClick={() => handleRestart(row.original)} ...><RefreshCw size={11} />Restart</button>
// ...
<button onClick={() => handleDelete(row.original)} ...><Trash2 size={11} />Delete</button>

// NEW:
<button onClick={() => setConfirmAction({ type: 'restart', pod: row.original })} className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs flex items-center gap-1"><RefreshCw size={11} />Restart</button>
// ...
<button onClick={() => setConfirmAction({ type: 'delete', pod: row.original })} className="p-1 text-red-500 hover:bg-red-50 rounded text-xs flex items-center gap-1"><Trash2 size={11} />Delete</button>
```

**At the bottom of the returned JSX**, before the final `</div>`, add:
```tsx
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.type === 'delete' ? `Delete pod "${confirmAction.pod.name}"?` : `Restart pod "${confirmAction.pod.name}"?`}
          message="This action cannot be undone."
          confirmLabel={confirmAction.type === 'delete' ? 'Delete' : 'Restart'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
```

- [ ] **Step 1.3: Update Deployments.tsx — replace window.confirm() with ConfirmModal**

In `web/src/pages/Deployments.tsx`, make these changes:

**Add import** (after existing imports at top):
```tsx
import { ConfirmModal } from '@/components/ConfirmModal'
```

**Add state** (after `const [yamlTarget, ...]` on line 29):
```tsx
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'restart'; deployment: DeploymentSummary } | null>(null)
```

**Replace** `handleRolloutRestart` and `handleDelete` with:
```tsx
  const handleConfirm = async () => {
    if (!confirmAction) return
    const { type, deployment } = confirmAction
    setConfirmAction(null)
    if (type === 'delete') {
      await deleteDeployment(deployment.namespace, deployment.name).catch(console.error)
    } else {
      await rolloutRestartDeployment(deployment.namespace, deployment.name).catch(console.error)
    }
    load()
  }
```

**In the actions column**, replace onClick handlers:
```tsx
// OLD:
<button onClick={() => handleRolloutRestart(row.original)} className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs">↻ Restart</button>
// ...
<button onClick={() => handleDelete(row.original)} className="p-1 text-red-500 hover:bg-red-50 rounded text-xs">🗑 Delete</button>

// NEW:
<button onClick={() => setConfirmAction({ type: 'restart', deployment: row.original })} className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs">↻ Restart</button>
// ...
<button onClick={() => setConfirmAction({ type: 'delete', deployment: row.original })} className="p-1 text-red-500 hover:bg-red-50 rounded text-xs">🗑 Delete</button>
```

**At the bottom of the returned JSX**, before the final `</div>`, add:
```tsx
      {confirmAction && (
        <ConfirmModal
          title={confirmAction.type === 'delete' ? `Delete deployment "${confirmAction.deployment.name}"?` : `Rollout restart "${confirmAction.deployment.name}"?`}
          message="This action cannot be undone."
          confirmLabel={confirmAction.type === 'delete' ? 'Delete' : 'Restart'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}
```

- [ ] **Step 1.4: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 1.5: Run frontend tests**

```bash
cd web && npx vitest run 2>&1 | tail -3
```

Expected: all 31 tests PASS

- [ ] **Step 1.6: Commit**

```bash
git add web/src/components/ConfirmModal.tsx web/src/pages/Pods.tsx web/src/pages/Deployments.tsx
git commit -m "feat: replace window.confirm() with ConfirmModal component in Pods and Deployments"
```

---

## Task 2: Auto-refresh Interval Picker (Pods + Deployments)

**Files:**
- Modify: `web/src/pages/Pods.tsx`
- Modify: `web/src/pages/Deployments.tsx`

- [ ] **Step 2.1: Add auto-refresh to Pods.tsx**

In `web/src/pages/Pods.tsx`:

**Add state** (after `confirmAction` state):
```tsx
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null)
```

**Add effect** (after the `useWebSocket` block, before the `handleConfirm` function):
```tsx
  useEffect(() => {
    if (!refreshInterval) return
    const id = setInterval(load, refreshInterval * 1000)
    return () => clearInterval(id)
  }, [load, refreshInterval])
```

**Update the header controls** — replace the existing controls block (lines 189-197):

```tsx
// OLD:
        <div className="flex gap-2 items-center">
          <RefreshButton onRefresh={load} />
          <input
            placeholder="Filter pods..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-48"
          />
        </div>

// NEW:
        <div className="flex gap-2 items-center">
          <select
            value={refreshInterval ?? ''}
            onChange={(e) => setRefreshInterval(e.target.value ? Number(e.target.value) : null)}
            className="text-xs border border-primary-200 rounded-md px-2 py-1.5 outline-none focus:border-primary-400 text-primary-700"
          >
            <option value="">Off</option>
            <option value="5">5s</option>
            <option value="10">10s</option>
            <option value="15">15s</option>
            <option value="30">30s</option>
          </select>
          <RefreshButton onRefresh={load} />
          <input
            placeholder="Filter pods..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-48"
          />
        </div>
```

- [ ] **Step 2.2: Add auto-refresh to Deployments.tsx**

In `web/src/pages/Deployments.tsx`:

**Add state** (after `confirmAction` state from Task 1):
```tsx
  const [refreshInterval, setRefreshInterval] = useState<number | null>(null)
```

**Add effect** (after the existing `useEffect(() => { load() }, [load])` block):
```tsx
  useEffect(() => {
    if (!refreshInterval) return
    const id = setInterval(load, refreshInterval * 1000)
    return () => clearInterval(id)
  }, [load, refreshInterval])
```

**Update the header controls** — replace the existing controls block (lines 112-120):

```tsx
// OLD:
        <div className="flex gap-2">
          <RefreshButton onRefresh={load} />
          <input
            placeholder="Filter..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-40"
          />
        </div>

// NEW:
        <div className="flex gap-2 items-center">
          <select
            value={refreshInterval ?? ''}
            onChange={(e) => setRefreshInterval(e.target.value ? Number(e.target.value) : null)}
            className="text-xs border border-primary-200 rounded-md px-2 py-1.5 outline-none focus:border-primary-400 text-primary-700"
          >
            <option value="">Off</option>
            <option value="5">5s</option>
            <option value="10">10s</option>
            <option value="15">15s</option>
            <option value="30">30s</option>
          </select>
          <RefreshButton onRefresh={load} />
          <input
            placeholder="Filter..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-40"
          />
        </div>
```

- [ ] **Step 2.3: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 2.4: Commit**

```bash
git add web/src/pages/Pods.tsx web/src/pages/Deployments.tsx
git commit -m "feat: add auto-refresh interval picker to Pods and Deployments"
```

---

## Task 3: Log Tail Lines (Go backend + frontend)

**Files:**
- Modify: `internal/k8s/streaming.go`
- Modify: `internal/api/handlers.go`
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/components/LogViewer.tsx`

- [ ] **Step 3.1: Update StreamLogs in streaming.go**

In `internal/k8s/streaming.go`, replace the `StreamLogs` function:

```go
// StreamLogs returns a ReadCloser that streams pod logs. Caller must close it.
// tailLines=0 means stream all logs; tailLines>0 returns last N lines before streaming new ones.
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

- [ ] **Step 3.2: Update handlePodLogs in handlers.go**

In `internal/api/handlers.go`, first add `"strconv"` to the imports block. The current imports start with:
```go
import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
```

Add `"strconv"` to that list.

Then update `handlePodLogs` — find line 291 where `StreamLogs` is called and replace the block from `previous := ...` to the `StreamLogs` call:

```go
	previous := c.Query("previous") == "true"

	var tailLines int64
	if tailStr := c.Query("tail"); tailStr != "" {
		if n, err := strconv.ParseInt(tailStr, 10, 64); err == nil && n > 0 {
			tailLines = n
		}
	}

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	go func() {
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				cancel()
				return
			}
		}
	}()

	stream, err := r.k8s.StreamLogs(ctx, ns, name, container, follow, previous, tailLines)
```

- [ ] **Step 3.3: Verify Go compiles**

```bash
go build ./...
```

Expected: no errors

- [ ] **Step 3.4: Run Go tests**

```bash
go test ./...
```

Expected: all PASS (streaming.go has no unit tests — compiler enforces the signature change)

- [ ] **Step 3.5: Update podLogsWsUrl in api.ts**

In `web/src/lib/api.ts`, replace the `podLogsWsUrl` function:

```ts
export function podLogsWsUrl(namespace: string, name: string, container: string, follow: boolean, previous: boolean, tail?: number): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({ container, follow: String(follow), previous: String(previous) })
  if (tail && tail > 0) params.set('tail', String(tail))
  return `${protocol}//${window.location.host}/ws/pods/${namespace}/${name}/logs?${params}`
}
```

- [ ] **Step 3.6: Update LogViewer.tsx**

In `web/src/components/LogViewer.tsx`:

**Add `tail` state** (after the `previous` state declaration):
```tsx
  const [tail, setTail] = useState<number>(0)
```

**Update the `connect` useCallback** to pass `tail` and add it to the dependency array:
```tsx
  const connect = useCallback(() => {
    wsRef.current?.close()
    setLines([])
    setConnected(false)

    const ws = new WebSocket(podLogsWsUrl(namespace, podName, container, true, previous, tail || undefined))
    wsRef.current = ws

    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onerror = () => setConnected(false)
    ws.onmessage = (e) => {
      setLines((prev) => {
        const next = [...prev, e.data as string]
        return next.length > 5000 ? next.slice(-5000) : next
      })
      if (autoScrollRef.current) {
        bottomRef.current?.scrollIntoView({ behavior: 'instant' })
      }
    }
  }, [namespace, podName, container, previous, tail])
```

**Add tail dropdown** in the header, after the `previous` checkbox label and before the Download button. Find the `<label>` that contains the Previous checkbox and add the select after it:

```tsx
          <select
            value={tail}
            onChange={(e) => setTail(Number(e.target.value))}
            style={{ background: 'rgba(255,255,255,0.1)', color: '#c7d2fe', border: '1px solid rgba(255,255,255,0.2)', borderRadius: 4, padding: '2px 6px', fontSize: 11, cursor: 'pointer' }}
          >
            <option value={0} style={{ color: '#000' }}>All lines</option>
            <option value={100} style={{ color: '#000' }}>Last 100</option>
            <option value={200} style={{ color: '#000' }}>Last 200</option>
            <option value={300} style={{ color: '#000' }}>Last 300</option>
            <option value={400} style={{ color: '#000' }}>Last 400</option>
            <option value={500} style={{ color: '#000' }}>Last 500</option>
          </select>
```

- [ ] **Step 3.7: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3.8: Run all tests**

```bash
go test ./... && cd web && npx vitest run 2>&1 | tail -3
```

Expected: all PASS

- [ ] **Step 3.9: Commit**

```bash
git add internal/k8s/streaming.go internal/api/handlers.go web/src/lib/api.ts web/src/components/LogViewer.tsx
git commit -m "feat(logs): add tail lines option to LogViewer (100/200/300/400/500)"
```

---

## Task 4: AI Diagnose Button on Overview

**Files:**
- Modify: `web/src/pages/Overview.tsx`

- [ ] **Step 4.1: Update Overview.tsx**

In `web/src/pages/Overview.tsx`:

**Add import** at the top:
```tsx
import { DiagnosticPanel } from '@/components/DiagnosticPanel'
```

**Add state** inside `Overview()` after the `nsCount` state:
```tsx
  const [diagTarget, setDiagTarget] = useState<{ namespace: string; name: string } | null>(null)
```

**Update each unhealthy pod row** — find the JSX inside `unhealthyPods.map((pod) => ...)` and update the row div to add the 🔍 button. The current row is:

```tsx
<div key={`${pod.namespace}/${pod.name}`} style={{
  padding: '8px 14px', borderBottom: '1px solid #fee2e2',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}}>
  <div>
    <div style={{ fontSize: 11, fontWeight: 600, color: '#1e1b4b' }}>{pod.name}</div>
    <div style={{ fontSize: 10, color: '#6b7280' }}>{pod.namespace}</div>
  </div>
  <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', 'bg-red-50 text-red-600')}>
    {pod.status}
  </span>
</div>
```

Replace with:
```tsx
<div key={`${pod.namespace}/${pod.name}`} style={{
  padding: '8px 14px', borderBottom: '1px solid #fee2e2',
  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
}}>
  <div>
    <div style={{ fontSize: 11, fontWeight: 600, color: '#1e1b4b' }}>{pod.name}</div>
    <div style={{ fontSize: 10, color: '#6b7280' }}>{pod.namespace}</div>
  </div>
  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
    <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded', 'bg-red-50 text-red-600')}>
      {pod.status}
    </span>
    <button
      onClick={() => setDiagTarget({ namespace: pod.namespace, name: pod.name })}
      style={{ background: '#f5f3ff', border: 'none', borderRadius: 4, padding: '2px 6px', fontSize: 10, color: '#7c3aed', cursor: 'pointer', fontWeight: 600 }}
      title="AI Diagnose"
    >
      🔍
    </button>
  </div>
</div>
```

**At the bottom of the returned JSX** (before the closing `</div>`), add:
```tsx
      {diagTarget && (
        <DiagnosticPanel
          namespace={diagTarget.namespace}
          podName={diagTarget.name}
          onClose={() => setDiagTarget(null)}
        />
      )}
```

- [ ] **Step 4.2: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4.3: Run all tests**

```bash
go test ./... && cd web && npx vitest run 2>&1 | tail -3
```

Expected: all PASS

- [ ] **Step 4.4: Build binary to verify full stack**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard && make build 2>&1 | tail -3
```

Expected: `go build ...` completes, `k999s` binary rebuilt

- [ ] **Step 4.5: Commit**

```bash
git add web/src/pages/Overview.tsx
git commit -m "feat(overview): add AI Diagnose button to unhealthy pods"
```

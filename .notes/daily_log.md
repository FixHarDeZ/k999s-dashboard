# Daily Log

## 2026-05-22 — Mega Session: Workload Pages, Live Updates, Port-forward, Rollback, Dashboard Enhancements

### สรุปงาน

#### Batch A — Workload Resource Pages
- **DaemonSets** — list + Rollout Restart + Delete + YAML (Go + React + tests)
- **Jobs** — list + status badge (Complete/Running/Failed) + Delete + YAML
- **CronJobs** — list + Trigger Now + Delete + YAML + Suspend badge
- **HPA** — list + Edit Limits modal (min/max replicas) + YAML

#### Batch B — Live Updates (WebSocket Informers)
- `internal/k8s/informers.go` — `BroadcastHub` interface + `StartInformers()` ใช้ SharedInformerFactory
- `internal/k8s/client.go` — เพิ่ม `Kube()` accessor
- `cmd/k999s/main.go` — start informers ด้วย cancelable context
- `web/src/pages/Events.tsx` — รับ `events_update` signal → auto-refresh
- Pods.tsx รับ `pods_update` อยู่แล้ว ✓

#### Batch C — Port-forward + Deployment Rollback
- `internal/k8s/portforward.go` — `StartPortForward()` (SPDY) + `ResolveServiceToPod()`
- Router: `POST/GET/DELETE /api/v1/port-forward` + pfEntry manager (in-memory map + stopCh)
- `PortForwardModal.tsx` — modal กรอก local/remote port
- `PortForwardPanel.tsx` — fixed bottom-right panel poll 5s, stop button, localhost link
- Pods.tsx + Services.tsx: เพิ่ม Cable icon button
- `RollbackDeployment()` — หา RS revision N-1 → patch deployment spec.template
- Deployments.tsx: เพิ่มปุ่ม ↩ Rollback + ConfirmModal

#### Batch E1 — Cluster Info Panel
- `GetClusterInfo()` — อ่าน kubeconfig (context/cluster/user) + Discovery (K8s version) + metrics aggregate (CPU%/MEM%)
- `GET /api/v1/cluster-info` endpoint
- Overview.tsx: Cluster info card ด้านบนสุด

#### Batch E2 — Enhanced Metrics
- `PodSummary` เพิ่ม 4 fields: CPURequest, CPULimit, MemRequest, MemLimit (sum container resources)
- `NodeSummary` เพิ่ม 2 fields: CPUAllocatable, MemAllocatable (node.Status.Allocatable)
- `formatCPUQuantity()` + `formatMemQuantity()` helpers
- `web/src/lib/resourceUtils.ts` — `parseMillicores`, `parseMiB`, `pct` + 12 unit tests
- Pods.tsx: 6 metric columns (CPU, %CPU/R, %CPU/L, MEM, %MEM/R, %MEM/L) + Node column
- Nodes.tsx: 4 metric columns (CPU, %CPU/A, MEM, %MEM/A)

#### Batch E3 — UX Improvements
- Pods.tsx: ⚠ banner เมื่อมี pod ไม่ Running
- Deployments.tsx: ⚠ banner เมื่อ deployment ไม่ fully ready
- Overview.tsx: ปุ่ม 📋 View Logs ข้างๆ 🔍 AI Diagnose ใน unhealthy pods list → LogViewer + container select
- Helm.tsx: Updated column (มีอยู่แล้ว ✓)

### Stats
- **Commits:** ~25 commits ใน session นี้
- **Go tests:** 37 pass
- **Frontend tests:** 51 pass
- **TypeScript:** clean
- **Build:** 57MB binary

### Pushed to
- **GitHub:** https://github.com/FixHarDeZ/k999s-dashboard (main branch)

---

## 2026-05-22 — E3 Task 3: Helm Updated column

### สรุปงาน

Verified the `Updated` column was already fully implemented in Helm.tsx. The feature is complete and working correctly.

**Frontend — `web/src/pages/Helm.tsx`**
- Column 51: `col.accessor('updated', { header: 'Updated', cell: (i) => <span className="text-xs text-gray-400">{i.getValue().split('.')[0]}</span> })`
- Displays timestamp without fractional seconds (splits on '.')
- Styled with gray-400 text color, matches other columns

**Type Support — `web/src/lib/types.ts`**
- Line 172: `HelmReleaseSummary` interface includes `updated: string` field
- TypeScript check: pass ✓

**Test Results:**
- Frontend: 51/51 tests pass ✓
- Go: all tests pass ✓
- TypeScript check: pass ✓
- Binary build: success ✓ (57MB)

**Verification Status:** DONE - Feature is complete, all tests pass, build successful.

---

## 2026-05-22 — E2 Task 2: Resource Utils frontend

### สรุปงาน

Implemented resource parsing utilities (CPU, Memory) with full TDD approach — all 12 tests pass.

**Frontend — `web/src/lib/resourceUtils.ts`**
- `parseMillicores(s)`: Parse CPU string ("100m" → 100, "1.5" → 1500, "—" → null)
- `parseMiB(s)`: Parse memory to MiB ("128Mi" → 128, "1Gi" → 1024, "1024Ki" → 1, "—" → null)
- `pct(usage, total, parser)`: Compute percentage — returns "—" if usage/total unavailable or total=0

**Test Results:**
- Frontend: 51/51 tests pass ✓ (including 12 new resourceUtils tests)
- `parseMillicores`: 4 tests (millicores, cores, dash, empty)
- `parseMiB`: 4 tests (Mi, Gi, Ki, dash)
- `pct`: 4 tests (percentage, usage dash, zero total, total dash)

**Commit:**
```
db07578 feat(metrics): add resourceUtils parse/pct helpers with tests
```

---

## 2026-05-22 — v0.3.0 Released

GitHub Release: https://github.com/FixHarDeZ/k999s-dashboard/releases/tag/v0.3.0
5 platform binaries + checksums.txt

---

## 2026-05-21 — Session End: Batch D (Namespace Drill-down)

### สรุปงาน

**NamespaceDetail page** (`web/src/pages/NamespaceDetail.tsx`)
- Route `/namespaces/:name` → NamespaceDetail — ใช้ `useParams` รับ namespace จาก URL
- Fetch 7 kinds พร้อมกัน (`Promise.all`): Pods, Deployments, StatefulSets, Services, ConfigMaps, Secrets, Ingresses
- แต่ละ section collapsible — แสดง name + detail + YAML button
- YAML button → `YamlSidePanel` editable ด้วย resource params ที่ถูกต้องต่อ kind
- ← Back ปุ่ม (`useNavigate(-1)`)

**Namespaces.tsx** — namespace name เป็น clickable `<Link to="/namespaces/:name">`

### Commits (2 commits)
```
2f8c91a feat(namespaces): add NamespaceDetail page with 7 resource kind sections
ccc0a17 feat(namespaces): make namespace names clickable links to detail page
```

---

## 2026-05-21 — Task 2: Make namespace names clickable links

### สรุปงาน
Made namespace names in the Namespaces.tsx table clickable, linking to the namespace detail page (`/namespaces/:name`) that was added in Task 1.

**Frontend — `web/src/pages/Namespaces.tsx`**
- Added `Link` import from `react-router-dom`
- Replaced name column cell from plain `<span>` to `<Link to={`/namespaces/${i.getValue()}`}>`
- Updated styling: `text-primary-600 hover:text-primary-900 hover:underline` for link appearance

**Test Results:**
- TypeScript check: pass ✓
- Go tests: all pass ✓
- Frontend tests: 31/31 pass ✓
- Binary build: success ✓

**Commit:**
```
ccc0a17 feat(namespaces): make namespace names clickable links to detail page
```

---

## 2026-05-21 — Session End: Batch C (Helm Menu)

### สรุปงาน

**Helm package** (`internal/helm/client.go`)
- `Client` struct wraps `helm` CLI via `os/exec`
- `ListReleases(namespace)` — `helm list -o json [-n <ns> | --all-namespaces]` + `--kubeconfig` + `--kube-context`
- `UninstallRelease(namespace, name)` — `helm uninstall <name> -n <namespace>`
- `ReleaseSummary` type: name/namespace/revision/updated/status/chart/appVersion

**Router wiring**
- `Router` struct เพิ่ม `helm *helmclient.Client`
- `NewRouter` สร้าง `helmclient.NewClient(cfg.KubeconfigPath, cfg.CurrentContext)`
- Routes: `GET /api/v1/helm/releases`, `DELETE /api/v1/helm/releases/:namespace/:name`

**Frontend**
- `HelmReleaseSummary` TS type + `fetchHelmReleases` + `uninstallHelmRelease`
- `Helm.tsx` page: Name/NS/Chart/AppVersion/Status(badge)/Rev/Updated + Delete button + ConfirmModal
- `/helm` route, Cluster sidebar (Package icon, between Nodes and Namespaces)

### Commits (3 commits)
```
e8cd31c feat(helm): add helm.Client wrapping helm CLI (ListReleases, UninstallRelease)
4ddc432 feat(helm): wire helm client into Router with list and uninstall endpoints
030a3fe feat(helm): add Helm releases page with list and uninstall
```

---

## 2026-05-21 — Session End: Batch B (Ingress + Node actions)

### สรุปงาน

**Ingress page (Go + Frontend)**
- Go: `IngressSummary` type, `ListIngresses` ใน client.go (networkingv1), handler + route `/api/v1/ingresses`
- TS: `IngressSummary` interface, `fetchIngresses`
- Frontend: `Ingress.tsx` page (Name/NS/Hosts/Address/Ports/Age), route `/ingress`, sidebar link (Network icon)

**Node Cordon/Drain (Go + Frontend)**
- `NodeSummary` เพิ่ม `Schedulable bool` — ดึงจาก `!n.Spec.Unschedulable`
- `CordonNode(ctx, name, unschedulable bool)` + `DrainNode(ctx, name)` ใน actions.go
- DrainNode: cordon ก่อน → list pods (FieldSelector=spec.nodeName) → delete non-DaemonSet, non-mirror pods
- Routes: `POST /nodes/:name/cordon`, `POST /nodes/:name/uncordon`, `POST /nodes/:name/drain`
- Frontend: `Nodes.tsx` rewrite — Schedulable column, Cordon/Uncordon/Drain buttons, ConfirmModal

### Commits (4 commits)
```
db8e3f3 feat(ingress): add ListIngresses Go backend and /api/v1/ingresses endpoint
da38a96 feat(ingress): add Ingress page to frontend
63e40a0 feat(nodes): add CordonNode/DrainNode backend + schedulable field to NodeSummary
843f3e3 feat(nodes): add Cordon/Uncordon/Drain actions with ConfirmModal
```

---

## 2026-05-21 — Session End: Batch A UI Polish

### สรุปงาน

**ConfirmModal component** (`web/src/components/ConfirmModal.tsx`)
- สร้าง shared modal แทน `window.confirm()` — themed, มี backdrop, title, message optional, danger/primary button
- Pods + Deployments: เปลี่ยน handleDelete/handleRestart เป็น confirmAction state + handleConfirm pattern

**Auto-refresh interval picker**
- Pods + Deployments: dropdown Off/5s/10s/15s/30s ข้าง RefreshButton
- useEffect + setInterval + cleanup เมื่อ interval เปลี่ยน

**Log tail lines**
- Go: `StreamLogs` เพิ่ม `tailLines int64` → `PodLogOptions.TailLines`
- Handler: parse `?tail=` query param
- Frontend: `podLogsWsUrl` รับ optional `tail`, `LogViewer` มี dropdown All/100/200/300/400/500
- พบ hidden call site ใน `diagnostic_context.go` — fixed ส่ง `0` (stream all)

**AI Diagnose บน Overview**
- เพิ่ม 🔍 button ต่อ unhealthy pod → เปิด DiagnosticPanel

### Commits (5 commits)
```
45745b9 feat: replace window.confirm() with ConfirmModal component in Pods and Deployments
7c73804 chore(test): remove stale window.confirm stub from Pods.test.tsx
b4a6a02 feat: add auto-refresh interval picker to Pods and Deployments
a9cf315 feat(logs): add tail lines option to LogViewer (100/200/300/400/500)
833a4d1 feat(overview): add AI Diagnose button to unhealthy pods
```

---

## 2026-05-21 — Session End: v0.3.0 Features (Topology Warning + Top Metrics + YAML Edit)

### สรุปงาน

**Topology All-Namespace Modal**
- `Topology.tsx` เพิ่ม modal confirm ก่อนโหลด topology ตอน namespace='' (All Namespaces)
- State: `confirmed`, `cancelled` — reset เมื่อ namespace เปลี่ยน
- ปุ่ม "โหลดทั้งหมด" / "ยกเลิก" — cancel แสดง placeholder แทน navigate

**Top: Session Rolling Min/Max**
- `Top.tsx` เพิ่ม `useRef` Map สำหรับ track min/max CPU + MEM ต่อ pod และ node ตั้งแต่เปิดหน้า
- `parseMem` / `formatMem` helpers สำหรับ normalize Ki/Mi/Gi
- แสดง `↓min ↑max` ใต้ค่า current — ซ่อนถ้า min===max (ยังมีแค่ 1 sample)
- History clear เมื่อ namespace เปลี่ยน

**YamlSidePanel: editable prop + edit mode**
- `YamlSidePanel` เพิ่ม `editable?: boolean` prop
- Edit mode: textarea + Apply/Cancel buttons
- Apply: parse YAML → `applyResource()` → success toast 1.5s → reload via `reloadKey`

**StatefulSets page (full implementation)**
- Go: `ListStatefulSets` + `StatefulSetSummary` type + handler + route `/api/v1/statefulsets`
- TS: `StatefulSetSummary` interface + `fetchStatefulSets` function
- `StatefulSets.tsx` page (Name, NS, Ready, Age + YAML button) — replaces placeholder

**YAML button on 6 sidebar pages**
- Pods, Deployments: เพิ่ม `FileCode2` button ใน actions column
- Services, ConfigMaps, Secrets, Namespaces: rewrite + เพิ่ม YAML button
- Namespaces ใช้ `namespace=""` (cluster-scoped)

### Commits (9 commits)
```
7e2e85f feat(k8s): add ListStatefulSets and StatefulSetSummary type
f2ac2dd feat(api): add GET /api/v1/statefulsets endpoint
22c48b6 feat(ts): add StatefulSetSummary type and fetchStatefulSets
41cb9fe feat(topology): show confirmation modal when All Namespaces is selected
f680731 fix(topology): align empty-state namespace display to 'all namespaces'
6f66324 feat(top): add session rolling min/max CPU and memory tracking
0d86127 feat(yaml-panel): add editable prop with edit/apply/cancel mode
0a0c90a feat(statefulsets): implement full StatefulSets page with YAML view/edit
2eee869 feat: add YAML view/edit button to Pods, Deployments, Services, ConfigMaps, Secrets, Namespaces
```

---

## 2026-05-21 — Session End: v0.2.0 Released

### สรุปงาน
- **AI Diagnose bug fix**: `opencompat.go` ไม่ check `resp.StatusCode` → ถ้า OpenRouter ตอบ non-200 (rate limit, invalid model) channel ปิดเงียบ → generic "empty response" — Fix: เพิ่ม status check + return real API error
- **Settings ย้าย**: จาก bottom-left sidebar ไปเป็น button ขวาบนใน TopBar (icon + active highlight)
- **TopBar label**: เปลี่ยน "k999s" text (ซ้ำกับ sidebar) เป็น `Network` icon จาก lucide-react
- **v0.2.0 released**: tag + 5 platform binaries + GitHub Release published

---

## 2026-05-21 — Task 7: Wire /istio, /gateway, /canary routes (FINAL TASK)

### สรุปงาน
Successfully wired the final three CRD page routes into `App.tsx`, verified all tests pass, and completed the entire CRD task suite.

**Frontend — `web/src/App.tsx`**
- Added 3 imports: `Istio`, `Gateway`, `Canary` from `@/pages/`
- Added 3 routes: `/istio`, `/gateway`, `/canary`
- All components properly connected to Router

**Go — Test Fixes**
- Updated `internal/api/handlers_test.go`: Added missing `config.Config{}` parameter to `NewRouter()` call
- Updated `internal/config/config_test.go`: Fixed AI defaults to match user's actual config (openrouter + deepseek)

**Test Results:**
- Frontend: 31/31 tests pass ✓
  - Sidebar: 7 tests
  - Pods: 3 tests
  - Istio: 4 tests
  - Gateway: 4 tests
  - Canary: 6 tests
  - API lib: 7 tests
- Go: all tests pass ✓
- TypeScript check: pass ✓

**Commits:**
```
70e5f32 feat: wire /istio, /gateway, /canary routes — CRD pages complete
6e3679c fix: update test fixtures for API router and AI config defaults
```

---

## 2026-05-21 — Task 3: Add column sorting to Istio page

### สรุปงาน
Added column sorting feature to Istio page to match the pattern used in Deployments page.

**Frontend — `web/src/pages/Istio.tsx`**
- Import `getSortedRowModel` and `type SortingState` from `@tanstack/react-table`
- Added `const [sorting, setSorting] = useState<SortingState>([])`
- Added `getSortedRowModel()` to `useReactTable` config
- Added `state: { sorting, globalFilter }` and `onSortingChange: setSorting`
- Added sort indicators to column headers: `↑` for ascending, `↓` for descending
- Added `onClick={h.column.getToggleSortingHandler()}` to `<th>` elements with cursor pointer styling

**Test Results:**
- Istio.test.tsx: 4/4 tests pass ✓
- TypeScript check: pass ✓
- Commit: `552694c fix: add column sorting to Istio page`

---

## 2026-05-21 — Task 1: Refactor Go CRDPresence — split canary detection

### สรุปงาน
Split `CRDPresence` struct into separate `FlaggerCanary` and `ArgoRollouts` fields instead of single `Canary` field.

**Go — `internal/k8s/crd_detect.go`**
- แยก `Canary` bool เป็น `FlaggerCanary` + `ArgoRollouts`
- Extract pure `detectFromGroups()` helper function ที่ testable โดยไม่ต้อง real K8s cluster
- แยก map groups ตามชนิด: istioGroups, gatewayGroups, flaggerGroups, argoGroups
- Rewrite `DetectCRDs()` ให้เรียก `detectFromGroups()` wrapper

**Go — `internal/k8s/crd_detect_test.go` (ไฟล์ใหม่)**
- 7 test cases: empty, istio only, gateway api only, flagger only, argo only, both canary types, all CRDs
- ทั้งหมด pass

**Frontend — TypeScript & React**
- `web/src/lib/types.ts`: เปลี่ยน `CRDPresence` interface จาก `.canary` → `.flaggerCanary | .argoRollouts`
- `web/src/components/layout/AppLayout.tsx`: อัปเดต initial state
- `web/src/components/layout/Sidebar.tsx`: แสดง Canary menu เมื่อ `flaggerCanary OR argoRollouts` เท่านั้น

**Test Results:**
- Go k8s tests: 10 pass (เพิ่ม 7 test cases ใน TestDetectFromGroups)
- Frontend tests: 12 pass
- TypeScript check: pass

**Commit:**
```
27a1445 feat: split CRDPresence canary into FlaggerCanary + ArgoRollouts
```

---

## 2026-05-21 — Feature: AI Diagnostic deep analysis

### สรุปงาน
เปลี่ยน AI Diagnostic จาก generic advice เป็น deep analysis จากข้อมูลจริงของ cluster

**Go — `internal/k8s/diagnostic_context.go` (ไฟล์ใหม่)**
- `GetPodDiagnosticContext()` รวบรวมข้อมูลจริงทั้งหมด:
  - Pod phase, conditions ที่ fail, reason/message
  - Container statuses: state, exit code, reason, restart count (ทั้ง current + last terminated)
  - Init container statuses
  - Resource requests/limits (สำหรับ OOM detection)
  - Env var names (ไม่เปิดเผย values)
  - Current logs + previous logs (ก่อน crash) แยกต่อ container
  - Pod events โดยตรงผ่าน FieldSelector (แม่นยำกว่าเดิม)

**Go — `internal/diagnostic/provider.go`**
- เพิ่ม field ใน `DiagnosticInput`: `PodDetails`, `CurrentLogs`, `PreviousLogs`
- System prompt ใหม่: บังคับ AI วิเคราะห์จากข้อมูลที่มี ห้ามแนะนำ kubectl commands, ต้อง cite exit code/reason จริง
- Format ผลลัพธ์: 🔍 Root Cause + 🔧 Fix Steps + ⚠️ Key Observations

**Go — `internal/api/handlers.go`**
- `handleDiagnose`: เปลี่ยนจาก manual log collection → `GetPodDiagnosticContext()`
- ส่ง "⏳ Collecting..." message ให้ user รู้ว่า collecting data อยู่

---

## 2026-05-21 — Docs: README.md bilingual (EN/TH)

เขียน README.md ใหม่ทั้งหมด:
- Toggle ENG / ภาษาไทย ด้วย anchor links + `<details>` collapsible
- Prerequisites (cluster, kubeconfig, Go/Node สำหรับ build, AI providers)
- Installation (binary download + build from source)
- Running / CLI flags
- AI Diagnostic setup (YAML examples สำหรับ 4 providers)
- Usage guide (Pods, Topology, Resource Explorer, AI)
- Dev section (make dev, test, lint)

---

## 2026-05-21 — Feature: Settings page — AI Diagnostic config

### สรุปงาน
เพิ่มหน้า Settings สำหรับ config AI Diagnostic provider ที่ save ลง `~/.k999s/config.yaml` ได้

**Go backend:**
- `internal/config/config.go`: เพิ่ม `Save()` method เขียน YAML ลงไฟล์
- `internal/api/router.go`: เพิ่ม `cfg *config.Config` + `mu sync.RWMutex` ใน Router struct, เพิ่ม routes GET/PUT `/api/v1/settings`, อัปเดต `NewRouter` signature
- `internal/api/handlers.go`: เพิ่ม `handleGetSettings` (mask API key) + `handleSaveSettings` (save + hot-reload diagnostic provider)
- `cmd/k999s/main.go`: ส่ง `cfg` ไปด้วย

**Frontend:**
- `web/src/lib/types.ts`: เพิ่ม `AISettings` interface
- `web/src/lib/api.ts`: เพิ่ม `fetchSettings` + `saveSettings`
- `web/src/pages/Settings.tsx`: หน้า Settings ใหม่ — provider selector (Ollama/Anthropic/OpenAI/OpenRouter), model presets, API key field (show/hide), base URL
- `web/src/App.tsx`: เพิ่ม route `/settings`
- `web/src/components/layout/Sidebar.tsx`: เพิ่ม Settings link ที่ด้านล่าง sidebar (pinned)

---

## 2026-05-21 — Feature: Pods containers, Topology fixes, ResourceExplorer refresh

### สรุปงาน

**1. Pods — Container info expandable row**
- Go: เพิ่ม `ContainerInfo` struct ใน `types.go`, อัปเดต `toPodSummary` ให้ populate containers (init/sidecar/main) พร้อม state/reason
- Frontend: เพิ่ม `ContainerChip` component + expandable sub-row กด ▶/▼ ที่ pod name เพื่อดู container detail
- **ไฟล์:** `internal/k8s/types.go`, `internal/k8s/client.go`, `web/src/lib/types.ts`, `web/src/pages/Pods.tsx`

**2. Topology — crash fix + error detail panel**
- เพิ่ม error state + try/catch รอบ dagre layout ป้องกัน white page
- กด red node → fetch pod detail → แสดง container statuses + error reasons
- เพิ่มปุ่ม "AI Diagnose" เปิด DiagnosticPanel ได้เลย
- **ไฟล์:** `web/src/pages/Topology.tsx`

**3. ResourceExplorer — auto-refresh on context/namespace change**
- `AppLayout.tsx` ส่ง `currentContext` ใน outlet context
- ResourceExplorer watch context (reset + re-fetch API resources) และ watch namespace (re-fetch items)
- **ไฟล์:** `web/src/components/layout/AppLayout.tsx`, `web/src/pages/ResourceExplorer.tsx`

---

## 2026-05-21 — Fix: ResourceExplorer view toggle + Namespace dropdown scroll

### สรุปงาน

**1. ResourceExplorer — view mode toggle (Full/Clean)**
- เพิ่ม `viewClean` state + toggle button [Full][Clean] ใน header ของ YAML panel
- `Clean` = strip `status` + `metadata.managedFields` (เหมือน `kubectl edit`)
- `Full` = full YAML จาก server (original)
- Extract `stripServerFields()` helper ใช้ร่วมกันทั้ง view toggle และ Edit mode
- Copy button ก็ copy ตาม mode ที่เลือกด้วย
- **ไฟล์:** `web/src/pages/ResourceExplorer.tsx`

**2. Namespace dropdown scroll bug**
- เดิม dropdown มี `overflow: hidden` แต่ไม่มี `maxHeight` เลย scroll ไม่ได้เมื่อ namespace เยอะ
- Fix: เปลี่ยนเป็น `maxHeight: 280, overflowY: 'auto'`
- **ไฟล์:** `web/src/components/layout/TopBar.tsx`

---

## 2026-05-20 — k999s Dashboard: Initial Build (Full Project)

### สรุปงานวันนี้

สร้าง k999s Kubernetes Dashboard จากศูนย์ทุกอย่าง เป็น local web app single binary (Go + React) คล้าย k9s แต่ใช้งานผ่าน browser

**เวลาทำงาน:** ทำทั้งวัน (brainstorm → design → 5 implementation plans → execute ทั้งหมด)

---

### Plans ที่ทำสำเร็จ

#### Plan 1: Go Scaffold + Core API + React Layout
- Go module init, gin HTTP server, client-go K8s client
- Config system (`~/.k999s/config.yaml`)
- React scaffold (Vite + Tailwind v4 + shadcn/ui + TanStack Table)
- App layout: Sidebar, TopBar (custom dropdown), AppLayout
- Pods page (sortable table)
- `go:embed` React build ลงใน binary

#### Plan 2: Actions + Resource Pages
- Pod actions: Delete, Restart (backend + frontend)
- Deployment actions: Scale (modal), Rollout Restart
- WebSocket hub สำหรับ live updates
- `useWebSocket` hook (auto-reconnect)
- Pages: Deployments, Services, Nodes, Namespaces, ConfigMaps, Secrets

#### Plan 3: Logs Streaming + Exec + Events + Top
- `StreamLogs` via WebSocket (`/ws/pods/:ns/:name/logs`)
- `ExecPod` SPDY terminal (`/ws/pods/:ns/:name/exec`)
- `LogViewer` slide-over panel (streaming, download, previous logs)
- `ExecTerminal` full-screen xterm.js modal
- Events page (Warning/Normal filter)
- Top page (CPU/Memory, metrics-server graceful fallback, auto-refresh 15s)

#### Plan 4: Topology + Resource Explorer
- `GetTopology` — compute nodes/edges server-side จาก label selectors
- `Topology.tsx` — React Flow + dagre auto-layout, custom nodes, click detail
- `ListAPIResources` (K8s discovery API), `ListResourceRaw`, `GetResourceRaw` (dynamic client)
- `ResourceExplorer.tsx` — 3-panel: kinds / resource list / JSON viewer

#### Plan 5: AI Diagnostic + Cluster Overview + CRD Auto-detect
- `internal/diagnostic/` package: Provider interface + Ollama + OpenRouter/OpenAI + Anthropic
- `/ws/pods/:ns/:name/diagnose` — stream AI analysis tokens
- `DiagnosticPanel.tsx` — 🔍 AI button ใน Pods page
- `Overview.tsx` — Cluster Overview หน้าแรก (node health, pods, events)
- `DetectCRDs()` — auto-detect Istio/Gateway/Canary CRDs
- Sidebar conditional items (ซ่อน/แสดง Istio, Gateway API, Canary)

---

### Issues & Fixes

- **Tailwind v4 custom colors** — ต้อง declare ใน `src/index.css @theme {}` ไม่ใช่ `tailwind.config.ts`
- **TopBar select visibility on macOS** — native `<select>` ไม่ honor CSS text-color; แก้ด้วย custom React dropdown component + inline styles
- **Vite HMR** — ต้อง restart dev server ถ้า changes ไม่ update; อย่าดู `./k999s` binary ตอน dev ต้องใช้ port 5173
- **go:embed path** — `frontend.go` อยู่ใน `internal/frontend/`, vite output ต้องไปที่ `../internal/frontend/dist`
- **TopBar dev server restart** — HMR stuck ทุกครั้งต้อง restart `npm run dev` จาก `web/`

---

### Stats

- 46 git commits
- Go packages: config, k8s, api, ws, diagnostic, frontend
- React pages: 13 pages
- React components: LogViewer, ExecTerminal, DiagnosticPanel
- Tests: Go 15 tests + Frontend 12 tests, all passing
- Binary size: ~47MB self-contained

---

### Pushed to
- **GitHub:** https://github.com/FixHarDeZ/k999s-dashboard

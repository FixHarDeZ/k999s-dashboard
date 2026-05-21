# Daily Log

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

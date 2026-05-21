# Daily Log

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

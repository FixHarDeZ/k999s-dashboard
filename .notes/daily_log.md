# Daily Log

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

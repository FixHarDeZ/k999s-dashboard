# k999s Dashboard — Design Spec

**Date:** 2026-05-20  
**Status:** Approved

---

## Overview

k999s เป็น Kubernetes dashboard ที่รันเป็น local web app แบบ single binary คล้าย k9s แต่ใช้งานง่ายกว่าผ่าน browser มี UI สว่าง modern และมี AI diagnostic สำหรับ pod ที่มีปัญหา

### Goals
- ใช้งานง่ายกว่า k9s — ทุก action มีปุ่มชัดเจน ไม่ต้องจำ keybinding
- อ่าน kubeconfig และ switch context ได้
- เห็นความเชื่อมโยงของ resource ผ่าน topology diagram
- รองรับทุก resource kind รวมถึง CRDs, Istio, Gateway API, Canary
- AI วิเคราะห์ log pod ที่มีปัญหา

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Go — single binary, command: `k999s` |
| HTTP Server | `gin` (github.com/gin-gonic/gin) |
| WebSocket | `gorilla/websocket` |
| K8s Client | `client-go` (k8s.io/client-go) |
| Frontend | React 18 + TypeScript + Vite |
| UI Components | shadcn/ui + TanStack Table v8 |
| Topology | React Flow v11 + dagre auto-layout |
| Terminal | xterm.js (pod exec/shell) |
| Styling | Tailwind CSS v3 — Indigo/Professional theme |
| Binary Embed | `go:embed web/dist` |
| AI Diagnostic | Configurable provider (see AI section) |

---

## Architecture

```
k999s (Go binary)
├── cmd/k999s/main.go          ← entrypoint: parse flags, start server, open browser
├── internal/
│   ├── k8s/                   ← client-go wrappers (list, watch, exec, port-forward)
│   ├── api/                   ← gin HTTP handlers (REST + WebSocket)
│   ├── ws/                    ← WebSocket hub (broadcast pod status, events, logs)
│   ├── diagnostic/            ← AI provider abstraction + log collection
│   └── config/                ← kubeconfig + app config manager
└── web/                       ← React frontend (built to web/dist, embedded at build time)
    ├── src/
    │   ├── components/        ← shared UI components
    │   ├── pages/             ← page components
    │   ├── hooks/             ← useWebSocket, useK8sResource, etc.
    │   └── lib/               ← API client, types
    └── dist/                  ← compiled output (go:embed target)
```

### Startup Flow
1. `k999s` → parse `~/.kube/config`
2. Start HTTP server on `:8080` (configurable via `--port`)
3. Open browser automatically (`open http://localhost:8080`)
4. Frontend loads, WebSocket connects
5. Begin watching K8s resources via `client-go` informers

### Data Flow
- **REST API** — initial page load, CRUD actions
- **WebSocket** — live pod/node status updates, K8s events stream
- **WebSocket** — log streaming (tail -f equivalent)
- **WebSocket** — exec/shell sessions (bidirectional, xterm.js)

### Binary Size Estimate
- Go binary: ~15–20 MB
- Embedded React build: ~3–5 MB
- Total: ~20 MB self-contained executable

---

## Pages & Sidebar Navigation

```
Overview
  ├── 🏠 Cluster Overview
  ├── 🗺 Topology
  ├── 📊 Top (CPU/Memory)
  └── ⚡ Events

Workloads
  ├── 📦 Pods
  ├── 🚀 Deployments
  ├── 🗄 StatefulSets
  ├── 👾 DaemonSets
  ├── ⏱ Jobs
  ├── 🕐 CronJobs
  └── 📈 HPA

Network
  ├── 🌐 Services
  ├── 🔀 Ingresses
  ├── 🚪 Gateway API          ← แสดงเมื่อ detect gateway.networking.k8s.io CRD
  ├── 🔷 Istio                ← แสดงเมื่อ detect networking.istio.io CRD
  └── 🐦 Canary               ← แสดงเมื่อ detect flagger.app หรือ argoproj.io CRD

Config & Storage
  ├── ⚙️ ConfigMaps
  ├── 🔐 Secrets
  ├── 💾 PersistentVolumes
  ├── 📁 PersistentVolumeClaims
  └── 🗃 StorageClasses

Cluster
  ├── 🖥 Nodes
  ├── 📁 Namespaces
  ├── 🔒 RBAC
  ├── 📋 Logs
  └── 🔭 Resource Explorer
```

Sidebar items ที่ marked ★ จะ auto-hide ถ้า cluster ไม่มี CRD นั้น

---

## Page Descriptions

### 🏠 Cluster Overview
- Node health summary (Ready / NotReady / total)
- Unhealthy pods list — highlight สีแดง + AI Diagnose badge อัตโนมัติ
- Namespace breakdown (resource count per namespace)
- Recent events feed (Warning priority)
- Resource quota usage bars

### 📊 Top Page
- CPU + Memory usage per pod (sortable)
- CPU + Memory usage per node (sortable)
- Visual usage bars (color-coded: green/yellow/red)
- Auto-refresh ทุก 15 วินาที
- ต้องมี `metrics-server` ใน cluster — แสดง warning ถ้าไม่มี

### ⚡ Events Page
- Cluster-wide K8s events feed (real-time via WebSocket)
- Filter: Warning / Normal
- Filter by namespace, involved object
- Highlight Warning events สีเหลือง/แดง
- Click event → link ไปยัง resource ที่เกี่ยวข้อง

### 📋 Logs Page
- เลือก pod + container (dropdown)
- Multi-pod log aggregation (เลือกหลาย pod ได้)
- Real-time streaming via WebSocket
- Filter by keyword (highlight matches)
- Toggle timestamps
- View previous container logs (`--previous`)
- Download logs เป็น `.txt`

### 🗺 Namespace Topology (React Flow)
- Auto-build graph จาก label selectors — ไม่ต้อง config เพิ่ม
- Nodes: Ingress → Service → Deployment/StatefulSet → Pods
- แสดง ConfigMap/Secret ที่ mounted เข้า Pod (dashed edge)
- แสดง HPA → Deployment edge
- Node สีตาม health (เขียว/แดง/เหลือง)
- Pod ที่ unhealthy มี 🔍 AI badge
- Drag ย้ายตำแหน่งได้, Zoom/pan, Auto-layout ด้วย dagre
- Click node → Detail side panel (YAML, Events, Actions)

### 🔭 Resource Explorer
- Left panel: list ทุก kind ที่มีใน namespace แบ่งตาม API group
- ได้มาจาก `kubectl api-resources --namespaced=true` dynamically
- แสดง count ต่อ kind
- รวม CRDs ทุกตัวโดยอัตโนมัติ
- Click kind → Right panel แสดง resource list
- ต่อ resource: ปุ่ม **Get** (YAML with syntax highlight) + **Describe** (text output)
- Copy button สำหรับ output

---

## Actions Per Resource Type

### 📦 Pods
| Action | Description |
|---|---|
| Logs | Open log viewer (streaming, filter, download) |
| Exec / Shell | xterm.js terminal in browser, เลือก container ได้ |
| Restart | Delete pod (let controller recreate) |
| Port Forward | Modal กรอก local:remote port, background process |
| Top | CPU/Memory ของ pod นั้น |
| View YAML | Syntax-highlighted YAML viewer |
| AI Diagnose | ส่ง logs + events → AI → streaming analysis |
| Delete | Confirmation dialog ก่อน delete |

### 🚀 Deployments / 🗄 StatefulSets
| Action | Description |
|---|---|
| Scale Replicas | Slider หรือ number input |
| Rollout Restart | `kubectl rollout restart` equivalent |
| Rollback | เลือก revision จาก history dropdown |
| Rollout History | ดู revision list + status |
| Edit Image | กรอก image tag ใหม่ได้ |
| View PVCs | (StatefulSet only) ดู PVC ที่ผูกอยู่ |
| View YAML | — |
| Delete | Confirmation dialog |

### 📈 HPA
- ดู current / min / max replicas
- Edit min/max replicas
- ดู CPU target %
- Link ไปยัง target resource
- View YAML / Delete

### ⏱ Jobs / 🕐 CronJobs
- Trigger job manually (CronJob → create Job)
- Suspend / Resume (CronJob)
- ดู job history + status
- View pod logs ของ job
- View YAML / Delete

### 🐦 Canary (Flagger / Argo Rollouts)
- ดู traffic weight (canary vs stable %)
- Promote (advance canary)
- Pause / Resume
- Abort (rollback)
- ดู Analysis Runs
- View YAML

### 👾 DaemonSets
- Rollout Restart
- Edit Image
- Rollout History
- View YAML / Delete

### 🖥 Nodes
- Cordon / Uncordon
- Drain (confirmation + options: `--ignore-daemonsets`, `--delete-emptydir-data`)
- Edit Labels / Taints
- Top (CPU/Memory)
- Describe

### 📁 Namespaces
- Browse resources ใน namespace (ไปที่ Resource Explorer filter namespace นั้น)
- ดู Resource Quota + LimitRange
- Edit Labels
- Create / Delete

### 🔐 Secrets
- View (masked by default)
- Decode base64 (ต้อง confirm ก่อนแสดง)
- Copy value
- Edit
- View YAML / Delete

### 🌐 Services / Ingress
- Port Forward
- View Endpoints
- Edit / View YAML / Delete

### 🚪 Gateway API / 🔷 Istio
- View / Edit / Delete
- View YAML

---

## Global Features

| Feature | Detail |
|---|---|
| **Ctrl+K** | Global search — ค้น resource ทุกประเภทใน cluster |
| **Context Switcher** | Dropdown ใน top bar, อ่านจาก `~/.kube/config` |
| **Namespace Filter** | Dropdown ใน top bar, กรอง all namespaces ได้ |
| **Live Auto-refresh** | WebSocket push — ไม่มี polling delay |
| **YAML Viewer** | Syntax highlight, copy, diff mode สำหรับ edit |
| **Label Selector Filter** | กรองด้วย label `app=xxx, env=prod` |
| **Keyboard Shortcuts** | `r` refresh, `d` delete, `e` edit, `l` logs, `x` exec |

---

## AI Diagnostic System

### Flow
1. ตรวจจับ pod ที่ unhealthy (CrashLoopBackOff, OOMKilled, Error, Pending นานเกิน threshold)
2. Collect: pod logs (last 200 lines), pod events, pod describe output
3. ส่งไปยัง AI provider ที่ configured
4. Stream response กลับมาแสดงใน diagnostic panel
5. Panel แสดง: root cause analysis + suggested actions (พร้อมปุ่ม execute action ถ้าทำได้)

### Provider Configuration (`~/.k999s/config.yaml`)
```yaml
ai:
  provider: ollama            # default — ฟรี ไม่ต้อง API key
  model: llama3.2             # default ollama model
  base_url: ""                # optional override

  # Upgrade options (uncomment เพื่อใช้):
  # provider: openrouter
  # api_key: sk-or-xxxxxxxx
  # model: anthropic/claude-haiku-4-5   # ~$0.001/request
```

| Provider | Default? | API Key | ราคาต่อ diagnostic | Notes |
|---|---|---|---|---|
| `ollama` | ✅ **default** | ไม่ต้อง | ฟรี | รัน local, ต้องติดตั้ง Ollama + model |
| `openrouter` | — | ต้องมี | ~$0.001 (haiku) / ฟรี (llama) | Key เดียว access ได้ทุก model รวม Claude |
| `anthropic` | — | ต้องมี | ~$0.001 (haiku) | Anthropic API key (แยกจาก claude.ai subscription) |
| `openai` | — | ต้องมี | ~$0.002 (gpt-4o-mini) | — |

**Default behavior:**
- ติดตั้งครั้งแรก → ใช้ Ollama อัตโนมัติ ถ้า Ollama รันอยู่
- ถ้าไม่มี Ollama → แสดง setup guide ใน diagnostic panel พร้อมลิงก์ติดตั้ง
- ถ้าไม่ตั้งค่าและไม่มี Ollama → ปุ่ม AI Diagnose ยังแสดงอยู่ แต่ prompt ให้ตั้งค่า provider ก่อน

---

## UI Design

- **Color scheme:** Indigo/Professional — primary `#4f46e5` (indigo-600)
- **Background:** white + `#f8f7ff` sidebar
- **Status colors:** green (Running), red (Error/CrashLoop), yellow (Pending/Warning)
- **CRD resources:** purple accent `#7c3aed`
- **Top bar:** deep indigo `#4f46e5` พร้อม context + namespace switcher
- **Font:** system-ui / Inter
- **Tables:** TanStack Table v8 — sortable, filterable, virtualized สำหรับ large lists
- **Topology:** React Flow v11 + dagre, custom node components per K8s kind

---

## Project Structure

```
k999s-dashboard/
├── cmd/k999s/
│   └── main.go
├── internal/
│   ├── k8s/
│   │   ├── client.go         ← kubeconfig loader, context switcher
│   │   ├── informers.go      ← watch resources via informer framework
│   │   ├── exec.go           ← pod exec / attach
│   │   └── portforward.go    ← port-forward manager
│   ├── api/
│   │   ├── router.go         ← gin router setup
│   │   ├── resources.go      ← REST handlers per resource type
│   │   ├── ws.go             ← WebSocket upgrade + message routing
│   │   └── diagnostic.go     ← AI diagnostic handler
│   ├── ws/
│   │   └── hub.go            ← WebSocket hub (broadcast to connected clients)
│   ├── diagnostic/
│   │   ├── provider.go       ← provider interface
│   │   ├── anthropic.go      ← Anthropic SDK
│   │   ├── openai.go         ← OpenAI SDK (shared with OpenRouter)
│   │   └── ollama.go         ← Ollama HTTP client
│   └── config/
│       └── config.go         ← load ~/.k999s/config.yaml + kubeconfig
├── web/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/       ← Sidebar, TopBar, DetailPanel
│   │   │   ├── resources/    ← ResourceTable, ResourceActions
│   │   │   ├── topology/     ← ReactFlow nodes + edges
│   │   │   ├── logs/         ← LogViewer (xterm.js wrapper)
│   │   │   └── diagnostic/   ← AIDiagnosticPanel
│   │   ├── pages/
│   │   │   ├── Overview.tsx
│   │   │   ├── Pods.tsx
│   │   │   ├── Deployments.tsx
│   │   │   ├── Topology.tsx
│   │   │   ├── ResourceExplorer.tsx
│   │   │   ├── Logs.tsx
│   │   │   ├── Events.tsx
│   │   │   └── Top.tsx
│   │   ├── hooks/
│   │   │   ├── useWebSocket.ts
│   │   │   ├── useK8sResource.ts
│   │   │   └── useTopology.ts
│   │   └── lib/
│   │       ├── api.ts         ← REST API client
│   │       └── types.ts       ← K8s resource TypeScript types
│   └── dist/                  ← go:embed target
├── docs/
│   └── superpowers/specs/
│       └── 2026-05-20-k999s-dashboard-design.md
├── go.mod
├── go.sum
├── Makefile                   ← build targets: build, dev, release
└── .gitignore
```

---

## Build & Development

```makefile
# Makefile targets
dev:        # รัน Go backend + Vite dev server พร้อมกัน (hot reload)
build:      # npm run build → go build (embed dist)
release:    # cross-compile: linux/amd64, darwin/amd64, darwin/arm64, windows/amd64
```

### Development mode
```bash
make dev
# Go backend รันที่ :8080
# Vite dev server รันที่ :5173 (proxy API calls ไป :8080)
```

### Production build
```bash
make build
# Output: ./k999s binary (~20MB)
./k999s --port 8080 --kubeconfig ~/.kube/config
```

---

## Out of Scope (v1)

- Multi-user authentication / RBAC (local tool เท่านั้น)
- Helm chart management
- Resource creation forms (ใช้ YAML edit แทน)
- Metrics history / time-series graphs (ใช้ Grafana สำหรับส่วนนี้)
- Alert rules configuration

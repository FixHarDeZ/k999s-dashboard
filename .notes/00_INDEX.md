# k999s Dashboard — Project Index

> Last updated: 2026-05-21 (Batch A: ConfirmModal, auto-refresh picker, log tail lines, AI Diagnose on Overview)

## Overview

k999s เป็น Kubernetes dashboard แบบ local web app — single Go binary ที่ embed React frontend อ่าน `~/.kube/config` อัตโนมัติ เปิด browser เองที่ `:8080`

**GitHub:** https://github.com/FixHarDeZ/k999s-dashboard  
**Version:** v0.2.0 (file: `VERSION`)

---

## Quick Start

```bash
make build          # build binary
./k999s             # run + open browser
./k999s --version   # k999s v0.1.0

make dev            # hot reload dev mode
# Go backend :8080, Vite dev server :5173
```

---

## Architecture

```
web/src/ → npm run build → internal/frontend/dist/
                                    ↓ (go:embed)
                         cmd/k999s/main.go → ./k999s binary
```

### Go Packages

| Package | Responsibility |
|---|---|
| `internal/config` | Load `~/.k999s/config.yaml` + kubeconfig path |
| `internal/k8s` | All K8s client methods (list, actions, stream, exec, topology, explorer) |
| `internal/api` | gin router + all HTTP/WebSocket handlers |
| `internal/ws` | WebSocket hub (broadcast `{type, data}` to all clients) |
| `internal/diagnostic` | AI provider abstraction (Ollama, OpenRouter, OpenAI, Anthropic) |
| `internal/frontend` | `go:embed all:dist` only |

### React Structure

| Path | Description |
|---|---|
| `src/lib/api.ts` | All fetch functions + WebSocket URL helpers |
| `src/lib/types.ts` | TypeScript mirrors of Go summary types |
| `src/hooks/useWebSocket.ts` | Auto-reconnect WebSocket hook |
| `src/components/layout/` | Sidebar (with CRD detection), TopBar (custom dropdown), AppLayout |
| `src/components/LogViewer.tsx` | Streaming log slide-over panel |
| `src/components/ExecTerminal.tsx` | xterm.js full-screen exec modal |
| `src/components/DiagnosticPanel.tsx` | AI diagnostic streaming panel |
| `src/pages/` | 15 pages: Overview, Topology, Events, Top, Pods, Deployments, StatefulSets, Services, Nodes, Namespaces, ConfigMaps, Secrets, ResourceExplorer, Settings, Istio, Gateway, Canary |

---

## API Endpoints

### REST `/api/v1/`

| Method | Path | Description |
|---|---|---|
| GET | `/pods?namespace=` | List pods |
| GET | `/deployments?namespace=` | List deployments |
| GET | `/statefulsets?namespace=` | List statefulsets |
| GET | `/services?namespace=` | List services |
| GET | `/nodes` | List nodes |
| GET | `/namespaces` | List namespace names (for TopBar) |
| GET | `/namespace-summaries` | List namespaces with status/age |
| GET | `/configmaps?namespace=` | List configmaps |
| GET | `/secrets?namespace=` | List secrets |
| GET | `/events?namespace=` | List events |
| GET | `/contexts` | List kubeconfig contexts |
| GET | `/pod-metrics?namespace=` | Pod CPU/Memory (requires metrics-server) |
| GET | `/node-metrics` | Node CPU/Memory (requires metrics-server) |
| GET | `/topology?namespace=` | Namespace topology graph `{nodes, edges}` |
| GET | `/api-resources` | List all CRD kinds (discovery API) |
| GET | `/resource-list?group=&version=&resource=&namespace=` | List any resource |
| GET | `/resource-get?group=&version=&resource=&namespace=&name=` | Get resource as JSON |
| GET | `/detected-crds` | CRD presence `{istio, gatewayApi, canary}` |
| GET | `/pods/:ns/:name/containers` | List container names |
| DELETE | `/pods/:ns/:name` | Delete pod |
| POST | `/pods/:ns/:name/restart` | Restart pod (delete → recreate) |
| POST | `/deployments/:ns/:name/scale` | Scale `{replicas: N}` |
| POST | `/deployments/:ns/:name/rollout-restart` | Rollout restart |
| DELETE | `/deployments/:ns/:name` | Delete deployment |
| GET | `/settings` | Get AI config (API key masked) |
| PUT | `/settings` | Save AI config + hot-reload provider |
| PUT | `/resource-apply` | Apply edited resource YAML |

### WebSocket

| Path | Description |
|---|---|
| `/ws` | General hub (live pod/event broadcasts) |
| `/ws/pods/:ns/:name/logs?container=&follow=&previous=` | Stream pod logs |
| `/ws/pods/:ns/:name/exec?container=` | Bidirectional exec (xterm.js) |
| `/ws/pods/:ns/:name/diagnose` | AI diagnostic streaming tokens |

---

## App Config (`~/.k999s/config.yaml`)

```yaml
ai:
  provider: ollama        # ollama (default) | openrouter | openai | anthropic
  api_key: ""             # required for openrouter, openai, anthropic
  model: llama3.2         # default model for ollama
  base_url: ""            # optional override (e.g. custom Ollama endpoint)
```

**AI disabled** if provider is empty or "none" — dashboard works normally without AI.

---

## Known Gaps / Limitations (v0.2.0)

| Feature | Status |
|---|---|
| StatefulSets page | ✅ Implemented (2026-05-21) — Name/NS/Ready/Age table + YAML view/edit |
| DaemonSets page | Not implemented |
| HPA page | Not implemented |
| Jobs / CronJobs page | Not implemented |
| Canary / Istio / Gateway pages | ✅ Implemented (2026-05-21) — rich tabbed UI, YamlSidePanel, sorting |
| Port-forward | Not implemented |
| WebSocket live pod updates | Hub exists but informers not wired (manual refresh only) |
| Rollback deployment | Not implemented |
| Cordon/Drain nodes | ✅ Implemented (2026-05-21) — Cordon/Uncordon/Drain buttons + ConfirmModal |
| Ingress page | ✅ Implemented (2026-05-21) — Name/NS/Hosts/Address/Ports/Age table |
| Helm menu | ✅ Implemented (2026-05-21) — list releases + delete via ConfirmModal |
| Namespace drill-down | Not implemented (planned Batch D) |

## Batch C — Helm Menu (2026-05-21, pushed to main)

| เรื่อง | รายละเอียด |
|---|---|
| **internal/helm package** | `Client` wraps `helm` CLI — `ListReleases` + `UninstallRelease` + kubeconfig/context flags |
| **API routes** | `GET /api/v1/helm/releases?namespace=` + `DELETE /api/v1/helm/releases/:ns/:name` |
| **Helm.tsx page** | Table: Name/NS/Chart/AppVer/Status(badge)/Rev/Updated + Delete + ConfirmModal |

---

## Batch B (2026-05-21, pushed to main)

| เรื่อง | รายละเอียด |
|---|---|
| **Ingress page** | `GET /api/v1/ingresses` + `Ingress.tsx` + sidebar Network group |
| **Node Cordon/Drain** | `CordonNode`/`DrainNode` Go actions + `POST /nodes/:name/{cordon,uncordon,drain}` + Nodes.tsx rewrite |
| **NodeSummary.Schedulable** | เพิ่ม field ให้ UI แสดง cordon status |

---

## Batch A UI Polish (2026-05-21, pushed to main)

| เรื่อง | รายละเอียด |
|---|---|
| **ConfirmModal** | `web/src/components/ConfirmModal.tsx` — shared styled modal แทน `window.confirm()` ใน Pods + Deployments |
| **Auto-refresh picker** | Dropdown Off/5s/10s/15s/30s ใน Pods + Deployments |
| **Log tail lines** | Go `StreamLogs` + `?tail=` handler + LogViewer dropdown All/100/200/300/400/500 |
| **AI Diagnose on Overview** | 🔍 button ต่อ unhealthy pod → เปิด DiagnosticPanel |

---

## Changes in v0.1.0 Session (2026-05-21)

| เรื่อง | รายละเอียด |
|---|---|
| **Pods containers** | Expandable row ▶/▼ แสดง container type (init/sidecar/main), state, restart count |
| **Topology crash fix** | try/catch รอบ dagre + error state ป้องกัน white page |
| **Topology error detail** | กด red node → fetch container statuses + AI Diagnose button |
| **ResourceExplorer refresh** | Auto-refresh เมื่อ context/namespace เปลี่ยน |
| **ResourceExplorer view toggle** | ปุ่ม [Full]/[Clean] YAML (Clean = strip status + managedFields) |
| **Namespace dropdown scroll** | maxHeight + overflowY:auto |
| **Settings page** | UI config AI provider + hot-reload ไม่ต้อง restart |
| **AI Diagnostic deep** | GetPodDiagnosticContext: exit codes, previous logs, resource limits, events via FieldSelector |
| **AI prompt size cap** | 20k chars total, truncate long lines, per-section budget |
| **README.md** | Bilingual EN/TH với toggle anchor links |
| **`.gitignore`** | Patterns: config.yaml, .k999s/, .env.*, *kubeconfig*, *.pem/*.key/*.crt |
| **GitHub Release v0.1.0** | 5 platforms binary + checksums.txt |
| **`/release` skill** | `~/.claude/skills/release/SKILL.md` |
| **Istio page sorting** | Added column sorting (↑/↓) on VirtualService and DestinationRule tables |

## Changes in v0.3.0 Session (2026-05-21)

| เรื่อง | รายละเอียด |
|---|---|
| **Topology warning** | Modal confirm ก่อนโหลด All Namespaces topology — ป้องกัน accidental load |
| **Top rolling min/max** | Track session min/max CPU + MEM per pod/node via `useRef` Map — แสดงใต้ค่า current |
| **YamlSidePanel editable** | `editable` prop เพิ่ม Edit/Apply/Cancel mode — `applyResource()` + `reloadKey` pattern |
| **StatefulSets** | Go: `ListStatefulSets` + route; TS: type + api; Frontend: full table page + YAML |
| **YAML button on 6 pages** | Pods, Deployments, Services, ConfigMaps, Secrets, Namespaces — `FileCode2` icon + editable YamlSidePanel |

---

## Changes in v0.2.0 Session (2026-05-21)

| เรื่อง | รายละเอียด |
|---|---|
| **AI Diagnose fix** | `opencompat.go` เพิ่ม HTTP status check — surface real API error (rate limit, invalid model) แทน generic message |
| **Settings ขวาบน** | ย้ายจาก bottom sidebar ไปเป็น button ใน TopBar มุมขวา |
| **TopBar cluster icon** | แทน "k999s" text ด้วย `Network` icon (lucide-react) |
| **GitHub Release v0.2.0** | 5 platform binaries + checksums.txt |
| **Istio page** | VS + DR tabs, columns: Name/NS/Hosts/Gateways/HTTP Routes/Age, sorting, YamlSidePanel |
| **Gateway API page** | Gateway + HTTPRoute tabs, version discovery, sorting, YamlSidePanel |
| **Canary page** | Flagger Canary + Argo Rollouts tabs (shown per detected CRD), phase badge colors, weight progress bar |
| **YamlSidePanel component** | Shared slide-over YAML viewer, Full/Clean toggle, reused by Istio/Gateway/Canary |
| **CRDPresence split** | `canary bool` → `flaggerCanary + argoRollouts` (Go + TS + AppLayout outlet context) |
| **Sidebar tests** | 7 tests covering CRD detection visibility (Istio/Gateway/Flagger/Argo) |

---

## Tailwind v4 Note

Custom colors **must** be in `src/index.css` with `@theme {}`, NOT in `tailwind.config.ts`:

```css
@import "tailwindcss";
@theme {
  --color-primary-600: #4f46e5;
  /* ... */
}
```

---

## Dev Tips

- Run frontend tests from `web/` directory: `cd web && npx vitest run`
- After React source change, must `make build` before `./k999s` binary reflects it
- HMR sometimes gets stuck — restart `npm run dev` if changes don't appear
- `api.NewRouter` takes 4 params: `(k8sClient, webFS, hub, diagnostic)` — pass `nil` for hub/diagnostic in tests

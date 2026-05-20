# k999s Dashboard — Project Index

> Last updated: 2026-05-20

## Overview

k999s เป็น Kubernetes dashboard แบบ local web app — single Go binary ที่ embed React frontend อ่าน `~/.kube/config` อัตโนมัติ เปิด browser เองที่ `:8080`

**GitHub:** https://github.com/FixHarDeZ/k999s-dashboard  
**Version:** v0.1.0 (file: `VERSION`)

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
| `src/pages/` | 13 pages: Overview, Topology, Events, Top, Pods, Deployments, Services, Nodes, Namespaces, ConfigMaps, Secrets, ResourceExplorer, (StatefulSets placeholder) |

---

## API Endpoints

### REST `/api/v1/`

| Method | Path | Description |
|---|---|---|
| GET | `/pods?namespace=` | List pods |
| GET | `/deployments?namespace=` | List deployments |
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

## Known Gaps / Limitations (v0.1.0)

| Feature | Status |
|---|---|
| StatefulSets page | Placeholder only — not implemented |
| DaemonSets page | Not implemented |
| HPA page | Not implemented |
| Jobs / CronJobs page | Not implemented |
| Canary / Istio / Gateway pages | Sidebar shows if CRD detected, but pages are not implemented (routes go nowhere) |
| Port-forward | Not implemented |
| Context switching (live) | TopBar shows dropdown but switching doesn't reload k8s client |
| YAML editing | Viewer only, no edit |
| WebSocket live pod updates | Hub exists but informers not wired (manual refresh only) |
| Rollback deployment | Not implemented |
| Cordon/Drain nodes | Not implemented |

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

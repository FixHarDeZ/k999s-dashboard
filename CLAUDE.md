# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

k999s is a local Kubernetes dashboard — a single Go binary that embeds a React frontend and serves it at `http://localhost:8080`. It reads `~/.kube/config` automatically, no external dependencies required to run.

## Commands

### Development (hot reload)
```bash
make dev          # Go backend :8080 + Vite dev server :5173 in parallel
```
Vite proxies `/api` and `/ws` to Go backend, so the frontend at `:5173` talks to Go.

### Build production binary
```bash
make build        # npm run build → go build → ./k999s (~47MB self-contained binary)
./k999s --port 8080 --kubeconfig ~/.kube/config
```
**Important:** After any React source change, run `make build` before running `./k999s` — the binary embeds the build snapshot at compile time.

### Testing
```bash
make test                                              # all Go + frontend tests
go test ./...                                          # Go only
go test ./internal/k8s/... -v                         # single Go package
go test ./internal/k8s/... -run TestDeletePod -v      # single Go test
cd web && npx vitest run                               # frontend only (must run from web/)
cd web && npx vitest run src/lib/api.test.ts           # single frontend file
cd web && npx tsc --noEmit                             # TypeScript check only
```
Frontend tests **must run from `web/`**, not the project root — the `@` path alias is only configured in `web/vite.config.ts`.

### Lint
```bash
golangci-lint run
```

## Architecture

### Binary embedding flow
```
web/src/ → npm run build → internal/frontend/dist/
                                    ↓
                    internal/frontend/frontend.go (go:embed all:dist)
                                    ↓
                         cmd/k999s/main.go → ./k999s binary
```
The Vite build output directory is `../internal/frontend/dist` (relative to `web/`), **not** `web/dist`. This is set in `web/vite.config.ts` `build.outDir`.

### Go package responsibilities
- `internal/config` — loads `~/.k999s/config.yaml` (AI provider settings) + kubeconfig path
- `internal/k8s` — `Client` wraps `kubernetes.Interface`; `client.go` = list methods, `actions.go` = mutating operations
- `internal/api` — gin router + handlers; `NewRouter(k8sClient, webFS, hub)` takes nil hub in tests
- `internal/ws` — WebSocket hub; `Broadcast(type, data)` sends `{type, data}` JSON to all connected clients
- `internal/frontend` — only holds `go:embed` declaration

### React frontend
- `src/lib/api.ts` — all fetch calls; `get<T>()` for reads, `action()` helper for mutations
- `src/lib/types.ts` — TypeScript mirrors of Go summary types (`PodSummary`, `DeploymentSummary`, etc.)
- `src/hooks/useWebSocket.ts` — auto-reconnect WebSocket hook; dispatches `{type, data}` messages
- Pages use `useOutletContext<{ namespace: string } | null>()` for namespace filter — always null-safe with `?? ''`
- `AppLayout` passes `{ namespace }` to all child pages via `<Outlet context={{ namespace }} />`

### Tailwind v4 quirk
Custom colors are declared in `src/index.css` with `@theme {}`, **not** in `tailwind.config.ts`. The `tailwind.config.ts` file is unused for theme extension in v4:
```css
/* src/index.css */
@import "tailwindcss";
@theme {
  --color-primary-600: #4f46e5;
  /* ... */
}
```
If Tailwind classes like `bg-primary-600` stop working, add the color here.

### Test patterns
**Go — K8s client tests** use `fake.NewSimpleClientset(objects...)` + `k8s.NewClientFromKubernetesClient(fakeClient, "")` to avoid a real cluster.

**Go — API handler tests** use:
```go
api.NewRouter(client, embed.FS{}, nil)  // nil hub = no /ws route
```

**React** — mock `@/hooks/useWebSocket` and `@/lib/api` with `vi.mock()`. Mock `window.confirm` for action tests.

## App Config (`~/.k999s/config.yaml`)

```yaml
ai:
  provider: ollama        # default; anthropic | openai | openrouter | ollama
  api_key: ""
  model: llama3.2
  base_url: ""            # optional override
```
AI Diagnostic feature is disabled when no provider is configured.

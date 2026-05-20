# k999s — Plan 5: AI Diagnostic + Cluster Overview + CRD Auto-detect

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่ม AI Diagnostic (Ollama/OpenRouter/Anthropic streaming), Cluster Overview หน้าแรกที่แสดง node health + unhealthy pods + events, และ CRD auto-detect ที่ซ่อน/แสดง Istio/Gateway/Canary ใน sidebar อัตโนมัติ

**Architecture:** AI Diagnostic เป็น `internal/diagnostic` package ที่มี Provider interface + implementations สำหรับ Ollama (Newline JSON), OpenRouter/OpenAI (SSE), Anthropic (SSE) — streaming tokens ผ่าน WebSocket. Cluster Overview ใช้ existing API endpoints. CRD detection ใช้ discovery client ที่มีอยู่แล้ว.

**Tech Stack:** standard `net/http` + `bufio` (streaming AI), existing k8s.Client.Discovery() (CRD detect), React existing patterns

---

## What exists (Plans 1-4)

```
internal/config/config.go  — AIConfig{Provider, APIKey, Model, BaseURL} defaults to ollama/llama3.2
internal/k8s/streaming.go  — StreamLogs (for collecting pod logs for diagnostic)
internal/k8s/events.go     — ListEvents (for collecting pod events)
internal/api/router.go     — NewRouter(k8sClient, webFS, hub)  ← needs diagnostic param
cmd/k999s/main.go          — loads cfg.AI but never passes to router
web/src/App.tsx             — "/" is Placeholder("Cluster Overview")
web/src/pages/Pods.tsx      — AI Diagnose button not yet implemented
```

## File Map

```
internal/diagnostic/
  provider.go       NEW — Provider interface + DiagnosticInput type + system prompt + buildPrompt
  ollama.go         NEW — OllamaProvider (newline-delimited JSON streaming)
  opencompat.go     NEW — OpenCompatProvider (SSE, handles OpenAI + OpenRouter)
  anthropic.go      NEW — AnthropicProvider (SSE with anthropic headers)
  factory.go        NEW — New(cfg config.AIConfig) (Provider, error)
internal/k8s/
  crd_detect.go     NEW — DetectCRDs() → CRDPresence{Istio, GatewayAPI, Canary}
internal/api/
  router.go         MODIFY — add diagnostic.Provider param to NewRouter
  handlers.go       MODIFY — add handleDiagnose, handleDetectedCRDs
  handlers_test.go  MODIFY — pass nil provider to newTestRouter
web/src/
  components/
    DiagnosticPanel.tsx  NEW — streaming AI response panel
  pages/
    Overview.tsx         NEW — Cluster Overview (node health, unhealthy pods, events)
    Pods.tsx             MODIFY — wire AI Diagnose button
  lib/
    api.ts               MODIFY — add diagnosticWsUrl, fetchDetectedCRDs
    types.ts             MODIFY — add CRDPresence
  components/layout/
    AppLayout.tsx        MODIFY — fetch detected CRDs, pass to Sidebar
    Sidebar.tsx          MODIFY — accept detectedCRDs prop, show/hide Network items
  App.tsx                MODIFY — replace "/" Placeholder with Overview
```

---

## Task 1: AI Diagnostic Backend — Provider Package

**Files:**
- Create: `internal/diagnostic/provider.go`
- Create: `internal/diagnostic/ollama.go`
- Create: `internal/diagnostic/opencompat.go`
- Create: `internal/diagnostic/anthropic.go`
- Create: `internal/diagnostic/factory.go`

- [ ] **Step 1: Create `internal/diagnostic/provider.go`**

```go
package diagnostic

import (
	"context"
	"fmt"
	"strings"
)

// Provider streams AI analysis of a failing pod.
type Provider interface {
	Diagnose(ctx context.Context, input DiagnosticInput) (<-chan string, error)
}

// DiagnosticInput holds the pod context for analysis.
type DiagnosticInput struct {
	PodName   string
	Namespace string
	Logs      string
	Events    string
}

const systemPrompt = `You are a Kubernetes SRE expert. Analyze the failing pod and provide a concise diagnosis.
Format your response with exactly these sections:
🔍 Root Cause: (1-2 sentences)
🔧 Fix Steps: (2-3 numbered steps)
Keep it brief and actionable.`

func buildPrompt(input DiagnosticInput) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "Pod: %s/%s\n\n", input.Namespace, input.PodName)
	if input.Logs != "" {
		fmt.Fprintf(&sb, "=== Recent Logs ===\n%s\n\n", input.Logs)
	}
	if input.Events != "" {
		fmt.Fprintf(&sb, "=== Events ===\n%s\n\n", input.Events)
	}
	sb.WriteString("Diagnose this pod and suggest how to fix it.")
	return sb.String()
}
```

- [ ] **Step 2: Create `internal/diagnostic/ollama.go`**

```go
package diagnostic

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
)

// OllamaProvider calls a local Ollama server (newline-delimited JSON streaming).
type OllamaProvider struct {
	model   string
	baseURL string
}

func NewOllama(model, baseURL string) *OllamaProvider {
	if baseURL == "" {
		baseURL = "http://localhost:11434"
	}
	return &OllamaProvider{model: model, baseURL: baseURL}
}

func (p *OllamaProvider) Diagnose(ctx context.Context, input DiagnosticInput) (<-chan string, error) {
	body, _ := json.Marshal(map[string]any{
		"model": p.model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": buildPrompt(input)},
		},
		"stream": true,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/api/chat", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("ollama request failed: %w", err)
	}

	ch := make(chan string, 16)
	go func() {
		defer close(ch)
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			var msg struct {
				Message struct{ Content string `json:"content"` } `json:"message"`
				Done    bool                                      `json:"done"`
			}
			if err := json.Unmarshal(scanner.Bytes(), &msg); err != nil {
				continue
			}
			if msg.Message.Content != "" {
				select {
				case ch <- msg.Message.Content:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return ch, nil
}
```

- [ ] **Step 3: Create `internal/diagnostic/opencompat.go`**

```go
package diagnostic

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// OpenCompatProvider handles OpenAI-compatible APIs (OpenAI, OpenRouter) via SSE.
type OpenCompatProvider struct {
	apiKey  string
	model   string
	baseURL string
}

func NewOpenCompat(apiKey, model, baseURL string) *OpenCompatProvider {
	return &OpenCompatProvider{apiKey: apiKey, model: model, baseURL: baseURL}
}

func (p *OpenCompatProvider) Diagnose(ctx context.Context, input DiagnosticInput) (<-chan string, error) {
	body, _ := json.Marshal(map[string]any{
		"model": p.model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": buildPrompt(input)},
		},
		"stream": true,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("openai-compat request failed: %w", err)
	}

	ch := make(chan string, 16)
	go func() {
		defer close(ch)
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			if data == "[DONE]" {
				break
			}
			var msg struct {
				Choices []struct {
					Delta struct {
						Content string `json:"content"`
					} `json:"delta"`
				} `json:"choices"`
			}
			if err := json.Unmarshal([]byte(data), &msg); err != nil {
				continue
			}
			if len(msg.Choices) > 0 && msg.Choices[0].Delta.Content != "" {
				select {
				case ch <- msg.Choices[0].Delta.Content:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return ch, nil
}
```

- [ ] **Step 4: Create `internal/diagnostic/anthropic.go`**

```go
package diagnostic

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// AnthropicProvider calls the Anthropic Messages API with SSE streaming.
type AnthropicProvider struct {
	apiKey string
	model  string
}

func NewAnthropic(apiKey, model string) *AnthropicProvider {
	return &AnthropicProvider{apiKey: apiKey, model: model}
}

func (p *AnthropicProvider) Diagnose(ctx context.Context, input DiagnosticInput) (<-chan string, error) {
	body, _ := json.Marshal(map[string]any{
		"model":      p.model,
		"max_tokens": 1024,
		"system":     systemPrompt,
		"messages": []map[string]string{
			{"role": "user", "content": buildPrompt(input)},
		},
		"stream": true,
	})

	req, err := http.NewRequestWithContext(ctx, "POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("x-api-key", p.apiKey)
	req.Header.Set("anthropic-version", "2023-06-01")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("anthropic request failed: %w", err)
	}

	ch := make(chan string, 16)
	go func() {
		defer close(ch)
		defer resp.Body.Close()
		scanner := bufio.NewScanner(resp.Body)
		for scanner.Scan() {
			line := scanner.Text()
			if !strings.HasPrefix(line, "data: ") {
				continue
			}
			data := strings.TrimPrefix(line, "data: ")
			var msg struct {
				Type  string `json:"type"`
				Delta struct {
					Text string `json:"text"`
				} `json:"delta"`
			}
			if err := json.Unmarshal([]byte(data), &msg); err != nil {
				continue
			}
			if msg.Type == "content_block_delta" && msg.Delta.Text != "" {
				select {
				case ch <- msg.Delta.Text:
				case <-ctx.Done():
					return
				}
			}
		}
	}()
	return ch, nil
}
```

- [ ] **Step 5: Create `internal/diagnostic/factory.go`**

```go
package diagnostic

import (
	"fmt"

	"github.com/k999s/dashboard/internal/config"
)

// New creates a Provider from the app config.
// Returns nil, nil when provider is empty (AI disabled).
func New(cfg config.AIConfig) (Provider, error) {
	switch cfg.Provider {
	case "", "none":
		return nil, nil
	case "ollama":
		return NewOllama(cfg.Model, cfg.BaseURL), nil
	case "openrouter":
		if cfg.APIKey == "" {
			return nil, fmt.Errorf("openrouter requires api_key in ~/.k999s/config.yaml")
		}
		baseURL := cfg.BaseURL
		if baseURL == "" {
			baseURL = "https://openrouter.ai/api/v1"
		}
		return NewOpenCompat(cfg.APIKey, cfg.Model, baseURL), nil
	case "openai":
		if cfg.APIKey == "" {
			return nil, fmt.Errorf("openai requires api_key in ~/.k999s/config.yaml")
		}
		return NewOpenCompat(cfg.APIKey, cfg.Model, "https://api.openai.com/v1"), nil
	case "anthropic":
		if cfg.APIKey == "" {
			return nil, fmt.Errorf("anthropic requires api_key in ~/.k999s/config.yaml")
		}
		return NewAnthropic(cfg.APIKey, cfg.Model), nil
	default:
		return nil, fmt.Errorf("unknown AI provider %q — valid values: ollama, openrouter, openai, anthropic", cfg.Provider)
	}
}
```

- [ ] **Step 6: Verify compiles**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
go build ./internal/diagnostic/... 2>&1
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add internal/diagnostic/
git commit -m "feat: add ai diagnostic provider package (ollama, openrouter, anthropic)"
```

---

## Task 2: Wire Diagnostic to Router + CRD Detect + API Endpoints

**Files:**
- Create: `internal/k8s/crd_detect.go`
- Modify: `internal/api/router.go`
- Modify: `internal/api/handlers.go`
- Modify: `internal/api/handlers_test.go`
- Modify: `cmd/k999s/main.go`

- [ ] **Step 1: Create `internal/k8s/crd_detect.go`**

```go
package k8s

import "k8s.io/apimachinery/pkg/runtime/schema"

// CRDPresence indicates which optional CRDs are installed in the cluster.
type CRDPresence struct {
	Istio      bool `json:"istio"`
	GatewayAPI bool `json:"gatewayApi"`
	Canary     bool `json:"canary"`
}

// DetectCRDs probes the cluster's API groups for known optional CRDs.
func (c *Client) DetectCRDs() *CRDPresence {
	p := &CRDPresence{}
	groups, err := c.kube.Discovery().ServerGroups()
	if err != nil {
		return p
	}
	istioGroups := map[string]bool{
		"networking.istio.io": true,
		"security.istio.io":   true,
	}
	gatewayGroups := map[string]bool{
		"gateway.networking.k8s.io": true,
	}
	canaryGroups := map[string]bool{
		"flagger.app":     true,
		"argoproj.io":     true,
	}
	for _, g := range groups.Groups {
		gv, _ := schema.ParseGroupVersion(g.PreferredVersion.GroupVersion)
		switch {
		case istioGroups[gv.Group]:
			p.Istio = true
		case gatewayGroups[gv.Group]:
			p.GatewayAPI = true
		case canaryGroups[gv.Group]:
			p.Canary = true
		}
	}
	return p
}
```

- [ ] **Step 2: Verify k8s package compiles**

```bash
go build ./internal/k8s/... 2>&1
```

- [ ] **Step 3: Update `internal/api/router.go`** — add diagnostic param and detect-crds route

Change `Router` struct and `NewRouter` to include `diagnostic.Provider`:

```go
package api

import (
	"embed"
	"io/fs"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/k999s/dashboard/internal/diagnostic"
	"github.com/k999s/dashboard/internal/k8s"
	"github.com/k999s/dashboard/internal/ws"
)

type Router struct {
	engine     *gin.Engine
	k8s        *k8s.Client
	hub        *ws.Hub
	diagnostic diagnostic.Provider // nil = AI disabled
}

func NewRouter(k8sClient *k8s.Client, webFS embed.FS, hub *ws.Hub, diag diagnostic.Provider) *Router {
	gin.SetMode(gin.ReleaseMode)
	r := &Router{engine: gin.New(), k8s: k8sClient, hub: hub, diagnostic: diag}
	r.engine.Use(gin.Recovery())
	r.engine.Use(corsMiddleware())

	v1 := r.engine.Group("/api/v1")
	v1.GET("/pods", r.handleListPods)
	v1.GET("/namespaces", r.handleListNamespaces)
	v1.GET("/contexts", r.handleListContexts)
	v1.GET("/deployments", r.handleListDeployments)
	v1.GET("/services", r.handleListServices)
	v1.GET("/nodes", r.handleListNodes)
	v1.GET("/namespace-summaries", r.handleListNamespaceSummaries)
	v1.GET("/configmaps", r.handleListConfigMaps)
	v1.GET("/secrets", r.handleListSecrets)
	v1.GET("/events", r.handleListEvents)
	v1.GET("/pod-metrics", r.handlePodMetrics)
	v1.GET("/node-metrics", r.handleNodeMetrics)
	v1.GET("/pods/:namespace/:name/containers", r.handlePodContainers)
	v1.GET("/topology", r.handleGetTopology)
	v1.GET("/api-resources", r.handleAPIResources)
	v1.GET("/resource-list", r.handleResourceList)
	v1.GET("/resource-get", r.handleResourceGet)
	v1.GET("/detected-crds", r.handleDetectedCRDs)
	v1.DELETE("/pods/:namespace/:name", r.handleDeletePod)
	v1.POST("/pods/:namespace/:name/restart", r.handleRestartPod)
	v1.POST("/deployments/:namespace/:name/scale", r.handleScaleDeployment)
	v1.POST("/deployments/:namespace/:name/rollout-restart", r.handleRolloutRestartDeployment)
	v1.DELETE("/deployments/:namespace/:name", r.handleDeleteDeployment)

	r.engine.GET("/ws/pods/:namespace/:name/logs", r.handlePodLogs)
	r.engine.GET("/ws/pods/:namespace/:name/exec", r.handlePodExec)
	r.engine.GET("/ws/pods/:namespace/:name/diagnose", r.handleDiagnose)
	if hub != nil {
		r.engine.GET("/ws", r.handleWebSocket)
	}

	sub, err := fs.Sub(webFS, "dist")
	if err == nil {
		fileServer := http.FileServer(http.FS(sub))
		r.engine.NoRoute(func(c *gin.Context) {
			path := c.Request.URL.Path
			if _, statErr := fs.Stat(sub, path[1:]); statErr != nil {
				c.Request.URL.Path = "/"
			}
			fileServer.ServeHTTP(c.Writer, c.Request)
		})
	} else {
		r.engine.NoRoute(func(c *gin.Context) {
			c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
		})
	}
	return r
}

func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.engine.ServeHTTP(w, req)
}
func (r *Router) Run(addr string) error { return r.engine.Run(addr) }

func corsMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "http://localhost:5173")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
```

- [ ] **Step 4: Add handlers to `internal/api/handlers.go`**

Append:

```go
func (r *Router) handleDetectedCRDs(c *gin.Context) {
	presence := r.k8s.DetectCRDs()
	c.JSON(http.StatusOK, presence)
}

func (r *Router) handleDiagnose(c *gin.Context) {
	ns, name := c.Param("namespace"), c.Param("name")

	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	if r.diagnostic == nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte(
			"AI diagnostic is not configured.\n\nAdd to ~/.k999s/config.yaml:\n\nai:\n  provider: ollama\n  model: llama3.2\n",
		))
		return
	}

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

	// Collect logs (last 200 lines)
	var logLines []string
	stream, err := r.k8s.StreamLogs(ctx, ns, name, "", false, false)
	if err == nil && stream != nil {
		scanner := bufio.NewScanner(stream)
		for scanner.Scan() {
			logLines = append(logLines, scanner.Text())
		}
		stream.Close()
	}
	if len(logLines) > 200 {
		logLines = logLines[len(logLines)-200:]
	}

	// Collect events for this pod
	events, _ := r.k8s.ListEvents(ctx, ns)
	var eventLines []string
	for _, e := range events {
		if strings.Contains(e.Object, name) || strings.Contains(e.Object, "/"+name) {
			eventLines = append(eventLines, fmt.Sprintf("[%s] %s: %s", e.Type, e.Reason, e.Message))
		}
	}

	input := diagnostic.DiagnosticInput{
		PodName:   name,
		Namespace: ns,
		Logs:      strings.Join(logLines, "\n"),
		Events:    strings.Join(eventLines, "\n"),
	}

	ch, err := r.diagnostic.Diagnose(ctx, input)
	if err != nil {
		_ = conn.WriteMessage(websocket.TextMessage, []byte("Error: "+err.Error()))
		return
	}

	for token := range ch {
		if ctx.Err() != nil {
			break
		}
		if err := conn.WriteMessage(websocket.TextMessage, []byte(token)); err != nil {
			break
		}
	}
}
```

Add `"strings"` and `"fmt"` to the imports in handlers.go (they may already be there).
Add `"github.com/k999s/dashboard/internal/diagnostic"` to imports.

- [ ] **Step 5: Update `internal/api/handlers_test.go`** — pass nil diagnostic

Update `newTestRouter()`:
```go
func newTestRouter() *api.Router {
	fakeK8s := fake.NewSimpleClientset(
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "nginx", Namespace: "default"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
		},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "default"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeK8s, "test-context")
	return api.NewRouter(client, embed.FS{}, nil, nil) // nil hub, nil diagnostic
}
```

- [ ] **Step 6: Update `cmd/k999s/main.go`** — create provider + pass to router

```go
import "github.com/k999s/dashboard/internal/diagnostic"

// In main(), after loading cfg:
provider, provErr := diagnostic.New(cfg.AI)
if provErr != nil {
    log.Printf("AI diagnostic unavailable: %v", provErr)
    provider = nil
}

// Update NewRouter call:
router := api.NewRouter(k8sClient, frontend.FS, hub, provider)
```

- [ ] **Step 7: Run all Go tests — expect PASS**

```bash
go test ./... 2>&1 | tail -10
```

- [ ] **Step 8: Commit**

```bash
git add internal/k8s/crd_detect.go internal/api/ cmd/k999s/main.go
git commit -m "feat: wire ai diagnostic to router, add crd detection and diagnose ws endpoint"
```

---

## Task 3: AI Diagnostic Frontend Panel + Wire to Pods

**Files:**
- Modify: `web/src/lib/api.ts`
- Modify: `web/src/lib/types.ts`
- Create: `web/src/components/DiagnosticPanel.tsx`
- Modify: `web/src/pages/Pods.tsx`

- [ ] **Step 1: Append to `web/src/lib/types.ts`**

```typescript
export interface CRDPresence {
  istio: boolean
  gatewayApi: boolean
  canary: boolean
}
```

- [ ] **Step 2: Append to `web/src/lib/api.ts`**

Update top import line to add `CRDPresence`:
```typescript
import type { ..., CRDPresence } from './types'
```

Append:
```typescript
/** Returns a WebSocket URL for AI diagnostic streaming */
export function diagnosticWsUrl(namespace: string, name: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/pods/${namespace}/${name}/diagnose`
}

export async function fetchDetectedCRDs(): Promise<CRDPresence> {
  return get<CRDPresence>('/api/v1/detected-crds')
}
```

- [ ] **Step 3: Create `web/src/components/DiagnosticPanel.tsx`**

```typescript
import { useEffect, useState, useRef } from 'react'
import { X } from 'lucide-react'
import { diagnosticWsUrl } from '@/lib/api'

interface DiagnosticPanelProps {
  namespace: string
  podName: string
  onClose: () => void
}

export function DiagnosticPanel({ namespace, podName, onClose }: DiagnosticPanelProps) {
  const [text, setText] = useState('')
  const [status, setStatus] = useState<'connecting' | 'streaming' | 'done' | 'error'>('connecting')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setText('')
    setStatus('connecting')
    const ws = new WebSocket(diagnosticWsUrl(namespace, podName))

    ws.onopen = () => setStatus('streaming')
    ws.onerror = () => setStatus('error')
    ws.onclose = () => setStatus((s) => s === 'streaming' ? 'done' : s)
    ws.onmessage = (e) => {
      setText((prev) => prev + (e.data as string))
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }

    return () => ws.close()
  }, [namespace, podName])

  const statusColor = { connecting: '#818cf8', streaming: '#22c55e', done: '#6366f1', error: '#ef4444' }[status]
  const statusLabel = { connecting: 'Connecting...', streaming: 'Analyzing...', done: 'Analysis complete', error: 'Error' }[status]

  return (
    <div style={{
      position: 'fixed', top: 0, right: 0, bottom: 0, width: '55%', minWidth: 420,
      background: '#fff', boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
      zIndex: 60, display: 'flex', flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        background: '#1e1b4b', padding: '10px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 16 }}>🔍</span>
          <span style={{ color: '#c7d2fe', fontSize: 12, fontWeight: 600 }}>
            AI Diagnose: {namespace}/{podName}
          </span>
          <span style={{ fontSize: 10, color: statusColor }}>● {statusLabel}</span>
        </div>
        <button onClick={onClose}
          style={{ background: 'none', border: 'none', color: '#a5b4fc', cursor: 'pointer', fontSize: 18 }}>
          <X size={16} />
        </button>
      </div>

      {/* Content */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: 20,
        fontFamily: 'system-ui', fontSize: 13, lineHeight: 1.7, color: '#1e293b',
        whiteSpace: 'pre-wrap',
      }}>
        {status === 'connecting' && (
          <div style={{ color: '#818cf8', fontSize: 12 }}>Collecting pod logs and events...</div>
        )}
        {text || null}
        <div ref={bottomRef} />
      </div>

      {/* Footer hint */}
      {status === 'done' && (
        <div style={{ borderTop: '1px solid #e0e7ff', padding: '8px 16px', fontSize: 11, color: '#6366f1', background: '#f0f4ff' }}>
          AI analysis complete · Configure provider in <code style={{ background: '#e0e7ff', padding: '1px 4px', borderRadius: 3 }}>~/.k999s/config.yaml</code>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Update `web/src/pages/Pods.tsx`** — wire AI Diagnose button

Read current Pods.tsx to find the action buttons area. Then:

Add import:
```typescript
import { DiagnosticPanel } from '@/components/DiagnosticPanel'
```

Add state inside `Pods()`:
```typescript
const [diagTarget, setDiagTarget] = useState<PodSummary | null>(null)
```

Find the existing column action buttons and replace the disabled `🔍 AI` concept with a working button. Actually, there's no AI button in Pods.tsx yet — add it to the actions column after the Exec button:

In the `columns` array actions display cell, add:
```typescript
<button
  onClick={() => setDiagTarget(row.original)}
  className="p-1 text-yellow-600 hover:bg-yellow-50 rounded text-xs flex items-center gap-1"
  title="AI Diagnose"
>
  🔍 AI
</button>
```

Add DiagnosticPanel before the closing `</div>` of return (after LogViewer and ExecTerminal):
```typescript
{diagTarget && (
  <DiagnosticPanel
    namespace={diagTarget.namespace}
    podName={diagTarget.name}
    onClose={() => setDiagTarget(null)}
  />
)}
```

- [ ] **Step 5: TypeScript check + tests**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -8
```

- [ ] **Step 6: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/lib/api.ts web/src/lib/types.ts web/src/components/DiagnosticPanel.tsx web/src/pages/Pods.tsx
git commit -m "feat: add ai diagnostic panel and wire to pods page"
```

---

## Task 4: Cluster Overview Page

**Files:**
- Create: `web/src/pages/Overview.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Create `web/src/pages/Overview.tsx`**

```typescript
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { fetchNodes, fetchPods, fetchEvents, fetchNamespaceSummaries } from '@/lib/api'
import type { NodeSummary, PodSummary, EventSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const UNHEALTHY_STATUSES = ['CrashLoopBackOff', 'Error', 'OOMKilled', 'Failed', 'ImagePullBackOff', 'ErrImagePull']

function StatCard({ label, value, sub, color }: { label: string; value: number | string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid #e0e7ff', borderRadius: 10,
      padding: 16, minWidth: 120,
    }}>
      <div style={{ fontSize: 11, color: '#6366f1', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: color ?? '#1e1b4b' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

export function Overview() {
  const [nodes, setNodes] = useState<NodeSummary[]>([])
  const [pods, setPods] = useState<PodSummary[]>([])
  const [events, setEvents] = useState<EventSummary[]>([])
  const [nsCount, setNsCount] = useState(0)

  const load = useCallback(() => {
    fetchNodes().then(setNodes).catch(console.error)
    fetchPods('').then(setPods).catch(console.error)
    fetchEvents('').then((evts) => {
      setEvents(evts.filter((e) => e.type === 'Warning').slice(0, 10))
    }).catch(console.error)
    fetchNamespaceSummaries().then((ns) => setNsCount(ns.length)).catch(console.error)
  }, [])

  useEffect(() => { load() }, [load])

  const readyNodes = nodes.filter((n) => n.status === 'Ready').length
  const unhealthyPods = pods.filter((p) => UNHEALTHY_STATUSES.some((s) => p.status.includes(s)))
  const runningPods = pods.filter((p) => p.status === 'Running').length

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-base font-bold text-primary-900">Cluster Overview</h1>
        <button onClick={load} className="text-xs text-primary-600 hover:bg-primary-50 px-2 py-1 rounded border border-primary-200">↻ Refresh</button>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <StatCard label="Nodes" value={`${readyNodes}/${nodes.length}`}
          sub="Ready" color={readyNodes < nodes.length ? '#dc2626' : '#16a34a'} />
        <StatCard label="Running Pods" value={runningPods} sub={`of ${pods.length} total`} />
        <StatCard label="Unhealthy Pods" value={unhealthyPods.length}
          color={unhealthyPods.length > 0 ? '#dc2626' : '#16a34a'} />
        <StatCard label="Namespaces" value={nsCount} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

        {/* Unhealthy pods */}
        <div style={{ border: '1px solid #fecaca', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#fef2f2', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626' }}>⚠ Unhealthy Pods ({unhealthyPods.length})</span>
            <Link to="/pods" style={{ fontSize: 10, color: '#6366f1', textDecoration: 'none' }}>View All →</Link>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {unhealthyPods.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12, color: '#16a34a', textAlign: 'center' }}>✓ All pods healthy</div>
            ) : (
              unhealthyPods.map((pod) => (
                <div key={`${pod.namespace}/${pod.name}`} style={{
                  padding: '8px 14px', borderBottom: '1px solid #fee2e2',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#1e1b4b' }}>{pod.name}</div>
                    <div style={{ fontSize: 10, color: '#6b7280' }}>{pod.namespace}</div>
                  </div>
                  <span className={cn('text-xs font-medium px-1.5 py-0.5 rounded',
                    'bg-red-50 text-red-600'
                  )}>{pod.status}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Warning events */}
        <div style={{ border: '1px solid #fde68a', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#fffbeb', padding: '8px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>⚡ Recent Warnings ({events.length})</span>
            <Link to="/events" style={{ fontSize: 10, color: '#6366f1', textDecoration: 'none' }}>View All →</Link>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto' }}>
            {events.length === 0 ? (
              <div style={{ padding: 16, fontSize: 12, color: '#16a34a', textAlign: 'center' }}>✓ No recent warnings</div>
            ) : (
              events.map((evt) => (
                <div key={evt.name} style={{ padding: '7px 14px', borderBottom: '1px solid #fef3c7' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e' }}>{evt.reason}</div>
                  <div style={{ fontSize: 10, color: '#78716c' }}>{evt.object} · {evt.namespace}</div>
                  <div style={{ fontSize: 10, color: '#6b7280', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{evt.message}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Node list */}
        <div style={{ border: '1px solid #e0e7ff', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#f0f4ff', padding: '8px 14px', display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#4338ca' }}>🖥 Nodes ({nodes.length})</span>
            <Link to="/nodes" style={{ fontSize: 10, color: '#6366f1', textDecoration: 'none' }}>View All →</Link>
          </div>
          <div style={{ maxHeight: 200, overflowY: 'auto' }}>
            {nodes.map((node) => (
              <div key={node.name} style={{ padding: '7px 14px', borderBottom: '1px solid #e0e7ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: '#1e1b4b', fontWeight: 500 }}>{node.name}</span>
                <span style={{ fontSize: 10, fontWeight: 600, color: node.status === 'Ready' ? '#16a34a' : '#dc2626' }}>
                  ● {node.status}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Update `web/src/App.tsx`** — replace "/" Placeholder with Overview

Add import: `import { Overview } from '@/pages/Overview'`
Change: `<Route path="/" element={<Placeholder title="Cluster Overview" />} />`
To: `<Route path="/" element={<Overview />} />`

- [ ] **Step 3: TypeScript check + tests**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -8
```

- [ ] **Step 4: Commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/pages/Overview.tsx web/src/App.tsx
git commit -m "feat: add cluster overview page with node health, unhealthy pods, and warning events"
```

---

## Task 5: CRD Auto-detect + Conditional Sidebar Items

**Files:**
- Modify: `web/src/components/layout/AppLayout.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update `web/src/components/layout/AppLayout.tsx`** — fetch detected CRDs + pass to Sidebar

Read current AppLayout.tsx, then add:

```typescript
import { fetchNamespaces, fetchContexts, fetchDetectedCRDs } from '@/lib/api'
import type { ContextInfo, CRDPresence } from '@/lib/types'
```

Add state:
```typescript
const [detectedCRDs, setDetectedCRDs] = useState<CRDPresence>({ istio: false, gatewayApi: false, canary: false })
```

Add fetch in the existing useEffect (alongside namespaces and contexts):
```typescript
fetchDetectedCRDs().then(setDetectedCRDs).catch(console.error)
```

Pass to Sidebar:
```typescript
<Sidebar detectedCRDs={detectedCRDs} />
```

- [ ] **Step 2: Update `web/src/components/layout/Sidebar.tsx`** — accept prop + conditional Network items

Read current Sidebar.tsx, then make these changes:

Add import for new icons:
```typescript
import { ..., Layers, Waypoints, Bird } from 'lucide-react'
```

Add `detectedCRDs` prop to `Sidebar`:
```typescript
interface SidebarProps {
  detectedCRDs?: CRDPresence
}

export function Sidebar({ detectedCRDs }: SidebarProps) {
```

Import `CRDPresence`:
```typescript
import type { CRDPresence } from '@/lib/types'
```

Change the Network `navGroups` to use dynamic items. Move navGroups inside the component to use the prop:

```typescript
export function Sidebar({ detectedCRDs }: SidebarProps) {
  const navGroups: NavGroup[] = [
    {
      title: 'Overview',
      items: [
        { label: 'Cluster Overview', to: '/', icon: <LayoutDashboard size={14} /> },
        { label: 'Topology', to: '/topology', icon: <GitBranch size={14} /> },
        { label: 'Events', to: '/events', icon: <Activity size={14} /> },
        { label: 'Top', to: '/top', icon: <BarChart2 size={14} /> },
      ],
    },
    {
      title: 'Workloads',
      items: [
        { label: 'Pods', to: '/pods', icon: <Box size={14} /> },
        { label: 'Deployments', to: '/deployments', icon: <Rocket size={14} /> },
        { label: 'StatefulSets', to: '/statefulsets', icon: <Server size={14} /> },
      ],
    },
    {
      title: 'Network',
      items: [
        { label: 'Services', to: '/services', icon: <Globe size={14} /> },
        ...(detectedCRDs?.istio ? [{ label: 'Istio', to: '/istio', icon: <Layers size={14} /> }] : []),
        ...(detectedCRDs?.gatewayApi ? [{ label: 'Gateway API', to: '/gateway', icon: <Waypoints size={14} /> }] : []),
        ...(detectedCRDs?.canary ? [{ label: 'Canary', to: '/canary', icon: <Bird size={14} /> }] : []),
      ],
    },
    {
      title: 'Config & Storage',
      items: [
        { label: 'ConfigMaps', to: '/configmaps', icon: <Settings size={14} /> },
        { label: 'Secrets', to: '/secrets', icon: <Lock size={14} /> },
      ],
    },
    {
      title: 'Cluster',
      items: [
        { label: 'Nodes', to: '/nodes', icon: <Cpu size={14} /> },
        { label: 'Namespaces', to: '/namespaces', icon: <FolderOpen size={14} /> },
        { label: 'Resource Explorer', to: '/explorer', icon: <Telescope size={14} /> },
      ],
    },
  ]

  return (
    <aside className="w-48 bg-[#f8f7ff] border-r border-primary-100 flex-shrink-0 overflow-y-auto">
      <div className="px-3 py-4">
        <div className="mb-6">
          <span className="text-base font-bold text-primary-600">k999s</span>
        </div>
        <div className="space-y-4">
          {navGroups.map((group) => (
            <div key={group.title}>
              <p className="text-[9px] font-bold text-primary-500/60 uppercase tracking-widest mb-1 px-2">
                {group.title}
              </p>
              <nav className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-2 px-2 py-1.5 rounded-md text-[11px] font-medium transition-colors',
                        isActive
                          ? 'bg-primary-600 text-white'
                          : 'text-primary-700 hover:bg-primary-100',
                      )
                    }
                  >
                    {item.icon}
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          ))}
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Step 3: Update Sidebar test** — pass empty detectedCRDs prop

In `web/src/components/layout/Sidebar.test.tsx`, update renders to pass prop:
```typescript
render(<MemoryRouter><Sidebar detectedCRDs={{ istio: false, gatewayApi: false, canary: false }} /></MemoryRouter>)
```

Both test renders need this update.

- [ ] **Step 4: TypeScript check + ALL tests**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard/web
npx tsc --noEmit 2>&1 | head -10
npx vitest run 2>&1 | tail -10
go test ./... 2>&1 | tail -8
```

Expected: all PASS

- [ ] **Step 5: Final commit**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git add web/src/components/layout/
git commit -m "feat: add crd auto-detect conditional sidebar items (istio, gateway api, canary)"
```

---

## Verification Checklist

- [ ] `go test ./...` → PASS
- [ ] `cd web && npx vitest run` → PASS
- [ ] `go build ./cmd/k999s` → binary builds
- [ ] `./k999s --version` → shows version
- [ ] `/` → Cluster Overview shows node health, unhealthy pods, recent warnings
- [ ] Pods page → 🔍 AI button → opens diagnostic panel → streams analysis
- [ ] No AI key → panel shows config instructions instead of crashing
- [ ] `make build` → rebuilds binary with all Plan 5 features

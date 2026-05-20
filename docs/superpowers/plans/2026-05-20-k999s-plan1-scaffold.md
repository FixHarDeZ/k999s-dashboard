# k999s — Plan 1: Go Scaffold + Core API + React Layout

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Go binary ที่ start ได้, อ่าน kubeconfig, serve REST API สำหรับ pods/deployments/namespaces/contexts พร้อม React frontend แสดง sidebar layout + pods table

**Architecture:** Go binary (gin HTTP server) embed React build ด้วย `go:embed`. Development mode: Vite dev server proxy ไป Go backend. Production: `go build` ได้ binary เดียว. K8s client ใช้ `client-go` + fake client สำหรับ unit tests.

**Tech Stack:** Go 1.22+, gin, client-go, gorilla/websocket, React 18, TypeScript, Vite, Tailwind CSS v3, shadcn/ui, TanStack Table v8, testify, vitest, @testing-library/react

---

## File Map

```
k999s-dashboard/
├── cmd/k999s/main.go                    ← entrypoint
├── internal/
│   ├── config/
│   │   ├── config.go                    ← load ~/.k999s/config.yaml + kubeconfig paths
│   │   └── config_test.go
│   ├── k8s/
│   │   ├── client.go                    ← Client interface + real implementation
│   │   ├── client_test.go               ← tests with fake client
│   │   └── types.go                     ← Go types for API responses
│   └── api/
│       ├── router.go                    ← gin router wiring
│       ├── handlers.go                  ← REST handlers (contexts, namespaces, pods, deployments)
│       └── handlers_test.go
├── web/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                      ← router setup
│   │   ├── lib/
│   │   │   ├── api.ts                   ← REST client functions
│   │   │   └── types.ts                 ← TypeScript types matching Go types
│   │   ├── components/
│   │   │   ├── layout/
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── TopBar.tsx
│   │   │   │   └── AppLayout.tsx
│   │   │   └── ui/                      ← shadcn/ui components (auto-generated)
│   │   └── pages/
│   │       ├── Overview.tsx             ← placeholder
│   │       └── Pods.tsx                 ← pods table
│   └── index.html
├── go.mod
├── go.sum
├── Makefile
└── .gitignore
```

---

## Task 1: Go Module + Project Structure

**Files:**
- Create: `go.mod`
- Create: `cmd/k999s/main.go`
- Create: `.gitignore`
- Create: `Makefile`

- [ ] **Step 1: Init Go module**

```bash
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard
git init
go mod init github.com/k999s/dashboard
```

Expected: `go.mod` created with `module github.com/k999s/dashboard`

- [ ] **Step 2: Create directory structure**

```bash
mkdir -p cmd/k999s internal/config internal/k8s internal/api web/src
```

- [ ] **Step 3: Create `cmd/k999s/main.go`**

```go
package main

import (
	"flag"
	"fmt"
	"log"
	"os/exec"
	"runtime"

	"github.com/k999s/dashboard/internal/api"
	"github.com/k999s/dashboard/internal/config"
	"github.com/k999s/dashboard/internal/k8s"
)

func main() {
	port := flag.Int("port", 8080, "HTTP server port")
	kubeconfig := flag.String("kubeconfig", "", "Path to kubeconfig (default: ~/.kube/config)")
	flag.Parse()

	cfg, err := config.Load(*kubeconfig)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	k8sClient, err := k8s.NewClient(cfg.KubeconfigPath, cfg.CurrentContext)
	if err != nil {
		log.Fatalf("failed to create k8s client: %v", err)
	}

	router := api.NewRouter(k8sClient)
	addr := fmt.Sprintf(":%d", *port)
	url := fmt.Sprintf("http://localhost:%d", *port)

	log.Printf("k999s starting on %s", url)
	go openBrowser(url)

	if err := router.Run(addr); err != nil {
		log.Fatalf("server failed: %v", err)
	}
}

func openBrowser(url string) {
	var cmd string
	var args []string
	switch runtime.GOOS {
	case "darwin":
		cmd, args = "open", []string{url}
	case "linux":
		cmd, args = "xdg-open", []string{url}
	default:
		cmd, args = "cmd", []string{"/c", "start", url}
	}
	_ = exec.Command(cmd, args...).Start()
}
```

- [ ] **Step 4: Create `Makefile`**

```makefile
.PHONY: dev build test

dev:
	@echo "Starting dev mode..."
	@(cd web && npm run dev) &
	@go run ./cmd/k999s --port 8080

build:
	@echo "Building frontend..."
	cd web && npm run build
	@echo "Building Go binary..."
	go build -o k999s ./cmd/k999s

test:
	go test ./... -v

lint:
	golangci-lint run
```

- [ ] **Step 5: Create `.gitignore`**

```
k999s
web/node_modules/
web/dist/
.superpowers/
*.env
```

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: init go module and project structure"
```

---

## Task 2: Config System

**Files:**
- Create: `internal/config/config.go`
- Create: `internal/config/config_test.go`

- [ ] **Step 1: Write failing test**

```go
// internal/config/config_test.go
package config_test

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/k999s/dashboard/internal/config"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestLoad_DefaultKubeconfigPath(t *testing.T) {
	home, _ := os.UserHomeDir()
	cfg, err := config.Load("")
	require.NoError(t, err)
	assert.Equal(t, filepath.Join(home, ".kube", "config"), cfg.KubeconfigPath)
}

func TestLoad_CustomKubeconfigPath(t *testing.T) {
	cfg, err := config.Load("/custom/path/kubeconfig")
	require.NoError(t, err)
	assert.Equal(t, "/custom/path/kubeconfig", cfg.KubeconfigPath)
}

func TestLoad_AIDefaults(t *testing.T) {
	cfg, err := config.Load("")
	require.NoError(t, err)
	assert.Equal(t, "ollama", cfg.AI.Provider)
	assert.Equal(t, "llama3.2", cfg.AI.Model)
}
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
go test ./internal/config/... -v
```

Expected: `cannot find package "github.com/k999s/dashboard/internal/config"`

- [ ] **Step 3: Install testify**

```bash
go get github.com/stretchr/testify
```

- [ ] **Step 4: Implement `internal/config/config.go`**

```go
package config

import (
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

type AIConfig struct {
	Provider string `yaml:"provider"`
	APIKey   string `yaml:"api_key"`
	Model    string `yaml:"model"`
	BaseURL  string `yaml:"base_url"`
}

type Config struct {
	KubeconfigPath string   `yaml:"-"`
	CurrentContext string   `yaml:"current_context"`
	AI             AIConfig `yaml:"ai"`
}

func Load(kubeconfigPath string) (*Config, error) {
	if kubeconfigPath == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}
		kubeconfigPath = filepath.Join(home, ".kube", "config")
	}

	cfg := &Config{
		KubeconfigPath: kubeconfigPath,
		AI: AIConfig{
			Provider: "ollama",
			Model:    "llama3.2",
		},
	}

	appConfigPath := appConfigPath()
	data, err := os.ReadFile(appConfigPath)
	if err != nil && !os.IsNotExist(err) {
		return nil, err
	}
	if err == nil {
		if err := yaml.Unmarshal(data, cfg); err != nil {
			return nil, err
		}
		cfg.KubeconfigPath = kubeconfigPath
	}

	return cfg, nil
}

func appConfigPath() string {
	home, _ := os.UserHomeDir()
	return filepath.Join(home, ".k999s", "config.yaml")
}
```

- [ ] **Step 5: Install yaml dependency**

```bash
go get gopkg.in/yaml.v3
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
go test ./internal/config/... -v
```

Expected: `PASS` for all 3 tests

- [ ] **Step 7: Commit**

```bash
git add internal/config/
git commit -m "feat: add config system with kubeconfig path and AI provider defaults"
```

---

## Task 3: K8s Client Interface + Implementation

**Files:**
- Create: `internal/k8s/types.go`
- Create: `internal/k8s/client.go`
- Create: `internal/k8s/client_test.go`

- [ ] **Step 1: Install client-go**

```bash
go get k8s.io/client-go@latest
go get k8s.io/api@latest
go get k8s.io/apimachinery@latest
```

- [ ] **Step 2: Create `internal/k8s/types.go`** — response types สำหรับ API

```go
package k8s

// PodSummary is the API response type for pod list items.
type PodSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Status    string `json:"status"`
	Ready     string `json:"ready"`
	Restarts  int32  `json:"restarts"`
	Age       string `json:"age"`
	Node      string `json:"node"`
	IP        string `json:"ip"`
}

// DeploymentSummary is the API response type for deployment list items.
type DeploymentSummary struct {
	Name      string `json:"name"`
	Namespace string `json:"namespace"`
	Ready     string `json:"ready"`
	UpToDate  int32  `json:"upToDate"`
	Available int32  `json:"available"`
	Age       string `json:"age"`
}

// ContextInfo holds kubeconfig context information.
type ContextInfo struct {
	Name    string `json:"name"`
	Current bool   `json:"current"`
	Cluster string `json:"cluster"`
}
```

- [ ] **Step 3: Write failing tests**

```go
// internal/k8s/client_test.go
package k8s_test

import (
	"context"
	"testing"

	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestListPods_ReturnsPodsInNamespace(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "default"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
		},
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "pod-2", Namespace: "other"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
		},
	)

	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	pods, err := client.ListPods(context.Background(), "default")

	require.NoError(t, err)
	assert.Len(t, pods, 1)
	assert.Equal(t, "pod-1", pods[0].Name)
}

func TestListPods_AllNamespaces(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "pod-1", Namespace: "default"}},
		&corev1.Pod{ObjectMeta: metav1.ObjectMeta{Name: "pod-2", Namespace: "other"}},
	)

	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	pods, err := client.ListPods(context.Background(), "")

	require.NoError(t, err)
	assert.Len(t, pods, 2)
}

func TestListNamespaces_ReturnsList(t *testing.T) {
	fakeClient := fake.NewSimpleClientset(
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "default"}},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "kube-system"}},
	)

	client := k8s.NewClientFromKubernetesClient(fakeClient, "")
	namespaces, err := client.ListNamespaces(context.Background())

	require.NoError(t, err)
	assert.Len(t, namespaces, 2)
}
```

- [ ] **Step 4: Run tests — expect FAIL**

```bash
go test ./internal/k8s/... -v
```

Expected: `FAIL` — `NewClientFromKubernetesClient` undefined

- [ ] **Step 5: Implement `internal/k8s/client.go`**

```go
package k8s

import (
	"context"
	"fmt"
	"time"

	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/tools/clientcmd"
)

// Client wraps the Kubernetes clientset with domain-specific methods.
type Client struct {
	kube           kubernetes.Interface
	currentContext string
	kubeconfigPath string
}

// NewClient creates a real client from kubeconfig file.
func NewClient(kubeconfigPath, context string) (*Client, error) {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	if kubeconfigPath != "" {
		loadingRules.ExplicitPath = kubeconfigPath
	}
	configOverrides := &clientcmd.ConfigOverrides{}
	if context != "" {
		configOverrides.CurrentContext = context
	}
	kubeConfig := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(loadingRules, configOverrides)
	restConfig, err := kubeConfig.ClientConfig()
	if err != nil {
		return nil, fmt.Errorf("build rest config: %w", err)
	}
	clientset, err := kubernetes.NewForConfig(restConfig)
	if err != nil {
		return nil, fmt.Errorf("create clientset: %w", err)
	}
	rawConfig, _ := kubeConfig.RawConfig()
	return &Client{kube: clientset, currentContext: rawConfig.CurrentContext, kubeconfigPath: kubeconfigPath}, nil
}

// NewClientFromKubernetesClient creates a client from an existing kubernetes.Interface (for testing).
func NewClientFromKubernetesClient(kube kubernetes.Interface, context string) *Client {
	return &Client{kube: kube, currentContext: context}
}

func (c *Client) ListPods(ctx context.Context, namespace string) ([]PodSummary, error) {
	list, err := c.kube.CoreV1().Pods(namespace).List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	summaries := make([]PodSummary, 0, len(list.Items))
	for _, p := range list.Items {
		summaries = append(summaries, toPodSummary(p))
	}
	return summaries, nil
}

func (c *Client) ListNamespaces(ctx context.Context) ([]string, error) {
	list, err := c.kube.CoreV1().Namespaces().List(ctx, metav1.ListOptions{})
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(list.Items))
	for _, ns := range list.Items {
		names = append(names, ns.Name)
	}
	return names, nil
}

func (c *Client) GetContexts() ([]ContextInfo, error) {
	loadingRules := clientcmd.NewDefaultClientConfigLoadingRules()
	if c.kubeconfigPath != "" {
		loadingRules.ExplicitPath = c.kubeconfigPath
	}
	rawConfig, err := clientcmd.NewNonInteractiveDeferredLoadingClientConfig(
		loadingRules, &clientcmd.ConfigOverrides{},
	).RawConfig()
	if err != nil {
		return nil, err
	}
	contexts := make([]ContextInfo, 0, len(rawConfig.Contexts))
	for name, ctx := range rawConfig.Contexts {
		contexts = append(contexts, ContextInfo{
			Name:    name,
			Current: name == rawConfig.CurrentContext,
			Cluster: ctx.Cluster,
		})
	}
	return contexts, nil
}

func toPodSummary(p corev1.Pod) PodSummary {
	readyCount := 0
	totalCount := len(p.Spec.Containers)
	var restarts int32
	for _, cs := range p.Status.ContainerStatuses {
		if cs.Ready {
			readyCount++
		}
		restarts += cs.RestartCount
	}
	return PodSummary{
		Name:      p.Name,
		Namespace: p.Namespace,
		Status:    string(p.Status.Phase),
		Ready:     fmt.Sprintf("%d/%d", readyCount, totalCount),
		Restarts:  restarts,
		Age:       formatAge(p.CreationTimestamp.Time),
		Node:      p.Spec.NodeName,
		IP:        p.Status.PodIP,
	}
}

func formatAge(t time.Time) string {
	d := time.Since(t)
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%dm", int(d.Minutes()))
	case d < 24*time.Hour:
		return fmt.Sprintf("%dh", int(d.Hours()))
	default:
		return fmt.Sprintf("%dd", int(d.Hours()/24))
	}
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
go test ./internal/k8s/... -v
```

Expected: `PASS` for all 3 tests

- [ ] **Step 7: Commit**

```bash
git add internal/k8s/
git commit -m "feat: add k8s client with ListPods, ListNamespaces, GetContexts"
```

---

## Task 4: REST API Handlers

**Files:**
- Create: `internal/api/router.go`
- Create: `internal/api/handlers.go`
- Create: `internal/api/handlers_test.go`

- [ ] **Step 1: Install gin**

```bash
go get github.com/gin-gonic/gin
```

- [ ] **Step 2: Write failing handler tests**

```go
// internal/api/handlers_test.go
package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/k999s/dashboard/internal/api"
	"github.com/k999s/dashboard/internal/k8s"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func newTestRouter() *api.Router {
	fakeK8s := fake.NewSimpleClientset(
		&corev1.Pod{
			ObjectMeta: metav1.ObjectMeta{Name: "nginx", Namespace: "default"},
			Status:     corev1.PodStatus{Phase: corev1.PodRunning},
		},
		&corev1.Namespace{ObjectMeta: metav1.ObjectMeta{Name: "default"}},
	)
	client := k8s.NewClientFromKubernetesClient(fakeK8s, "test-context")
	return api.NewRouter(client)
}

func TestGetPods_ReturnsJSON(t *testing.T) {
	router := newTestRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/pods?namespace=default", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Items []k8s.PodSummary `json:"items"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Len(t, resp.Items, 1)
	assert.Equal(t, "nginx", resp.Items[0].Name)
}

func TestGetNamespaces_ReturnsList(t *testing.T) {
	router := newTestRouter()
	w := httptest.NewRecorder()
	req, _ := http.NewRequest("GET", "/api/v1/namespaces", nil)
	router.ServeHTTP(w, req)

	assert.Equal(t, http.StatusOK, w.Code)
	var resp struct {
		Items []string `json:"items"`
	}
	require.NoError(t, json.Unmarshal(w.Body.Bytes(), &resp))
	assert.Contains(t, resp.Items, "default")
}
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
go test ./internal/api/... -v
```

Expected: `FAIL` — `api.NewRouter` undefined

- [ ] **Step 4: Create `internal/api/router.go`**

```go
package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/k999s/dashboard/internal/k8s"
)

// Router wraps gin.Engine and holds dependencies.
type Router struct {
	engine *gin.Engine
	k8s    *k8s.Client
}

// NewRouter wires all HTTP routes.
func NewRouter(k8sClient *k8s.Client) *Router {
	gin.SetMode(gin.ReleaseMode)
	r := &Router{engine: gin.New(), k8s: k8sClient}
	r.engine.Use(gin.Recovery())
	r.engine.Use(corsMiddleware())

	v1 := r.engine.Group("/api/v1")
	v1.GET("/pods", r.handleListPods)
	v1.GET("/namespaces", r.handleListNamespaces)
	v1.GET("/contexts", r.handleListContexts)

	// Serve React SPA — handled in Task 9 (go:embed)
	r.engine.NoRoute(func(c *gin.Context) {
		c.JSON(http.StatusNotFound, gin.H{"error": "not found"})
	})

	return r
}

// ServeHTTP implements http.Handler for testing.
func (r *Router) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	r.engine.ServeHTTP(w, req)
}

// Run starts the HTTP server.
func (r *Router) Run(addr string) error {
	return r.engine.Run(addr)
}

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

- [ ] **Step 5: Create `internal/api/handlers.go`**

```go
package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func (r *Router) handleListPods(c *gin.Context) {
	namespace := c.Query("namespace")
	pods, err := r.k8s.ListPods(c.Request.Context(), namespace)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": pods})
}

func (r *Router) handleListNamespaces(c *gin.Context) {
	namespaces, err := r.k8s.ListNamespaces(c.Request.Context())
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": namespaces})
}

func (r *Router) handleListContexts(c *gin.Context) {
	contexts, err := r.k8s.GetContexts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"items": contexts})
}
```

- [ ] **Step 6: Run tests — expect PASS**

```bash
go test ./internal/api/... -v
```

Expected: `PASS` for all 2 tests

- [ ] **Step 7: Verify binary compiles**

```bash
go build ./cmd/k999s
```

Expected: `k999s` binary created, no errors

- [ ] **Step 8: Commit**

```bash
git add internal/api/ cmd/
git commit -m "feat: add gin REST API with pods, namespaces, contexts endpoints"
```

---

## Task 5: React Frontend Scaffold

**Files:**
- Create: `web/package.json`
- Create: `web/vite.config.ts`
- Create: `web/tailwind.config.ts`
- Create: `web/index.html`
- Create: `web/src/main.tsx`

- [ ] **Step 1: Scaffold Vite + React + TypeScript**

```bash
cd web
npm create vite@latest . -- --template react-ts
npm install
```

- [ ] **Step 2: Install dependencies**

```bash
npm install tailwindcss @tailwindcss/vite
npm install react-router-dom
npm install @tanstack/react-table
npm install lucide-react
npm install clsx tailwind-merge
npm install -D @testing-library/react @testing-library/jest-dom vitest jsdom @vitejs/plugin-react
```

- [ ] **Step 3: Update `web/vite.config.ts`**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8080',
      '/ws': { target: 'ws://localhost:8080', ws: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
```

- [ ] **Step 4: Create `web/src/test-setup.ts`**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 5: Create `web/tailwind.config.ts`**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eef2ff',
          100: '#e0e7ff',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          900: '#1e1b4b',
        },
      },
    },
  },
} satisfies Config
```

- [ ] **Step 6: Update `web/src/main.tsx`**

```typescript
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
```

- [ ] **Step 7: Update `web/src/index.css`**

```css
@import "tailwindcss";
```

- [ ] **Step 8: Verify frontend runs**

```bash
cd web && npm run dev
```

Expected: Vite dev server starts at http://localhost:5173

- [ ] **Step 9: Commit**

```bash
cd ..
git add web/
git commit -m "feat: scaffold react frontend with vite, tailwind, react-router"
```

---

## Task 6: TypeScript Types + API Client

**Files:**
- Create: `web/src/lib/types.ts`
- Create: `web/src/lib/api.ts`
- Create: `web/src/lib/api.test.ts`

- [ ] **Step 1: Create `web/src/lib/types.ts`**

```typescript
export interface PodSummary {
  name: string
  namespace: string
  status: 'Running' | 'Pending' | 'Succeeded' | 'Failed' | 'Unknown' | string
  ready: string
  restarts: number
  age: string
  node: string
  ip: string
}

export interface DeploymentSummary {
  name: string
  namespace: string
  ready: string
  upToDate: number
  available: number
  age: string
}

export interface ContextInfo {
  name: string
  current: boolean
  cluster: string
}

export interface ListResponse<T> {
  items: T[]
}
```

- [ ] **Step 2: Write failing API client tests**

```typescript
// web/src/lib/api.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchPods, fetchNamespaces, fetchContexts } from './api'

const mockFetch = vi.fn()
global.fetch = mockFetch

beforeEach(() => mockFetch.mockReset())

describe('fetchPods', () => {
  it('calls correct endpoint with namespace', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ name: 'pod-1', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '1h', node: 'node-1', ip: '10.0.0.1' }] }),
    })

    const result = await fetchPods('default')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/pods?namespace=default')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('pod-1')
  })

  it('fetches all namespaces when namespace is empty', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
    await fetchPods('')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/pods?namespace=')
  })
})

describe('fetchNamespaces', () => {
  it('returns namespace list', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: ['default', 'kube-system'] }) })
    const result = await fetchNamespaces()
    expect(result).toEqual(['default', 'kube-system'])
  })
})
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
cd web && npx vitest run src/lib/api.test.ts
```

Expected: `FAIL` — `fetchPods` not found

- [ ] **Step 4: Implement `web/src/lib/api.ts`**

```typescript
import type { PodSummary, DeploymentSummary, ContextInfo } from './types'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function fetchPods(namespace: string): Promise<PodSummary[]> {
  const data = await get<{ items: PodSummary[] }>(`/api/v1/pods?namespace=${namespace}`)
  return data.items
}

export async function fetchNamespaces(): Promise<string[]> {
  const data = await get<{ items: string[] }>('/api/v1/namespaces')
  return data.items
}

export async function fetchContexts(): Promise<ContextInfo[]> {
  const data = await get<{ items: ContextInfo[] }>('/api/v1/contexts')
  return data.items
}

export async function fetchDeployments(namespace: string): Promise<DeploymentSummary[]> {
  const data = await get<{ items: DeploymentSummary[] }>(`/api/v1/deployments?namespace=${namespace}`)
  return data.items
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npx vitest run src/lib/api.test.ts
```

Expected: `PASS` all 3 tests

- [ ] **Step 6: Commit**

```bash
cd ..
git add web/src/lib/
git commit -m "feat: add typescript types and REST API client"
```

---

## Task 7: App Layout — Sidebar + TopBar

**Files:**
- Create: `web/src/components/layout/AppLayout.tsx`
- Create: `web/src/components/layout/Sidebar.tsx`
- Create: `web/src/components/layout/TopBar.tsx`
- Create: `web/src/components/layout/Sidebar.test.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1: Write failing Sidebar test**

```typescript
// web/src/components/layout/Sidebar.test.tsx
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('renders all main navigation sections', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(screen.getByText('Pods')).toBeInTheDocument()
    expect(screen.getByText('Deployments')).toBeInTheDocument()
    expect(screen.getByText('Services')).toBeInTheDocument()
    expect(screen.getByText('Nodes')).toBeInTheDocument()
  })

  it('renders k999s brand', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(screen.getByText('k999s')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd web && npx vitest run src/components/layout/Sidebar.test.tsx
```

Expected: `FAIL` — `Sidebar` not found

- [ ] **Step 3: Create `web/src/components/layout/Sidebar.tsx`**

```typescript
import { NavLink } from 'react-router-dom'
import { Box, Rocket, Globe, Settings, Server, FolderOpen, Telescope, LayoutDashboard, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  to: string
  icon: React.ReactNode
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const navGroups: NavGroup[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Cluster Overview', to: '/', icon: <LayoutDashboard size={14} /> },
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
    ],
  },
  {
    title: 'Config & Storage',
    items: [
      { label: 'ConfigMaps', to: '/configmaps', icon: <Settings size={14} /> },
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

export function Sidebar() {
  return (
    <aside className="w-48 bg-[#f8f7ff] border-r border-primary-100 flex-shrink-0 overflow-y-auto">
      <div className="px-3 py-4 space-y-4">
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
    </aside>
  )
}
```

- [ ] **Step 4: Create `web/src/lib/utils.ts`** (needed by Sidebar)

```typescript
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

- [ ] **Step 5: Create `web/src/components/layout/TopBar.tsx`**

```typescript
import { ChevronDown } from 'lucide-react'

interface TopBarProps {
  context: string
  namespace: string
  namespaces: string[]
  contexts: string[]
  onNamespaceChange: (ns: string) => void
  onContextChange: (ctx: string) => void
}

export function TopBar({ context, namespace, namespaces, contexts, onNamespaceChange, onContextChange }: TopBarProps) {
  return (
    <header className="bg-primary-600 text-white h-11 flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-3">
        <span className="font-bold text-sm tracking-tight">k999s</span>

        <select
          value={context}
          onChange={(e) => onContextChange(e.target.value)}
          className="bg-white/15 rounded-md px-2 py-1 text-[11px] border-0 outline-none cursor-pointer hover:bg-white/20"
        >
          {contexts.map((ctx) => (
            <option key={ctx} value={ctx} className="text-black">{ctx}</option>
          ))}
        </select>

        <select
          value={namespace}
          onChange={(e) => onNamespaceChange(e.target.value)}
          className="bg-white/15 rounded-md px-2 py-1 text-[11px] border-0 outline-none cursor-pointer hover:bg-white/20"
        >
          <option value="">All Namespaces</option>
          {namespaces.map((ns) => (
            <option key={ns} value={ns} className="text-black">{ns}</option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-white/70">
        <ChevronDown size={14} />
      </div>
    </header>
  )
}
```

- [ ] **Step 6: Create `web/src/components/layout/AppLayout.tsx`**

```typescript
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { useState, useEffect } from 'react'
import { fetchNamespaces, fetchContexts } from '@/lib/api'
import type { ContextInfo } from '@/lib/types'

export function AppLayout() {
  const [namespace, setNamespace] = useState('')
  const [namespaces, setNamespaces] = useState<string[]>([])
  const [contexts, setContexts] = useState<ContextInfo[]>([])
  const [currentContext, setCurrentContext] = useState('')

  useEffect(() => {
    fetchNamespaces().then(setNamespaces).catch(console.error)
    fetchContexts().then((ctxs) => {
      setContexts(ctxs)
      const current = ctxs.find((c) => c.current)
      if (current) setCurrentContext(current.name)
    }).catch(console.error)
  }, [])

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-white">
      <TopBar
        context={currentContext}
        namespace={namespace}
        namespaces={namespaces}
        contexts={contexts.map((c) => c.name)}
        onNamespaceChange={setNamespace}
        onContextChange={setCurrentContext}
      />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-auto p-4">
          <Outlet context={{ namespace }} />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Update `web/src/App.tsx`** — ยังใช้ Placeholder สำหรับ /pods (Pods component จะสร้างใน Task 8)

```typescript
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'

function Placeholder({ title }: { title: string }) {
  return <div className="text-primary-700 font-medium">{title} — coming soon</div>
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Placeholder title="Cluster Overview" />} />
        <Route path="/pods" element={<Placeholder title="Pods" />} />
        <Route path="/deployments" element={<Placeholder title="Deployments" />} />
        <Route path="/statefulsets" element={<Placeholder title="StatefulSets" />} />
        <Route path="/services" element={<Placeholder title="Services" />} />
        <Route path="/configmaps" element={<Placeholder title="ConfigMaps" />} />
        <Route path="/nodes" element={<Placeholder title="Nodes" />} />
        <Route path="/namespaces" element={<Placeholder title="Namespaces" />} />
        <Route path="/explorer" element={<Placeholder title="Resource Explorer" />} />
      </Route>
    </Routes>
  )
}
```

- [ ] **Step 8: Run Sidebar tests — expect PASS**

```bash
cd web && npx vitest run src/components/layout/Sidebar.test.tsx
```

Expected: `PASS` all 2 tests

- [ ] **Step 9: Commit**

```bash
cd ..
git add web/src/
git commit -m "feat: add app layout with sidebar and top bar navigation"
```

---

## Task 8: Pods Page with TanStack Table

**Files:**
- Create: `web/src/pages/Pods.tsx`
- Create: `web/src/pages/Pods.test.tsx`

- [ ] **Step 1: Write failing test**

```typescript
// web/src/pages/Pods.test.tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Pods } from './Pods'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockPods = [
  { name: 'nginx-abc', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '2h', node: 'node-1', ip: '10.0.0.1' },
  { name: 'crash-pod', namespace: 'default', status: 'CrashLoopBackOff', ready: '0/1', restarts: 5, age: '30m', node: 'node-2', ip: '10.0.0.2' },
]

function renderPods() {
  return render(
    <MemoryRouter initialEntries={['/pods']}>
      <Routes>
        <Route path="/pods" element={<Pods />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Pods page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchPods).mockResolvedValue(mockPods)
  })

  it('renders pod names after loading', async () => {
    renderPods()
    await waitFor(() => expect(screen.getByText('nginx-abc')).toBeInTheDocument())
    expect(screen.getByText('crash-pod')).toBeInTheDocument()
  })

  it('shows Running status in green', async () => {
    renderPods()
    await waitFor(() => screen.getByText('nginx-abc'))
    const statusEl = screen.getByText('Running')
    expect(statusEl.className).toContain('text-green')
  })

  it('highlights CrashLoopBackOff pods', async () => {
    renderPods()
    await waitFor(() => screen.getByText('crash-pod'))
    const statusEl = screen.getByText('CrashLoopBackOff')
    expect(statusEl.className).toContain('text-red')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
cd web && npx vitest run src/pages/Pods.test.tsx
```

Expected: `FAIL` — `Pods` not found

- [ ] **Step 3: Create `web/src/pages/Pods.tsx`**

```typescript
import { useEffect, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  type SortingState,
} from '@tanstack/react-table'
import { RefreshCw, Trash2, Terminal, FileText } from 'lucide-react'
import { fetchPods } from '@/lib/api'
import type { PodSummary } from '@/lib/types'
import { cn } from '@/lib/utils'

const columnHelper = createColumnHelper<PodSummary>()

function StatusBadge({ status }: { status: string }) {
  const isHealthy = status === 'Running' || status === 'Succeeded'
  const isError = ['CrashLoopBackOff', 'Error', 'OOMKilled', 'Failed'].includes(status)
  return (
    <span className={cn('text-xs font-medium', isHealthy ? 'text-green-600' : isError ? 'text-red-600' : 'text-yellow-600')}>
      ● {status}
    </span>
  )
}

const columns = [
  columnHelper.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-primary-900 text-xs">{i.getValue()}</span> }),
  columnHelper.accessor('namespace', { header: 'Namespace', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  columnHelper.accessor('status', { header: 'Status', cell: (i) => <StatusBadge status={i.getValue()} /> }),
  columnHelper.accessor('ready', { header: 'Ready', cell: (i) => <span className="text-xs">{i.getValue()}</span> }),
  columnHelper.accessor('restarts', { header: 'Restarts', cell: (i) => <span className={cn('text-xs', i.getValue() > 0 ? 'text-red-500 font-medium' : '')}>{i.getValue()}</span> }),
  columnHelper.accessor('age', { header: 'Age', cell: (i) => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  columnHelper.display({
    id: 'actions',
    header: 'Actions',
    cell: () => (
      <div className="flex gap-1">
        <button className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs flex items-center gap-1"><FileText size={11} />Logs</button>
        <button className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs flex items-center gap-1"><Terminal size={11} />Exec</button>
        <button className="p-1 text-primary-600 hover:bg-primary-50 rounded text-xs flex items-center gap-1"><RefreshCw size={11} />Restart</button>
        <button className="p-1 text-red-500 hover:bg-red-50 rounded text-xs flex items-center gap-1"><Trash2 size={11} />Delete</button>
      </div>
    ),
  }),
]

export function Pods() {
  const { namespace } = useOutletContext<{ namespace: string }>()
  const [pods, setPods] = useState<PodSummary[]>([])
  const [sorting, setSorting] = useState<SortingState>([])
  const [globalFilter, setGlobalFilter] = useState('')

  useEffect(() => {
    fetchPods(namespace).then(setPods).catch(console.error)
  }, [namespace])

  const table = useReactTable({
    data: pods,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const unhealthyCount = pods.filter(p => !['Running', 'Succeeded'].includes(p.status)).length

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Pods</h1>
          <p className="text-[11px] text-primary-500">{pods.length} pods{unhealthyCount > 0 ? ` · ${unhealthyCount} unhealthy` : ''}</p>
        </div>
        <input
          placeholder="Filter pods..."
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-48"
        />
      </div>

      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider cursor-pointer select-none" onClick={h.column.getToggleSortingHandler()}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={cn('border-t border-primary-50 hover:bg-primary-50/50 transition-colors', row.original.status === 'CrashLoopBackOff' || row.original.status === 'Error' ? 'bg-red-50/30' : '')}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Update `web/src/App.tsx`** — แทน Placeholder ของ /pods ด้วย Pods component

```typescript
import { Routes, Route } from 'react-router-dom'
import { AppLayout } from '@/components/layout/AppLayout'
import { Pods } from '@/pages/Pods'

function Placeholder({ title }: { title: string }) {
  return <div className="text-primary-700 font-medium">{title} — coming soon</div>
}

export default function App() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<Placeholder title="Cluster Overview" />} />
        <Route path="/pods" element={<Pods />} />
        <Route path="/deployments" element={<Placeholder title="Deployments" />} />
        <Route path="/statefulsets" element={<Placeholder title="StatefulSets" />} />
        <Route path="/services" element={<Placeholder title="Services" />} />
        <Route path="/configmaps" element={<Placeholder title="ConfigMaps" />} />
        <Route path="/nodes" element={<Placeholder title="Nodes" />} />
        <Route path="/namespaces" element={<Placeholder title="Namespaces" />} />
        <Route path="/explorer" element={<Placeholder title="Resource Explorer" />} />
      </Route>
    </Routes>
  )
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
cd web && npx vitest run src/pages/Pods.test.tsx
```

Expected: `PASS` all 3 tests

- [ ] **Step 6: Add Deployments endpoint to Go backend**

เพิ่มใน `internal/k8s/client.go`:

```go
import (
    appsv1 "k8s.io/api/apps/v1"
)

func (c *Client) ListDeployments(ctx context.Context, namespace string) ([]DeploymentSummary, error) {
    list, err := c.kube.AppsV1().Deployments(namespace).List(ctx, metav1.ListOptions{})
    if err != nil {
        return nil, err
    }
    summaries := make([]DeploymentSummary, 0, len(list.Items))
    for _, d := range list.Items {
        summaries = append(summaries, toDeploymentSummary(d))
    }
    return summaries, nil
}

func toDeploymentSummary(d appsv1.Deployment) DeploymentSummary {
    return DeploymentSummary{
        Name:      d.Name,
        Namespace: d.Namespace,
        Ready:     fmt.Sprintf("%d/%d", d.Status.ReadyReplicas, d.Status.Replicas),
        UpToDate:  d.Status.UpdatedReplicas,
        Available: d.Status.AvailableReplicas,
        Age:       formatAge(d.CreationTimestamp.Time),
    }
}
```

เพิ่มใน `internal/api/router.go`:
```go
v1.GET("/deployments", r.handleListDeployments)
```

เพิ่มใน `internal/api/handlers.go`:
```go
func (r *Router) handleListDeployments(c *gin.Context) {
    namespace := c.Query("namespace")
    deployments, err := r.k8s.ListDeployments(c.Request.Context(), namespace)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, gin.H{"items": deployments})
}
```

- [ ] **Step 7: Run all tests**

```bash
go test ./... -v
cd web && npx vitest run
```

Expected: all `PASS`

- [ ] **Step 8: Commit**

```bash
cd ..
git add .
git commit -m "feat: add pods page with tanstack table, status badges, and action buttons"
```

---

## Task 9: Integration — Full Stack Running

**Files:**
- Modify: `internal/api/router.go` (add SPA fallback)

- [ ] **Step 1: Test full stack manually**

Terminal 1:
```bash
go run ./cmd/k999s --port 8080
```

Terminal 2:
```bash
cd web && npm run dev
```

เปิด http://localhost:5173 → ควรเห็น sidebar + pods table

- [ ] **Step 2: Add `go:embed` stub** (เตรียมสำหรับ production build)

สร้าง `web/dist/.gitkeep`:
```bash
mkdir -p web/dist && touch web/dist/.gitkeep
```

เพิ่มใน `cmd/k999s/main.go`:
```go
import "embed"

//go:embed all:web/dist
var webFS embed.FS
```

ส่ง `webFS` ไปที่ router:
```go
router := api.NewRouter(k8sClient, webFS)
```

อัพเดท `internal/api/router.go` รับ `embed.FS`:
```go
import (
    "embed"
    "io/fs"
    "net/http"
)

func NewRouter(k8sClient *k8s.Client, webFS embed.FS) *Router {
    // ... existing code ...
    sub, _ := fs.Sub(webFS, "web/dist")
    r.engine.NoRoute(func(c *gin.Context) {
        // serve index.html for SPA routes
        http.FileServer(http.FS(sub)).ServeHTTP(c.Writer, c.Request)
    })
    return r
}
```

อัพเดท handler tests ให้ส่ง `embed.FS{}`:
```go
// handlers_test.go — update newTestRouter
func newTestRouter() *api.Router {
    // ...
    return api.NewRouter(client, embed.FS{})
}
```

- [ ] **Step 3: Test production build**

```bash
make build
./k999s
```

Expected: browser เปิด http://localhost:8080 แสดง dashboard

- [ ] **Step 4: Run all tests final check**

```bash
go test ./... && cd web && npx vitest run
```

Expected: all `PASS`

- [ ] **Step 5: Final commit for Plan 1**

```bash
cd ..
git add .
git commit -m "feat: complete plan 1 - go binary with embedded react frontend, pods page working"
```

---

## Verification Checklist

Plan 1 เสร็จแล้วต้องทำได้ทั้งหมดนี้:

- [ ] `make build` → สร้าง `k999s` binary ได้
- [ ] `./k999s` → เปิด browser อัตโนมัติ
- [ ] เห็น sidebar ครบ (Pods, Deployments, Services, Nodes, ฯลฯ)
- [ ] Context switcher + namespace dropdown อยู่ใน top bar
- [ ] `/pods` → เห็น pods table (จาก cluster จริงถ้าเชื่อมต่ออยู่)
- [ ] `go test ./...` → PASS
- [ ] `cd web && npx vitest run` → PASS

---

## Next: Plan 2

**Plan 2** จะครอบคลุม:
- WebSocket hub + K8s informers (live pod status updates)
- Resource pages: Deployments, StatefulSets, DaemonSets, HPA, Jobs, CronJobs
- Services, Ingress, ConfigMaps, Secrets, Nodes, Namespaces pages
- Actions per resource (scale, rollout restart, delete ฯลฯ)

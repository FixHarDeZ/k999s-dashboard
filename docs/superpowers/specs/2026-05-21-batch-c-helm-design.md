# Design Spec: Batch C — Helm Menu (List + Delete)

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Add a Helm releases page to the k999s dashboard. Users can view all Helm releases (filtered by namespace) and uninstall any release with a confirmation dialog.

---

## Architecture

The Go backend wraps the `helm` CLI via `os/exec`. A new `internal/helm` package holds the `Client` struct and its methods. The `Router` gains a `helm *helm.Client` field, constructed from the existing `config.Config` in `NewRouter`. Two new API routes are added. The frontend adds `Helm.tsx` page and a sidebar entry.

---

## Go Backend

### New package: `internal/helm/client.go`

```go
package helm

import (
    "encoding/json"
    "fmt"
    "os/exec"
)

type Client struct {
    kubeconfigPath string
    kubeContext    string
}

func NewClient(kubeconfigPath, kubeContext string) *Client {
    return &Client{kubeconfigPath: kubeconfigPath, kubeContext: kubeContext}
}

// helmListItem mirrors helm list -o json output exactly.
type helmListItem struct {
    Name       string `json:"name"`
    Namespace  string `json:"namespace"`
    Revision   string `json:"revision"`
    Updated    string `json:"updated"`
    Status     string `json:"status"`
    Chart      string `json:"chart"`
    AppVersion string `json:"app_version"`
}

// ReleaseSummary is the API response type.
type ReleaseSummary struct {
    Name       string `json:"name"`
    Namespace  string `json:"namespace"`
    Revision   string `json:"revision"`
    Updated    string `json:"updated"`
    Status     string `json:"status"`
    Chart      string `json:"chart"`
    AppVersion string `json:"appVersion"`
}

// ListReleases runs `helm list -o json`. Pass "" for all namespaces.
func (c *Client) ListReleases(namespace string) ([]ReleaseSummary, error) {
    args := []string{"list", "-o", "json"}
    if namespace == "" {
        args = append(args, "--all-namespaces")
    } else {
        args = append(args, "-n", namespace)
    }
    args = c.appendKubeFlags(args)

    out, err := exec.Command("helm", args...).Output()
    if err != nil {
        return nil, fmt.Errorf("helm list: %w", err)
    }

    var items []helmListItem
    if err := json.Unmarshal(out, &items); err != nil {
        return nil, fmt.Errorf("parse helm output: %w", err)
    }

    summaries := make([]ReleaseSummary, len(items))
    for i, item := range items {
        summaries[i] = ReleaseSummary{
            Name: item.Name, Namespace: item.Namespace, Revision: item.Revision,
            Updated: item.Updated, Status: item.Status, Chart: item.Chart,
            AppVersion: item.AppVersion,
        }
    }
    return summaries, nil
}

// UninstallRelease runs `helm uninstall <name> -n <namespace>`.
func (c *Client) UninstallRelease(namespace, name string) error {
    args := []string{"uninstall", name, "-n", namespace}
    args = c.appendKubeFlags(args)
    if err := exec.Command("helm", args...).Run(); err != nil {
        return fmt.Errorf("helm uninstall %s/%s: %w", namespace, name, err)
    }
    return nil
}

func (c *Client) appendKubeFlags(args []string) []string {
    if c.kubeconfigPath != "" {
        args = append(args, "--kubeconfig", c.kubeconfigPath)
    }
    if c.kubeContext != "" {
        args = append(args, "--kube-context", c.kubeContext)
    }
    return args
}
```

### Router changes

**`internal/api/router.go`**

Add `helm *helmclient.Client` field to `Router` struct (import `helmclient "github.com/k999s/dashboard/internal/helm"`).

In `NewRouter`, initialize it:
```go
r := &Router{
    engine:     gin.New(),
    k8s:        k8sClient,
    hub:        hub,
    diagnostic: diag,
    cfg:        cfg,
    helm:       helmclient.NewClient(cfg.KubeconfigPath, cfg.CurrentContext),
}
```

Add routes (after the settings routes):
```go
v1.GET("/helm/releases", r.handleListHelmReleases)
v1.DELETE("/helm/releases/:namespace/:name", r.handleUninstallHelmRelease)
```

### Handlers

**`internal/api/handlers.go`** — add two handlers:

```go
func (r *Router) handleListHelmReleases(c *gin.Context) {
    namespace := c.Query("namespace")
    items, err := r.helm.ListReleases(namespace)
    if err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.JSON(http.StatusOK, gin.H{"items": items})
}

func (r *Router) handleUninstallHelmRelease(c *gin.Context) {
    namespace := c.Param("namespace")
    name := c.Param("name")
    if err := r.helm.UninstallRelease(namespace, name); err != nil {
        c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
        return
    }
    c.Status(http.StatusNoContent)
}
```

### Testing

Unit testing `helm.Client` is not feasible without mocking `exec.Command`. The compile-level test is: `go build ./...` succeeds. Handler tests in `handlers_test.go` will not add helm tests (helm CLI not available in test environment). No unit tests for this package — covered by integration testing against a real cluster.

---

## TypeScript Frontend

**`web/src/lib/types.ts`** — add:

```ts
export interface HelmReleaseSummary {
  name: string
  namespace: string
  revision: string
  updated: string
  status: string
  chart: string
  appVersion: string
}
```

**`web/src/lib/api.ts`** — add:

```ts
export async function fetchHelmReleases(namespace: string): Promise<HelmReleaseSummary[]> {
  const data = await get<{ items: HelmReleaseSummary[] }>(`/api/v1/helm/releases?namespace=${namespace}`)
  return data.items
}

export const uninstallHelmRelease = (namespace: string, name: string) =>
  action(`/api/v1/helm/releases/${namespace}/${name}`, 'DELETE')
```

**`web/src/pages/Helm.tsx`** — new file:

- Columns: Name, Namespace, Chart, App Version, Status (badge colored by status), Revision, Updated, Delete button
- `confirmAction: { release: HelmReleaseSummary } | null` state + `ConfirmModal`
- `useOutletContext` for namespace filtering
- Status badge colors: `deployed` → green, `failed` → red, `pending-*` → yellow, others → gray

**`web/src/App.tsx`** — add import + route `/helm`

**`web/src/components/layout/Sidebar.tsx`** — add `Package` to lucide import; add `{ label: 'Helm', to: '/helm', icon: <Package size={14} /> }` to Cluster group after Nodes.

---

## Out of Scope

- Helm release details (values, manifest, notes)
- Helm upgrade / rollback
- Helm history per release
- Helm repo management

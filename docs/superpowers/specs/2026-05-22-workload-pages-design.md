# Design Spec: Workload Resource Pages (DaemonSets, Jobs, CronJobs, HPA)

**Date:** 2026-05-22  
**Status:** Approved  
**Approach:** Single plan, sequential implementation (one resource at a time, backend → frontend)

---

## Overview

Add 4 missing workload resource pages to k999s dashboard: DaemonSets, Jobs, CronJobs, and HPA. Each page follows the established pattern: Go types → client/actions → handler → router → React page with table + YAML sidepanel + actions.

---

## DaemonSets

### Go Backend

**`internal/k8s/types.go`**
```go
type DaemonSetSummary struct {
    Name      string
    Namespace string
    Desired   int32
    Current   int32
    Ready     int32
    Available int32
    Age       string
}
```

**`internal/k8s/client.go`**
- `ListDaemonSets(ctx, namespace) ([]DaemonSetSummary, error)`

**`internal/k8s/actions.go`**
- `RolloutRestartDaemonSet(ctx, namespace, name) error` — patch annotation `kubectl.kubernetes.io/restartedAt`
- `DeleteDaemonSet(ctx, namespace, name) error`

**`internal/api/handlers.go`**
- `handleListDaemonSets` — GET with namespace query param
- `handleRolloutRestartDaemonSet` — POST `:ns/:name/rollout-restart`
- `handleDeleteDaemonSet` — DELETE `:ns/:name`

**`internal/api/router.go`**
```
GET    /api/v1/daemonsets
POST   /api/v1/daemonsets/:ns/:name/rollout-restart
DELETE /api/v1/daemonsets/:ns/:name
```

### React Frontend

**Table columns:** Name / Namespace / Desired / Current / Ready / Available / Age  
**Sidepanel:** YAML view/edit (same pattern as StatefulSets)  
**Actions:** Rollout Restart button + Delete button (via ConfirmModal)  
**Sidebar:** Added under StatefulSets in Workloads group

---

## Jobs

### Go Backend

**`internal/k8s/types.go`**
```go
type JobSummary struct {
    Name        string
    Namespace   string
    Completions string // e.g. "1/1"
    Succeeded   int32
    Failed      int32
    Status      string // "Complete" | "Running" | "Failed"
    Duration    string
    Age         string
}
```

**`internal/k8s/client.go`**
- `ListJobs(ctx, namespace) ([]JobSummary, error)`

**`internal/k8s/actions.go`**
- `DeleteJob(ctx, namespace, name) error`

**`internal/api/handlers.go`**
- `handleListJobs`
- `handleDeleteJob`

**`internal/api/router.go`**
```
GET    /api/v1/jobs
DELETE /api/v1/jobs/:ns/:name
```

### React Frontend

**Table columns:** Name / Namespace / Completions / Status / Duration / Age  
**Status badge:** `Complete` (green) / `Running` (blue) / `Failed` (red)  
**Sidepanel:** YAML view/edit  
**Actions:** Delete (via ConfirmModal)  
**Sidebar:** Added under DaemonSets in Workloads group

---

## CronJobs

### Go Backend

**`internal/k8s/types.go`**
```go
type CronJobSummary struct {
    Name         string
    Namespace    string
    Schedule     string
    Suspend      bool
    Active       int
    LastSchedule string
    Age          string
}
```

**`internal/k8s/client.go`**
- `ListCronJobs(ctx, namespace) ([]CronJobSummary, error)`

**`internal/k8s/actions.go`**
- `DeleteCronJob(ctx, namespace, name) error`
- `TriggerCronJob(ctx, namespace, name) error` — creates a Job from the CronJob's JobTemplate with a generated name and ownerReference pointing back to the CronJob

**`internal/api/handlers.go`**
- `handleListCronJobs`
- `handleDeleteCronJob`
- `handleTriggerCronJob`

**`internal/api/router.go`**
```
GET    /api/v1/cronjobs
DELETE /api/v1/cronjobs/:ns/:name
POST   /api/v1/cronjobs/:ns/:name/trigger
```

### React Frontend

**Table columns:** Name / Namespace / Schedule / Suspend / Active / Last Schedule / Age  
**Suspend badge:** `Active` (green) / `Suspended` (yellow)  
**Sidepanel:** YAML view/edit  
**Actions:** Trigger Now button + Delete button (via ConfirmModal)  
**Sidebar:** Added under Jobs in Workloads group

---

## HPA (Horizontal Pod Autoscaler)

### Go Backend

**`internal/k8s/types.go`**
```go
type HPASummary struct {
    Name            string
    Namespace       string
    TargetKind      string
    TargetName      string
    MinReplicas     int32
    MaxReplicas     int32
    CurrentReplicas int32
    Age             string
}
```

**`internal/k8s/client.go`**
- `ListHPAs(ctx, namespace) ([]HPASummary, error)`

**`internal/k8s/actions.go`**
- `PatchHPALimits(ctx, namespace, name string, min, max int32) error` — strategic merge patch on `spec.minReplicas` and `spec.maxReplicas`

**`internal/api/handlers.go`**
- `handleListHPAs`
- `handlePatchHPALimits` — body `{minReplicas: N, maxReplicas: N}`

**`internal/api/router.go`**
```
GET   /api/v1/hpas
PATCH /api/v1/hpas/:ns/:name/limits
```

### React Frontend

**Table columns:** Name / Namespace / Target (e.g. `Deployment/my-app`) / Min / Max / Current / Age  
**Sidepanel:** YAML view/edit  
**Actions:** Edit Limits modal (input fields for min/max replicas, same pattern as Scale modal in Deployments)  
**Sidebar:** Added under CronJobs in Workloads group

---

## Sidebar Order (final)

```
Workloads
├── Pods
├── Deployments
├── StatefulSets
├── DaemonSets   ← new
├── Jobs         ← new
├── CronJobs     ← new
└── HPA          ← new
```

---

## Testing

- **Go:** unit tests for each `List*` function using `fake.NewSimpleClientset`; action tests for delete/restart/trigger/patch
- **Frontend:** vitest tests for each new page component (list render, action buttons visible)
- **TypeScript:** `npx tsc --noEmit` must pass after all frontend changes

---

## Out of Scope

- Job log streaming (Pods page has no label filter; linking to job pods is a separate feature)
- Job "View Logs" shortcut
- HPA metrics display (beyond min/max/current replicas)
- CronJob suspend/unsuspend toggle
- DaemonSet update strategy editing

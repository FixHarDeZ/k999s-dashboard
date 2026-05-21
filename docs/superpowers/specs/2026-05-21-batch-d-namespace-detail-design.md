# Design Spec: Batch D — Namespace Drill-down

**Date:** 2026-05-21  
**Status:** Approved

---

## Overview

Add a namespace detail page that shows all standard resource kinds inside a specific namespace. Users navigate there by clicking a namespace name in the Namespaces list. Each resource has a YAML view/edit button using the existing `YamlSidePanel`.

---

## Architecture

Pure frontend change — no new backend API endpoints needed. The page fetches 7 standard kinds in parallel using existing fetch functions. Navigation from Namespaces page via React Router `<Link>`. YamlSidePanel already supports `editable` prop.

---

## New Route and Page

**Route:** `/namespaces/:name` → `NamespaceDetail.tsx`

**Component:** `web/src/pages/NamespaceDetail.tsx`

### Data Fetching

Fetch all 7 kinds in parallel using `Promise.all` on page load and refresh:

```ts
const [pods, deployments, statefulsets, services, configmaps, secrets, ingresses] = await Promise.all([
  fetchPods(namespaceName),
  fetchDeployments(namespaceName),
  fetchStatefulSets(namespaceName),
  fetchServices(namespaceName),
  fetchConfigMaps(namespaceName),
  fetchSecrets(namespaceName),
  fetchIngresses(namespaceName),
])
```

All these functions are already exported from `web/src/lib/api.ts`.

### Sections

Seven collapsible sections, each showing:
- Section header: kind icon + kind name + item count + collapse toggle
- Table of items with key fields + YAML button

| Section | Icon | Fetch | Key columns displayed |
|---|---|---|---|
| Pods | 📦 | `fetchPods` | name, status, restarts |
| Deployments | 🚀 | `fetchDeployments` | name, ready |
| StatefulSets | 🗄️ | `fetchStatefulSets` | name, ready |
| Services | ⚙️ | `fetchServices` | name, type, clusterIP |
| ConfigMaps | 📄 | `fetchConfigMaps` | name, dataCount keys |
| Secrets | 🔒 | `fetchSecrets` | name, type |
| Ingresses | 🌐 | `fetchIngresses` | name, hosts |

All sections expanded by default. Each section can be individually collapsed.

### YamlSidePanel Props per Kind

| Kind | group | version | resource |
|---|---|---|---|
| Pods | `''` | `v1` | `pods` |
| Deployments | `apps` | `v1` | `deployments` |
| StatefulSets | `apps` | `v1` | `statefulsets` |
| Services | `''` | `v1` | `services` |
| ConfigMaps | `''` | `v1` | `configmaps` |
| Secrets | `''` | `v1` | `secrets` |
| Ingresses | `networking.k8s.io` | `v1` | `ingresses` |

All with `namespace={namespaceName}` and `editable`.

### State

```tsx
const [loading, setLoading] = useState(true)
const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
const [yamlTarget, setYamlTarget] = useState<{ group: string; version: string; resource: string; name: string } | null>(null)

// Data per kind:
const [pods, setPods] = useState<PodSummary[]>([])
const [deployments, setDeployments] = useState<DeploymentSummary[]>([])
const [statefulsets, setStatefulsets] = useState<StatefulSetSummary[]>([])
const [services, setServices] = useState<ServiceSummary[]>([])
const [configmaps, setConfigmaps] = useState<ConfigMapSummary[]>([])
const [secrets, setSecrets] = useState<SecretSummary[]>([])
const [ingresses, setIngresses] = useState<IngressSummary[]>([])
```

### Page Header

```tsx
<div className="flex items-center gap-3 mb-4">
  <button onClick={() => navigate(-1)} className="text-xs text-primary-500 hover:text-primary-700">← Back</button>
  <h1 className="text-base font-bold text-primary-900">Namespace: {namespaceName}</h1>
  <RefreshButton onRefresh={load} />
</div>
```

Uses `useNavigate` from react-router-dom and `useParams` to get `:name`.

---

## Namespaces.tsx Changes

Make namespace name clickable — replace the plain `<span>` cell with a `<Link>`:

```tsx
// Old:
col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),

// New:
col.accessor('name', { header: 'Name', cell: (i) => (
  <Link to={`/namespaces/${i.getValue()}`} className="font-medium text-xs text-primary-600 hover:text-primary-900 hover:underline">
    {i.getValue()}
  </Link>
) }),
```

Import `Link` from `react-router-dom`.

---

## App.tsx Changes

Add route after the existing `/namespaces` route:

```tsx
import { NamespaceDetail } from '@/pages/NamespaceDetail'
// ...
<Route path="/namespaces/:name" element={<NamespaceDetail />} />
```

Note: `NamespaceDetail` does NOT use `useOutletContext` (it gets its namespace from the URL param, not the dropdown).

---

## Testing

- `cd web && npx tsc --noEmit` — must pass
- `cd web && npx vitest run` — all 31 tests still pass
- `go test ./...` — all pass (no Go changes)

---

## Out of Scope

- Non-namespaced resources (Nodes, ClusterRoles, etc.)
- CRDs and custom resource kinds
- Inline editing of fields (use YamlSidePanel for that)
- Resource counts in section headers updating live

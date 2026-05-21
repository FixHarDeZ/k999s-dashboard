# Istio / Gateway API / Canary Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement three read-only domain pages (Istio, Gateway API, Canary) with rich tabbed tables and YAML side panels, using existing backend resource-list/resource-get endpoints.

**Architecture:** Three new page components share a `YamlSidePanel` component. Version discovery uses the existing `fetchAPIResources()` call on mount. The Go `CRDPresence` struct splits `canary` into `flaggerCanary`+`argoRollouts` to support both Flagger and Argo Rollouts independently.

**Tech Stack:** React 18, TypeScript, @tanstack/react-table, js-yaml, Tailwind v4, Vitest + Testing Library (frontend); Go, k8s.io/apimachinery (backend)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Modify | `internal/k8s/crd_detect.go` | Split `Canary` → `FlaggerCanary` + `ArgoRollouts`; extract pure `detectFromGroups` helper |
| Create | `internal/k8s/crd_detect_test.go` | Table-driven tests for `detectFromGroups` |
| Modify | `web/src/lib/types.ts` | Update `CRDPresence` interface |
| Modify | `web/src/components/layout/AppLayout.tsx` | Fix initial state; pass `detectedCRDs` in outlet context |
| Modify | `web/src/components/layout/Sidebar.tsx` | Use `flaggerCanary \|\| argoRollouts` for Canary link |
| Modify | `web/src/components/layout/Sidebar.test.tsx` | Add CRD detection tests |
| Create | `web/src/components/YamlSidePanel.tsx` | Shared slide-over YAML viewer (Full/Clean toggle) |
| Create | `web/src/pages/Istio.tsx` | VirtualService + DestinationRule tabs |
| Create | `web/src/pages/Istio.test.tsx` | Vitest tests for Istio page |
| Create | `web/src/pages/Gateway.tsx` | Gateway + HTTPRoute tabs |
| Create | `web/src/pages/Gateway.test.tsx` | Vitest tests for Gateway page |
| Create | `web/src/pages/Canary.tsx` | Flagger Canary + Argo Rollouts tabs |
| Create | `web/src/pages/Canary.test.tsx` | Vitest tests for Canary page |
| Modify | `web/src/App.tsx` | Add routes `/istio`, `/gateway`, `/canary` |

---

## Task 1: Refactor Go `CRDPresence` — split canary detection

**Files:**
- Modify: `internal/k8s/crd_detect.go`
- Create: `internal/k8s/crd_detect_test.go`

- [ ] **Step 1.1: Create failing test**

Create `internal/k8s/crd_detect_test.go`:

```go
package k8s

import (
	"testing"

	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
)

func TestDetectFromGroups(t *testing.T) {
	cases := []struct {
		name   string
		groups []metav1.APIGroup
		want   CRDPresence
	}{
		{
			name:   "empty",
			groups: []metav1.APIGroup{},
			want:   CRDPresence{},
		},
		{
			name: "istio only",
			groups: []metav1.APIGroup{
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "networking.istio.io/v1beta1"}},
			},
			want: CRDPresence{Istio: true},
		},
		{
			name: "gateway api only",
			groups: []metav1.APIGroup{
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "gateway.networking.k8s.io/v1"}},
			},
			want: CRDPresence{GatewayAPI: true},
		},
		{
			name: "flagger only",
			groups: []metav1.APIGroup{
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "flagger.app/v1beta1"}},
			},
			want: CRDPresence{FlaggerCanary: true},
		},
		{
			name: "argo only",
			groups: []metav1.APIGroup{
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "argoproj.io/v1alpha1"}},
			},
			want: CRDPresence{ArgoRollouts: true},
		},
		{
			name: "both canary types",
			groups: []metav1.APIGroup{
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "flagger.app/v1beta1"}},
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "argoproj.io/v1alpha1"}},
			},
			want: CRDPresence{FlaggerCanary: true, ArgoRollouts: true},
		},
		{
			name: "all CRDs",
			groups: []metav1.APIGroup{
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "networking.istio.io/v1beta1"}},
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "gateway.networking.k8s.io/v1"}},
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "flagger.app/v1beta1"}},
				{PreferredVersion: metav1.GroupVersionForDiscovery{GroupVersion: "argoproj.io/v1alpha1"}},
			},
			want: CRDPresence{Istio: true, GatewayAPI: true, FlaggerCanary: true, ArgoRollouts: true},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := detectFromGroups(tc.groups)
			if *got != tc.want {
				t.Errorf("got %+v, want %+v", *got, tc.want)
			}
		})
	}
}
```

- [ ] **Step 1.2: Run test to confirm it fails**

```bash
go test ./internal/k8s/... -run TestDetectFromGroups -v
```

Expected: compilation error — `CRDPresence` has no field `FlaggerCanary` or `ArgoRollouts`; `detectFromGroups` not defined.

- [ ] **Step 1.3: Rewrite `internal/k8s/crd_detect.go`**

```go
package k8s

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime/schema"
)

// CRDPresence indicates which optional CRDs are installed.
type CRDPresence struct {
	Istio         bool `json:"istio"`
	GatewayAPI    bool `json:"gatewayApi"`
	FlaggerCanary bool `json:"flaggerCanary"`
	ArgoRollouts  bool `json:"argoRollouts"`
}

func detectFromGroups(groups []metav1.APIGroup) *CRDPresence {
	p := &CRDPresence{}
	istioGroups := map[string]bool{
		"networking.istio.io": true,
		"security.istio.io":   true,
	}
	gatewayGroups := map[string]bool{
		"gateway.networking.k8s.io": true,
	}
	flaggerGroups := map[string]bool{
		"flagger.app": true,
	}
	argoGroups := map[string]bool{
		"argoproj.io": true,
	}
	for _, g := range groups {
		gv, _ := schema.ParseGroupVersion(g.PreferredVersion.GroupVersion)
		switch {
		case istioGroups[gv.Group]:
			p.Istio = true
		case gatewayGroups[gv.Group]:
			p.GatewayAPI = true
		case flaggerGroups[gv.Group]:
			p.FlaggerCanary = true
		case argoGroups[gv.Group]:
			p.ArgoRollouts = true
		}
	}
	return p
}

// DetectCRDs probes the cluster's API groups for known optional CRDs.
func (c *Client) DetectCRDs() *CRDPresence {
	groups, err := c.kube.Discovery().ServerGroups()
	if err != nil {
		return &CRDPresence{}
	}
	return detectFromGroups(groups.Groups)
}
```

- [ ] **Step 1.4: Run all Go tests**

```bash
go test ./internal/k8s/... -v
```

Expected: all tests pass including `TestDetectFromGroups`.

- [ ] **Step 1.5: Commit**

```bash
git add internal/k8s/crd_detect.go internal/k8s/crd_detect_test.go
git commit -m "feat: split CRDPresence canary into FlaggerCanary + ArgoRollouts"
```

---

## Task 2: Update TypeScript types, AppLayout, Sidebar

**Files:**
- Modify: `web/src/lib/types.ts`
- Modify: `web/src/components/layout/AppLayout.tsx`
- Modify: `web/src/components/layout/Sidebar.tsx`
- Modify: `web/src/components/layout/Sidebar.test.tsx`

- [ ] **Step 2.1: Update `CRDPresence` in `web/src/lib/types.ts`**

Replace the `CRDPresence` interface (currently last interface in the file):

```ts
export interface CRDPresence {
  istio: boolean
  gatewayApi: boolean
  flaggerCanary: boolean
  argoRollouts: boolean
}
```

- [ ] **Step 2.2: Update `web/src/components/layout/AppLayout.tsx`**

Change the initial state on line 13 from:
```ts
const [detectedCRDs, setDetectedCRDs] = useState<CRDPresence>({ istio: false, gatewayApi: false, canary: false })
```
to:
```ts
const [detectedCRDs, setDetectedCRDs] = useState<CRDPresence>({ istio: false, gatewayApi: false, flaggerCanary: false, argoRollouts: false })
```

Change the `<Outlet>` on line 57 from:
```tsx
<Outlet context={{ namespace, context: currentContext }} />
```
to:
```tsx
<Outlet context={{ namespace, context: currentContext, detectedCRDs }} />
```

- [ ] **Step 2.3: Update `web/src/components/layout/Sidebar.tsx`**

Change line 46 from:
```tsx
...(detectedCRDs?.canary ? [{ label: 'Canary', to: '/canary', icon: <Bird size={14} /> }] : []),
```
to:
```tsx
...(detectedCRDs?.flaggerCanary || detectedCRDs?.argoRollouts ? [{ label: 'Canary', to: '/canary', icon: <Bird size={14} /> }] : []),
```

- [ ] **Step 2.4: Replace `web/src/components/layout/Sidebar.test.tsx`**

```tsx
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

  it('hides Istio/Gateway/Canary when no CRDs detected', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(screen.queryByText('Istio')).not.toBeInTheDocument()
    expect(screen.queryByText('Gateway API')).not.toBeInTheDocument()
    expect(screen.queryByText('Canary')).not.toBeInTheDocument()
  })

  it('shows Istio when istio CRD detected', () => {
    render(<MemoryRouter><Sidebar detectedCRDs={{ istio: true, gatewayApi: false, flaggerCanary: false, argoRollouts: false }} /></MemoryRouter>)
    expect(screen.getByText('Istio')).toBeInTheDocument()
  })

  it('shows Gateway API when gatewayApi CRD detected', () => {
    render(<MemoryRouter><Sidebar detectedCRDs={{ istio: false, gatewayApi: true, flaggerCanary: false, argoRollouts: false }} /></MemoryRouter>)
    expect(screen.getByText('Gateway API')).toBeInTheDocument()
  })

  it('shows Canary when flaggerCanary detected', () => {
    render(<MemoryRouter><Sidebar detectedCRDs={{ istio: false, gatewayApi: false, flaggerCanary: true, argoRollouts: false }} /></MemoryRouter>)
    expect(screen.getByText('Canary')).toBeInTheDocument()
  })

  it('shows Canary when argoRollouts detected', () => {
    render(<MemoryRouter><Sidebar detectedCRDs={{ istio: false, gatewayApi: false, flaggerCanary: false, argoRollouts: true }} /></MemoryRouter>)
    expect(screen.getByText('Canary')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2.5: TypeScript check + run Sidebar tests**

```bash
cd web && npx tsc --noEmit && npx vitest run src/components/layout/Sidebar.test.tsx
```

Expected: no TypeScript errors, all 7 Sidebar tests pass.

- [ ] **Step 2.6: Commit**

```bash
git add web/src/lib/types.ts web/src/components/layout/AppLayout.tsx web/src/components/layout/Sidebar.tsx web/src/components/layout/Sidebar.test.tsx
git commit -m "feat: update CRDPresence type and pass detectedCRDs through outlet context"
```

---

## Task 3: Create `YamlSidePanel` component

**Files:**
- Create: `web/src/components/YamlSidePanel.tsx`

- [ ] **Step 3.1: Create `web/src/components/YamlSidePanel.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { fetchResourceGet } from '@/lib/api'
import yaml from 'js-yaml'
import { X } from 'lucide-react'

interface YamlSidePanelProps {
  group: string
  version: string
  resource: string
  namespace: string
  name: string
  onClose: () => void
}

function cleanResource(json: unknown): unknown {
  if (typeof json !== 'object' || json === null) return json
  const obj = { ...(json as Record<string, unknown>) }
  delete obj.status
  const meta = obj.metadata as Record<string, unknown> | undefined
  if (meta) {
    const cleanMeta = { ...meta }
    delete cleanMeta.managedFields
    obj.metadata = cleanMeta
  }
  return obj
}

export function YamlSidePanel({ group, version, resource, namespace, name, onClose }: YamlSidePanelProps) {
  const [rawJson, setRawJson] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [viewClean, setViewClean] = useState(false)

  useEffect(() => {
    fetchResourceGet(group, version, resource, namespace, name)
      .then(json => { setRawJson(json); setLoading(false) })
      .catch(e => { setError((e as Error).message); setLoading(false) })
  }, [group, version, resource, namespace, name])

  const displayYaml = (() => {
    if (!rawJson) return ''
    try {
      const parsed = JSON.parse(rawJson)
      const data = viewClean ? cleanResource(parsed) : parsed
      return yaml.dump(data, { indent: 2, lineWidth: -1 })
    } catch {
      return rawJson
    }
  })()

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-[600px] bg-white shadow-2xl z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-primary-100">
          <div>
            <span className="text-xs font-bold text-primary-900">{name}</span>
            <span className="text-[10px] text-primary-400 ml-2">{namespace}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setViewClean(v => !v)}
              className="text-[10px] px-2 py-1 rounded border border-primary-200 text-primary-600 hover:bg-primary-50"
            >
              {viewClean ? '[Clean]' : '[Full]'}
            </button>
            <button onClick={onClose} className="p-1 hover:bg-primary-50 rounded">
              <X size={14} className="text-primary-500" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-auto p-4">
          {loading && <p className="text-xs text-primary-400">Loading...</p>}
          {error && <p className="text-xs text-red-500">{error}</p>}
          {!loading && !error && (
            <pre className="text-[11px] font-mono text-primary-800 whitespace-pre-wrap">{displayYaml}</pre>
          )}
        </div>
      </div>
    </>
  )
}
```

- [ ] **Step 3.2: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3.3: Commit**

```bash
git add web/src/components/YamlSidePanel.tsx
git commit -m "feat: add shared YamlSidePanel component"
```

---

## Task 4: Create `Istio.tsx` page

**Files:**
- Create: `web/src/pages/Istio.tsx`
- Create: `web/src/pages/Istio.test.tsx`

- [ ] **Step 4.1: Write failing test** — create `web/src/pages/Istio.test.tsx`

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Istio } from './Istio'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockAPIResources = [
  { name: 'virtualservices', kind: 'VirtualService', group: 'networking.istio.io', version: 'v1beta1', namespaced: true },
  { name: 'destinationrules', kind: 'DestinationRule', group: 'networking.istio.io', version: 'v1beta1', namespaced: true },
]

const mockVS = [
  {
    metadata: { name: 'reviews', namespace: 'default', creationTimestamp: new Date(Date.now() - 3600000).toISOString() },
    spec: { hosts: ['reviews'], gateways: ['mesh'], http: [{}] },
  },
]

function renderIstio() {
  return render(
    <MemoryRouter initialEntries={['/istio']}>
      <Routes>
        <Route path="/istio" element={<Istio />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Istio page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchAPIResources).mockResolvedValue(mockAPIResources)
    vi.mocked(api.fetchResourceList).mockResolvedValue(mockVS)
  })

  it('renders page heading', () => {
    renderIstio()
    expect(screen.getByText('Istio')).toBeInTheDocument()
  })

  it('renders VirtualService and DestinationRule tab buttons', () => {
    renderIstio()
    expect(screen.getByText('VirtualService')).toBeInTheDocument()
    expect(screen.getByText('DestinationRule')).toBeInTheDocument()
  })

  it('shows VirtualService rows after loading', async () => {
    renderIstio()
    await waitFor(() => expect(screen.getByText('reviews')).toBeInTheDocument())
  })

  it('shows empty state when no resources', async () => {
    vi.mocked(api.fetchResourceList).mockResolvedValue([])
    renderIstio()
    await waitFor(() => expect(screen.getByText('No resources found')).toBeInTheDocument())
  })
})
```

- [ ] **Step 4.2: Run test to confirm it fails**

```bash
cd web && npx vitest run src/pages/Istio.test.tsx
```

Expected: FAIL — `Istio` module not found.

- [ ] **Step 4.3: Create `web/src/pages/Istio.tsx`**

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createColumnHelper, flexRender, getCoreRowModel,
  getFilteredRowModel, useReactTable,
} from '@tanstack/react-table'
import { fetchAPIResources, fetchResourceList } from '@/lib/api'
import { cn } from '@/lib/utils'

type Row = Record<string, unknown>
const col = createColumnHelper<Row>()

function getMeta(r: Row): Record<string, unknown> { return (r.metadata as Record<string, unknown>) ?? {} }
function getSpec(r: Row): Record<string, unknown> { return (r.spec as Record<string, unknown>) ?? {} }

function getAge(r: Row): string {
  const ts = getMeta(r).creationTimestamp as string | undefined
  if (!ts) return ''
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (d < 60) return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

const vsColumns = [
  col.accessor(r => getMeta(r).name as string ?? '', { id: 'name', header: 'Name',
    cell: i => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor(r => getMeta(r).namespace as string ?? '', { id: 'namespace', header: 'Namespace',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor(r => (getSpec(r).hosts as string[])?.join(', ') ?? '—', { id: 'hosts', header: 'Hosts',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => String((getSpec(r).gateways as unknown[])?.length ?? 0), { id: 'gateways', header: 'Gateways',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => String((getSpec(r).http as unknown[])?.length ?? 0), { id: 'http', header: 'HTTP Routes',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getAge(r), { id: 'age', header: 'Age',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

const drColumns = [
  col.accessor(r => getMeta(r).name as string ?? '', { id: 'name', header: 'Name',
    cell: i => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor(r => getMeta(r).namespace as string ?? '', { id: 'namespace', header: 'Namespace',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor(r => getSpec(r).host as string ?? '—', { id: 'host', header: 'Host',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => (getSpec(r).subsets as Array<{ name: string }>)?.map(s => s.name).join(', ') ?? '—', { id: 'subsets', header: 'Subsets',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getSpec(r).trafficPolicy ? 'Configured' : '—', { id: 'traffic', header: 'Traffic Policy',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getAge(r), { id: 'age', header: 'Age',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

export function Istio() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [activeTab, setActiveTab] = useState<'vs' | 'dr'>('vs')
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [globalFilter, setGlobalFilter] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)
  const [versions, setVersions] = useState({ vs: 'v1beta1', dr: 'v1beta1' })

  useEffect(() => {
    fetchAPIResources().then(resources => {
      setVersions({
        vs: resources.find(r => r.group === 'networking.istio.io' && r.name === 'virtualservices')?.version ?? 'v1beta1',
        dr: resources.find(r => r.group === 'networking.istio.io' && r.name === 'destinationrules')?.version ?? 'v1beta1',
      })
    }).catch(() => {})
  }, [])

  const load = useCallback(() => {
    const [group, version, resource] = activeTab === 'vs'
      ? ['networking.istio.io', versions.vs, 'virtualservices']
      : ['networking.istio.io', versions.dr, 'destinationrules']
    setLoading(true)
    setError(null)
    fetchResourceList(group, version, resource, namespace)
      .then(setItems)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [activeTab, namespace, versions])

  useEffect(() => { load() }, [load])

  const table = useReactTable({
    data: items,
    columns: activeTab === 'vs' ? vsColumns : drColumns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Istio</h1>
          <p className="text-[11px] text-primary-500">{items.length} resources</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton onRefresh={load} />
          <input
            placeholder="Filter..."
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-40"
          />
        </div>
      </div>

      <div className="flex gap-1 mb-3">
        {(['vs', 'dr'] as const).map(tab => (
          <button key={tab}
            onClick={() => { setActiveTab(tab); setGlobalFilter('') }}
            className={cn(
              'text-xs px-3 py-1.5 rounded-md font-medium transition-colors',
              activeTab === tab ? 'bg-primary-600 text-white' : 'text-primary-600 hover:bg-primary-50'
            )}>
            {tab === 'vs' ? 'VirtualService' : 'DestinationRule'}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      {loading && <p className="text-xs text-primary-400 mb-3">Loading...</p>}

      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}
                onClick={() => setSelected(row.original)}
                className="border-t border-primary-50 hover:bg-primary-50/50 transition-colors cursor-pointer">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && !error && (
          <p className="text-xs text-primary-400 text-center py-8">No resources found</p>
        )}
      </div>

      {selected && (
        <YamlSidePanel
          group="networking.istio.io"
          version={activeTab === 'vs' ? versions.vs : versions.dr}
          resource={activeTab === 'vs' ? 'virtualservices' : 'destinationrules'}
          namespace={getMeta(selected).namespace as string ?? ''}
          name={getMeta(selected).name as string ?? ''}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 4.4: Run test to confirm it passes**

```bash
cd web && npx vitest run src/pages/Istio.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add web/src/pages/Istio.tsx web/src/pages/Istio.test.tsx
git commit -m "feat: add Istio page with VirtualService and DestinationRule tabs"
```

---

## Task 5: Create `Gateway.tsx` page

**Files:**
- Create: `web/src/pages/Gateway.tsx`
- Create: `web/src/pages/Gateway.test.tsx`

- [ ] **Step 5.1: Write failing test** — create `web/src/pages/Gateway.test.tsx`

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Gateway } from './Gateway'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockAPIResources = [
  { name: 'gateways', kind: 'Gateway', group: 'gateway.networking.k8s.io', version: 'v1', namespaced: true },
  { name: 'httproutes', kind: 'HTTPRoute', group: 'gateway.networking.k8s.io', version: 'v1', namespaced: true },
]

const mockGateways = [
  {
    metadata: { name: 'my-gateway', namespace: 'default', creationTimestamp: new Date(Date.now() - 7200000).toISOString() },
    spec: { gatewayClassName: 'nginx', listeners: [{}, {}] },
  },
]

function renderGateway() {
  return render(
    <MemoryRouter initialEntries={['/gateway']}>
      <Routes>
        <Route path="/gateway" element={<Gateway />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Gateway page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchAPIResources).mockResolvedValue(mockAPIResources)
    vi.mocked(api.fetchResourceList).mockResolvedValue(mockGateways)
  })

  it('renders page heading', () => {
    renderGateway()
    expect(screen.getByText('Gateway API')).toBeInTheDocument()
  })

  it('renders Gateway and HTTPRoute tab buttons', () => {
    renderGateway()
    expect(screen.getByText('Gateway')).toBeInTheDocument()
    expect(screen.getByText('HTTPRoute')).toBeInTheDocument()
  })

  it('shows gateway rows after loading', async () => {
    renderGateway()
    await waitFor(() => expect(screen.getByText('my-gateway')).toBeInTheDocument())
  })

  it('shows empty state when no resources', async () => {
    vi.mocked(api.fetchResourceList).mockResolvedValue([])
    renderGateway()
    await waitFor(() => expect(screen.getByText('No resources found')).toBeInTheDocument())
  })
})
```

- [ ] **Step 5.2: Run test to confirm it fails**

```bash
cd web && npx vitest run src/pages/Gateway.test.tsx
```

Expected: FAIL — `Gateway` module not found.

- [ ] **Step 5.3: Create `web/src/pages/Gateway.tsx`**

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createColumnHelper, flexRender, getCoreRowModel,
  getFilteredRowModel, useReactTable,
} from '@tanstack/react-table'
import { fetchAPIResources, fetchResourceList } from '@/lib/api'
import { cn } from '@/lib/utils'

type Row = Record<string, unknown>
const col = createColumnHelper<Row>()

function getMeta(r: Row): Record<string, unknown> { return (r.metadata as Record<string, unknown>) ?? {} }
function getSpec(r: Row): Record<string, unknown> { return (r.spec as Record<string, unknown>) ?? {} }

function getAge(r: Row): string {
  const ts = getMeta(r).creationTimestamp as string | undefined
  if (!ts) return ''
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (d < 60) return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

const gatewayColumns = [
  col.accessor(r => getMeta(r).name as string ?? '', { id: 'name', header: 'Name',
    cell: i => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor(r => getMeta(r).namespace as string ?? '', { id: 'namespace', header: 'Namespace',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor(r => getSpec(r).gatewayClassName as string ?? '—', { id: 'class', header: 'Gateway Class',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => String((getSpec(r).listeners as unknown[])?.length ?? 0), { id: 'listeners', header: 'Listeners',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getAge(r), { id: 'age', header: 'Age',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

const httpRouteColumns = [
  col.accessor(r => getMeta(r).name as string ?? '', { id: 'name', header: 'Name',
    cell: i => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor(r => getMeta(r).namespace as string ?? '', { id: 'namespace', header: 'Namespace',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor(r => (getSpec(r).hostnames as string[])?.join(', ') ?? '—', { id: 'hostnames', header: 'Hostnames',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => (getSpec(r).parentRefs as Array<{ name: string }>)?.map(p => p.name).join(', ') ?? '—', { id: 'parents', header: 'Parent Refs',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => String((getSpec(r).rules as unknown[])?.length ?? 0), { id: 'rules', header: 'Rules',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getAge(r), { id: 'age', header: 'Age',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

export function Gateway() {
  const ctx = useOutletContext<{ namespace: string } | null>()
  const namespace = ctx?.namespace ?? ''
  const [activeTab, setActiveTab] = useState<'gateway' | 'httproute'>('gateway')
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [globalFilter, setGlobalFilter] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)
  const [versions, setVersions] = useState({ gateway: 'v1', httproute: 'v1' })

  useEffect(() => {
    fetchAPIResources().then(resources => {
      setVersions({
        gateway: resources.find(r => r.group === 'gateway.networking.k8s.io' && r.name === 'gateways')?.version ?? 'v1',
        httproute: resources.find(r => r.group === 'gateway.networking.k8s.io' && r.name === 'httproutes')?.version ?? 'v1',
      })
    }).catch(() => {})
  }, [])

  const load = useCallback(() => {
    const [group, version, resource] = activeTab === 'gateway'
      ? ['gateway.networking.k8s.io', versions.gateway, 'gateways']
      : ['gateway.networking.k8s.io', versions.httproute, 'httproutes']
    setLoading(true)
    setError(null)
    fetchResourceList(group, version, resource, namespace)
      .then(setItems)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [activeTab, namespace, versions])

  useEffect(() => { load() }, [load])

  const table = useReactTable({
    data: items,
    columns: activeTab === 'gateway' ? gatewayColumns : httpRouteColumns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Gateway API</h1>
          <p className="text-[11px] text-primary-500">{items.length} resources</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton onRefresh={load} />
          <input
            placeholder="Filter..."
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-40"
          />
        </div>
      </div>

      <div className="flex gap-1 mb-3">
        {(['gateway', 'httproute'] as const).map(tab => (
          <button key={tab}
            onClick={() => { setActiveTab(tab); setGlobalFilter('') }}
            className={cn(
              'text-xs px-3 py-1.5 rounded-md font-medium transition-colors',
              activeTab === tab ? 'bg-primary-600 text-white' : 'text-primary-600 hover:bg-primary-50'
            )}>
            {tab === 'gateway' ? 'Gateway' : 'HTTPRoute'}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      {loading && <p className="text-xs text-primary-400 mb-3">Loading...</p>}

      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}
                onClick={() => setSelected(row.original)}
                className="border-t border-primary-50 hover:bg-primary-50/50 transition-colors cursor-pointer">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && !error && (
          <p className="text-xs text-primary-400 text-center py-8">No resources found</p>
        )}
      </div>

      {selected && (
        <YamlSidePanel
          group="gateway.networking.k8s.io"
          version={activeTab === 'gateway' ? versions.gateway : versions.httproute}
          resource={activeTab === 'gateway' ? 'gateways' : 'httproutes'}
          namespace={getMeta(selected).namespace as string ?? ''}
          name={getMeta(selected).name as string ?? ''}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 5.4: Run test to confirm it passes**

```bash
cd web && npx vitest run src/pages/Gateway.test.tsx
```

Expected: all 4 tests pass.

- [ ] **Step 5.5: Commit**

```bash
git add web/src/pages/Gateway.tsx web/src/pages/Gateway.test.tsx
git commit -m "feat: add Gateway API page with Gateway and HTTPRoute tabs"
```

---

## Task 6: Create `Canary.tsx` page

**Files:**
- Create: `web/src/pages/Canary.tsx`
- Create: `web/src/pages/Canary.test.tsx`

- [ ] **Step 6.1: Write failing test** — create `web/src/pages/Canary.test.tsx`

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, Outlet } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Canary } from './Canary'
import * as api from '@/lib/api'
import type { CRDPresence } from '@/lib/types'

vi.mock('@/lib/api')

const mockAPIResources = [
  { name: 'canaries', kind: 'Canary', group: 'flagger.app', version: 'v1beta1', namespaced: true },
  { name: 'rollouts', kind: 'Rollout', group: 'argoproj.io', version: 'v1alpha1', namespaced: true },
]

const mockCanaries = [
  {
    metadata: { name: 'podinfo', namespace: 'default', creationTimestamp: new Date(Date.now() - 3600000).toISOString() },
    spec: { targetRef: { name: 'podinfo', kind: 'Deployment' }, analysis: { maxWeight: 50 } },
    status: { phase: 'Progressing', canaryWeight: 20 },
  },
]

function renderCanary(detectedCRDs: CRDPresence) {
  function Parent() {
    return <Outlet context={{ namespace: '', detectedCRDs }} />
  }
  return render(
    <MemoryRouter initialEntries={['/canary']}>
      <Routes>
        <Route element={<Parent />}>
          <Route path="/canary" element={<Canary />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('Canary page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchAPIResources).mockResolvedValue(mockAPIResources)
    vi.mocked(api.fetchResourceList).mockResolvedValue(mockCanaries)
  })

  it('renders page heading', () => {
    renderCanary({ istio: false, gatewayApi: false, flaggerCanary: true, argoRollouts: false })
    expect(screen.getByText('Canary')).toBeInTheDocument()
  })

  it('shows Flagger Canary tab when flaggerCanary detected', () => {
    renderCanary({ istio: false, gatewayApi: false, flaggerCanary: true, argoRollouts: false })
    expect(screen.getByText('Flagger Canary')).toBeInTheDocument()
  })

  it('shows Argo Rollouts tab when argoRollouts detected', () => {
    vi.mocked(api.fetchResourceList).mockResolvedValue([])
    renderCanary({ istio: false, gatewayApi: false, flaggerCanary: false, argoRollouts: true })
    expect(screen.getByText('Argo Rollouts')).toBeInTheDocument()
  })

  it('shows both tabs when both detected', () => {
    renderCanary({ istio: false, gatewayApi: false, flaggerCanary: true, argoRollouts: true })
    expect(screen.getByText('Flagger Canary')).toBeInTheDocument()
    expect(screen.getByText('Argo Rollouts')).toBeInTheDocument()
  })

  it('shows Flagger canary resource name after loading', async () => {
    renderCanary({ istio: false, gatewayApi: false, flaggerCanary: true, argoRollouts: false })
    await waitFor(() => expect(screen.getByText('podinfo')).toBeInTheDocument())
  })

  it('shows phase badge', async () => {
    renderCanary({ istio: false, gatewayApi: false, flaggerCanary: true, argoRollouts: false })
    await waitFor(() => expect(screen.getByText('Progressing')).toBeInTheDocument())
  })
})
```

- [ ] **Step 6.2: Run test to confirm it fails**

```bash
cd web && npx vitest run src/pages/Canary.test.tsx
```

Expected: FAIL — `Canary` module not found.

- [ ] **Step 6.3: Create `web/src/pages/Canary.tsx`**

```tsx
import { RefreshButton } from '@/components/RefreshButton'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import { useEffect, useState, useCallback } from 'react'
import { useOutletContext } from 'react-router-dom'
import {
  createColumnHelper, flexRender, getCoreRowModel,
  getFilteredRowModel, useReactTable,
} from '@tanstack/react-table'
import { fetchAPIResources, fetchResourceList } from '@/lib/api'
import type { CRDPresence } from '@/lib/types'
import { cn } from '@/lib/utils'

type Row = Record<string, unknown>
const col = createColumnHelper<Row>()

function getMeta(r: Row): Record<string, unknown> { return (r.metadata as Record<string, unknown>) ?? {} }
function getSpec(r: Row): Record<string, unknown> { return (r.spec as Record<string, unknown>) ?? {} }
function getStatus(r: Row): Record<string, unknown> { return (r.status as Record<string, unknown>) ?? {} }

function getAge(r: Row): string {
  const ts = getMeta(r).creationTimestamp as string | undefined
  if (!ts) return ''
  const d = Math.floor((Date.now() - new Date(ts).getTime()) / 1000)
  if (d < 60) return `${d}s`
  if (d < 3600) return `${Math.floor(d / 60)}m`
  if (d < 86400) return `${Math.floor(d / 3600)}h`
  return `${Math.floor(d / 86400)}d`
}

const PHASE_COLORS: Record<string, string> = {
  Initialized: 'bg-gray-100 text-gray-600',
  Waiting: 'bg-yellow-100 text-yellow-700',
  Progressing: 'bg-blue-100 text-blue-700',
  Promoting: 'bg-purple-100 text-purple-700',
  Finalising: 'bg-teal-100 text-teal-700',
  Succeeded: 'bg-green-100 text-green-700',
  Failed: 'bg-red-100 text-red-600',
  Healthy: 'bg-green-100 text-green-700',
  Paused: 'bg-yellow-100 text-yellow-700',
  Degraded: 'bg-red-100 text-red-600',
}

function PhaseBadge({ phase }: { phase: string }) {
  const cls = PHASE_COLORS[phase] ?? 'bg-gray-100 text-gray-600'
  return <span className={cn('text-[10px] px-1.5 py-0.5 rounded font-medium', cls)}>{phase}</span>
}

function WeightBar({ weight, max }: { weight: number; max: number }) {
  const pct = max > 0 ? Math.min(100, (weight / max) * 100) : 0
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-gray-500">{weight}%</span>
    </div>
  )
}

const flaggerColumns = [
  col.accessor(r => getMeta(r).name as string ?? '', { id: 'name', header: 'Name',
    cell: i => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor(r => getMeta(r).namespace as string ?? '', { id: 'namespace', header: 'Namespace',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor(r => (getSpec(r).targetRef as { name: string } | undefined)?.name ?? '—', { id: 'target', header: 'Target',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getStatus(r).phase as string ?? '—', { id: 'phase', header: 'Phase',
    cell: i => <PhaseBadge phase={i.getValue()} /> }),
  col.display({ id: 'weight', header: 'Weight',
    cell: ({ row }) => {
      const weight = getStatus(row.original).canaryWeight as number ?? 0
      const spec = getSpec(row.original)
      const analysis = (spec.analysis ?? spec.canaryAnalysis) as { maxWeight?: number } | undefined
      return <WeightBar weight={weight} max={analysis?.maxWeight ?? 100} />
    },
  }),
  col.accessor(r => getAge(r), { id: 'age', header: 'Age',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

const argoColumns = [
  col.accessor(r => getMeta(r).name as string ?? '', { id: 'name', header: 'Name',
    cell: i => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),
  col.accessor(r => getMeta(r).namespace as string ?? '', { id: 'namespace', header: 'Namespace',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
  col.accessor(r => (getSpec(r).strategy as { canary?: unknown } | undefined)?.canary ? 'Canary' : 'BlueGreen', { id: 'strategy', header: 'Strategy',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getStatus(r).phase as string ?? '—', { id: 'phase', header: 'Phase',
    cell: i => <PhaseBadge phase={i.getValue()} /> }),
  col.accessor(r => `${getStatus(r).readyReplicas ?? 0}/${getSpec(r).replicas ?? '?'}`, { id: 'ready', header: 'Ready',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => String(getStatus(r).currentStepIndex ?? '—'), { id: 'step', header: 'Step',
    cell: i => <span className="text-xs">{i.getValue()}</span> }),
  col.accessor(r => getAge(r), { id: 'age', header: 'Age',
    cell: i => <span className="text-xs text-gray-500">{i.getValue()}</span> }),
]

type TabId = 'flagger' | 'argo'

export function Canary() {
  const ctx = useOutletContext<{ namespace: string; detectedCRDs?: CRDPresence } | null>()
  const namespace = ctx?.namespace ?? ''
  const crds = ctx?.detectedCRDs

  const availableTabs: TabId[] = [
    ...(crds?.flaggerCanary !== false ? ['flagger' as const] : []),
    ...(crds?.argoRollouts === true ? ['argo' as const] : []),
  ]
  const tabs = availableTabs.length > 0 ? availableTabs : ['flagger' as const, 'argo' as const]

  const [activeTab, setActiveTab] = useState<TabId>(tabs[0])
  const [items, setItems] = useState<Row[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [globalFilter, setGlobalFilter] = useState('')
  const [selected, setSelected] = useState<Row | null>(null)
  const [versions, setVersions] = useState({ flagger: 'v1beta1', argo: 'v1alpha1' })

  useEffect(() => {
    fetchAPIResources().then(resources => {
      setVersions({
        flagger: resources.find(r => r.group === 'flagger.app' && r.name === 'canaries')?.version ?? 'v1beta1',
        argo: resources.find(r => r.group === 'argoproj.io' && r.name === 'rollouts')?.version ?? 'v1alpha1',
      })
    }).catch(() => {})
  }, [])

  const load = useCallback(() => {
    const [group, version, resource] = activeTab === 'flagger'
      ? ['flagger.app', versions.flagger, 'canaries']
      : ['argoproj.io', versions.argo, 'rollouts']
    setLoading(true)
    setError(null)
    fetchResourceList(group, version, resource, namespace)
      .then(setItems)
      .catch(e => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [activeTab, namespace, versions])

  useEffect(() => { load() }, [load])

  const table = useReactTable({
    data: items,
    columns: activeTab === 'flagger' ? flaggerColumns : argoColumns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const tabLabel = (tab: TabId) => tab === 'flagger' ? 'Flagger Canary' : 'Argo Rollouts'

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-base font-bold text-primary-900">Canary</h1>
          <p className="text-[11px] text-primary-500">{items.length} resources</p>
        </div>
        <div className="flex gap-2">
          <RefreshButton onRefresh={load} />
          <input
            placeholder="Filter..."
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
            className="text-xs border border-primary-200 rounded-md px-3 py-1.5 outline-none focus:border-primary-400 w-40"
          />
        </div>
      </div>

      <div className="flex gap-1 mb-3">
        {tabs.map(tab => (
          <button key={tab}
            onClick={() => { setActiveTab(tab); setGlobalFilter('') }}
            className={cn(
              'text-xs px-3 py-1.5 rounded-md font-medium transition-colors',
              activeTab === tab ? 'bg-primary-600 text-white' : 'text-primary-600 hover:bg-primary-50'
            )}>
            {tabLabel(tab)}
          </button>
        ))}
      </div>

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}
      {loading && <p className="text-xs text-primary-400 mb-3">Loading...</p>}

      <div className="border border-primary-100 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-primary-50">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id} className="text-left px-3 py-2 text-[10px] font-bold text-primary-600 uppercase tracking-wider">
                    {flexRender(h.column.columnDef.header, h.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map(row => (
              <tr key={row.id}
                onClick={() => setSelected(row.original)}
                className="border-t border-primary-50 hover:bg-primary-50/50 transition-colors cursor-pointer">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-3 py-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && items.length === 0 && !error && (
          <p className="text-xs text-primary-400 text-center py-8">No resources found</p>
        )}
      </div>

      {selected && (
        <YamlSidePanel
          group={activeTab === 'flagger' ? 'flagger.app' : 'argoproj.io'}
          version={activeTab === 'flagger' ? versions.flagger : versions.argo}
          resource={activeTab === 'flagger' ? 'canaries' : 'rollouts'}
          namespace={getMeta(selected).namespace as string ?? ''}
          name={getMeta(selected).name as string ?? ''}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 6.4: Run test to confirm it passes**

```bash
cd web && npx vitest run src/pages/Canary.test.tsx
```

Expected: all 6 tests pass.

- [ ] **Step 6.5: Commit**

```bash
git add web/src/pages/Canary.tsx web/src/pages/Canary.test.tsx
git commit -m "feat: add Canary page with Flagger and Argo Rollouts tabs"
```

---

## Task 7: Wire routes + full verification

**Files:**
- Modify: `web/src/App.tsx`

- [ ] **Step 7.1: Update `web/src/App.tsx`**

Add three imports after the `import { Settings } from '@/pages/Settings'` line:

```tsx
import { Istio } from '@/pages/Istio'
import { Gateway } from '@/pages/Gateway'
import { Canary } from '@/pages/Canary'
```

Add three routes inside `<Route element={<AppLayout />}>` after `<Route path="/settings" element={<Settings />} />`:

```tsx
<Route path="/istio" element={<Istio />} />
<Route path="/gateway" element={<Gateway />} />
<Route path="/canary" element={<Canary />} />
```

- [ ] **Step 7.2: TypeScript check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7.3: Run all frontend tests**

```bash
cd web && npx vitest run
```

Expected: all tests pass (Sidebar ×7, Pods ×3, Istio ×4, Gateway ×4, Canary ×6, api ×N).

- [ ] **Step 7.4: Run all Go tests**

```bash
go test ./...
```

Expected: all tests pass.

- [ ] **Step 7.5: Commit**

```bash
git add web/src/App.tsx
git commit -m "feat: wire /istio, /gateway, /canary routes — CRD pages complete"
```

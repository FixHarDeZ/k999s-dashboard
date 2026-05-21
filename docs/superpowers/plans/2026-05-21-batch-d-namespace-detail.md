# Batch D — Namespace Drill-down Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a namespace detail page at `/namespaces/:name` that shows all standard resources inside a namespace with YAML view/edit.

**Architecture:** Pure frontend — no new backend needed. `NamespaceDetail.tsx` fetches 7 resource kinds in parallel using existing fetch functions. Navigation from `Namespaces.tsx` via React Router `<Link>`. Each resource has a YAML button using the existing `YamlSidePanel` with `editable` prop.

**Tech Stack:** TypeScript, React, react-router-dom (`useParams`, `useNavigate`, `Link`), existing fetch functions, `YamlSidePanel`, Tailwind v4

---

## File Map

| File | Change |
|---|---|
| `web/src/pages/NamespaceDetail.tsx` | **Create** — namespace detail page |
| `web/src/App.tsx` | Add route `/namespaces/:name` |
| `web/src/pages/Namespaces.tsx` | Make namespace name a clickable `<Link>` |

---

## Task 1: NamespaceDetail page + App.tsx route

**Files:**
- Create: `web/src/pages/NamespaceDetail.tsx`
- Modify: `web/src/App.tsx`

- [ ] **Step 1.1: Create web/src/pages/NamespaceDetail.tsx**

Create `web/src/pages/NamespaceDetail.tsx` with this exact content:

```tsx
import { useParams, useNavigate } from 'react-router-dom'
import { useEffect, useState, useCallback } from 'react'
import { RefreshButton } from '@/components/RefreshButton'
import { YamlSidePanel } from '@/components/YamlSidePanel'
import {
  fetchPods, fetchDeployments, fetchStatefulSets,
  fetchServices, fetchConfigMaps, fetchSecrets, fetchIngresses,
} from '@/lib/api'
import type {
  PodSummary, DeploymentSummary, StatefulSetSummary,
  ServiceSummary, ConfigMapSummary, SecretSummary, IngressSummary,
} from '@/lib/types'

interface ResourceRow {
  name: string
  detail: string
}

function ResourceSection({
  title, icon, items, collapsed, onToggle, onYaml,
}: {
  title: string
  icon: string
  items: ResourceRow[]
  collapsed: boolean
  onToggle: () => void
  onYaml: (name: string) => void
}) {
  return (
    <div className="border border-primary-100 rounded-lg overflow-hidden mb-3">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-primary-50 hover:bg-primary-100 text-left"
      >
        <span className="text-xs font-bold text-primary-700">
          {icon} {title}{' '}
          <span className="text-primary-400 font-normal">({items.length})</span>
        </span>
        <span className="text-primary-400 text-xs">{collapsed ? '▶' : '▼'}</span>
      </button>
      {!collapsed && (
        <table className="w-full">
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td className="px-3 py-2 text-xs text-gray-400">No resources</td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.name} className="border-t border-primary-50 hover:bg-primary-50/50">
                  <td className="px-3 py-2 text-xs font-medium text-primary-900">{item.name}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{item.detail}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => onYaml(item.name)}
                      className="text-[10px] px-2 py-0.5 rounded border border-primary-200 text-primary-600 hover:bg-primary-50"
                    >
                      YAML
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      )}
    </div>
  )
}

export function NamespaceDetail() {
  const { name: namespaceName = '' } = useParams<{ name: string }>()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [yamlTarget, setYamlTarget] = useState<{
    group: string; version: string; resource: string; name: string
  } | null>(null)

  const [pods, setPods] = useState<PodSummary[]>([])
  const [deployments, setDeployments] = useState<DeploymentSummary[]>([])
  const [statefulsets, setStatefulsets] = useState<StatefulSetSummary[]>([])
  const [services, setServices] = useState<ServiceSummary[]>([])
  const [configmaps, setConfigmaps] = useState<ConfigMapSummary[]>([])
  const [secrets, setSecrets] = useState<SecretSummary[]>([])
  const [ingresses, setIngresses] = useState<IngressSummary[]>([])

  const load = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetchPods(namespaceName).catch(() => [] as PodSummary[]),
      fetchDeployments(namespaceName).catch(() => [] as DeploymentSummary[]),
      fetchStatefulSets(namespaceName).catch(() => [] as StatefulSetSummary[]),
      fetchServices(namespaceName).catch(() => [] as ServiceSummary[]),
      fetchConfigMaps(namespaceName).catch(() => [] as ConfigMapSummary[]),
      fetchSecrets(namespaceName).catch(() => [] as SecretSummary[]),
      fetchIngresses(namespaceName).catch(() => [] as IngressSummary[]),
    ]).then(([p, d, ss, svc, cm, sec, ing]) => {
      setPods(p)
      setDeployments(d)
      setStatefulsets(ss)
      setServices(svc)
      setConfigmaps(cm)
      setSecrets(sec)
      setIngresses(ing)
      setLoading(false)
    })
  }, [namespaceName])

  useEffect(() => { load() }, [load])

  const toggleSection = (key: string) =>
    setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const sections = [
    {
      key: 'pods', title: 'Pods', icon: '📦',
      items: pods.map(p => ({ name: p.name, detail: p.status })),
      group: '', version: 'v1', resource: 'pods',
    },
    {
      key: 'deployments', title: 'Deployments', icon: '🚀',
      items: deployments.map(d => ({ name: d.name, detail: d.ready })),
      group: 'apps', version: 'v1', resource: 'deployments',
    },
    {
      key: 'statefulsets', title: 'StatefulSets', icon: '🗄️',
      items: statefulsets.map(s => ({ name: s.name, detail: s.ready })),
      group: 'apps', version: 'v1', resource: 'statefulsets',
    },
    {
      key: 'services', title: 'Services', icon: '⚙️',
      items: services.map(s => ({ name: s.name, detail: s.type })),
      group: '', version: 'v1', resource: 'services',
    },
    {
      key: 'configmaps', title: 'ConfigMaps', icon: '📄',
      items: configmaps.map(c => ({ name: c.name, detail: `${c.dataCount} keys` })),
      group: '', version: 'v1', resource: 'configmaps',
    },
    {
      key: 'secrets', title: 'Secrets', icon: '🔒',
      items: secrets.map(s => ({ name: s.name, detail: s.type })),
      group: '', version: 'v1', resource: 'secrets',
    },
    {
      key: 'ingresses', title: 'Ingresses', icon: '🌐',
      items: ingresses.map(i => ({ name: i.name, detail: i.hosts || '-' })),
      group: 'networking.k8s.io', version: 'v1', resource: 'ingresses',
    },
  ]

  return (
    <div>
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate(-1)}
          className="text-xs text-primary-500 hover:text-primary-700"
        >
          ← Back
        </button>
        <h1 className="text-base font-bold text-primary-900">Namespace: {namespaceName}</h1>
        <RefreshButton onRefresh={load} />
      </div>

      {loading ? (
        <p className="text-xs text-primary-400">Loading resources...</p>
      ) : (
        sections.map(section => (
          <ResourceSection
            key={section.key}
            title={section.title}
            icon={section.icon}
            items={section.items}
            collapsed={!!collapsed[section.key]}
            onToggle={() => toggleSection(section.key)}
            onYaml={(name) => setYamlTarget({
              group: section.group,
              version: section.version,
              resource: section.resource,
              name,
            })}
          />
        ))
      )}

      {yamlTarget && (
        <YamlSidePanel
          group={yamlTarget.group}
          version={yamlTarget.version}
          resource={yamlTarget.resource}
          namespace={namespaceName}
          name={yamlTarget.name}
          onClose={() => setYamlTarget(null)}
          editable
        />
      )}
    </div>
  )
}
```

- [ ] **Step 1.2: Add route to App.tsx**

In `web/src/App.tsx`:

Add import after the Helm import:
```tsx
import { NamespaceDetail } from '@/pages/NamespaceDetail'
```

Add route after the existing `/namespaces` route:
```tsx
<Route path="/namespaces/:name" element={<NamespaceDetail />} />
```

The existing `/namespaces` route stays unchanged. The new specific route `/namespaces/:name` goes right after it.

- [ ] **Step 1.3: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 1.4: Run frontend tests**

```bash
cd web && npx vitest run 2>&1 | tail -3
```

Expected: all 31 tests PASS

- [ ] **Step 1.5: Commit**

```bash
git add web/src/pages/NamespaceDetail.tsx web/src/App.tsx
git commit -m "feat(namespaces): add NamespaceDetail page with 7 resource kind sections"
```

---

## Task 2: Namespaces.tsx — clickable namespace links

**Files:**
- Modify: `web/src/pages/Namespaces.tsx`

- [ ] **Step 2.1: Update Namespaces.tsx**

In `web/src/pages/Namespaces.tsx`:

**Add import** at the top (after existing imports):
```tsx
import { Link } from 'react-router-dom'
```

**Replace the `name` column** — change from plain `<span>` to a `<Link>`:

```tsx
// OLD:
col.accessor('name', { header: 'Name', cell: (i) => <span className="font-medium text-xs text-primary-900">{i.getValue()}</span> }),

// NEW:
col.accessor('name', { header: 'Name', cell: (i) => (
  <Link
    to={`/namespaces/${i.getValue()}`}
    className="font-medium text-xs text-primary-600 hover:text-primary-900 hover:underline"
  >
    {i.getValue()}
  </Link>
) }),
```

- [ ] **Step 2.2: Type-check**

```bash
cd web && npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 2.3: Run all tests + build binary**

```bash
go test ./... && cd web && npx vitest run 2>&1 | tail -3
cd /Users/peerawat.ujaiyen/MyCode/k999s-dashboard && make build 2>&1 | tail -3
```

Expected: all PASS, binary built

- [ ] **Step 2.4: Commit**

```bash
git add web/src/pages/Namespaces.tsx
git commit -m "feat(namespaces): make namespace names clickable links to detail page"
```

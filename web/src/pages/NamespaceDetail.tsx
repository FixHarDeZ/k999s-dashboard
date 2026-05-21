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

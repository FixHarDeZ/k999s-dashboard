import type { PodSummary, DeploymentSummary, StatefulSetSummary, DaemonSetSummary, IngressSummary, HelmReleaseSummary, ContextInfo, ServiceSummary, NodeSummary, NamespaceSummary, ConfigMapSummary, SecretSummary, EventSummary, PodMetricsSummary, NodeMetricsSummary, TopologyGraph, APIResourceInfo, CRDPresence, JobSummary, CronJobSummary, HPASummary, PortForwardEntry } from './types'

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

export async function fetchStatefulSets(namespace: string): Promise<StatefulSetSummary[]> {
  const data = await get<{ items: StatefulSetSummary[] }>(`/api/v1/statefulsets?namespace=${namespace}`)
  return data.items
}

async function action(path: string, method: string, body?: unknown): Promise<void> {
  const options: Record<string, unknown> = { method }
  if (body) {
    options.headers = { 'Content-Type': 'application/json' }
    options.body = JSON.stringify(body)
  }
  const res = await fetch(path, options)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
}

export const deletePod = (ns: string, name: string) =>
  action(`/api/v1/pods/${ns}/${name}`, 'DELETE')

export const restartPod = (ns: string, name: string) =>
  action(`/api/v1/pods/${ns}/${name}/restart`, 'POST')

export const scaleDeployment = (ns: string, name: string, replicas: number) =>
  action(`/api/v1/deployments/${ns}/${name}/scale`, 'POST', { replicas })

export const rolloutRestartDeployment = (ns: string, name: string) =>
  action(`/api/v1/deployments/${ns}/${name}/rollout-restart`, 'POST')

export const deleteDeployment = (ns: string, name: string) =>
  action(`/api/v1/deployments/${ns}/${name}`, 'DELETE')

export const cordonNode = (name: string) =>
  action(`/api/v1/nodes/${name}/cordon`, 'POST')

export const uncordonNode = (name: string) =>
  action(`/api/v1/nodes/${name}/uncordon`, 'POST')

export const drainNode = (name: string) =>
  action(`/api/v1/nodes/${name}/drain`, 'POST')

export async function fetchServices(namespace: string): Promise<ServiceSummary[]> {
  const data = await get<{ items: ServiceSummary[] }>(`/api/v1/services?namespace=${namespace}`)
  return data.items
}

export async function fetchIngresses(namespace: string): Promise<IngressSummary[]> {
  const data = await get<{ items: IngressSummary[] }>(`/api/v1/ingresses?namespace=${namespace}`)
  return data.items
}

export async function fetchNodes(): Promise<NodeSummary[]> {
  const data = await get<{ items: NodeSummary[] }>('/api/v1/nodes')
  return data.items
}

export async function fetchNamespaceSummaries(): Promise<NamespaceSummary[]> {
  const data = await get<{ items: NamespaceSummary[] }>('/api/v1/namespace-summaries')
  return data.items
}

export async function fetchConfigMaps(namespace: string): Promise<ConfigMapSummary[]> {
  const data = await get<{ items: ConfigMapSummary[] }>(`/api/v1/configmaps?namespace=${namespace}`)
  return data.items
}

export async function fetchSecrets(namespace: string): Promise<SecretSummary[]> {
  const data = await get<{ items: SecretSummary[] }>(`/api/v1/secrets?namespace=${namespace}`)
  return data.items
}

export async function fetchEvents(namespace: string): Promise<EventSummary[]> {
  const data = await get<{ items: EventSummary[] }>(`/api/v1/events?namespace=${namespace}`)
  return data.items
}

export async function fetchPodMetrics(namespace: string): Promise<PodMetricsSummary[]> {
  const data = await get<{ items: PodMetricsSummary[] }>(`/api/v1/pod-metrics?namespace=${namespace}`)
  return data.items
}

export async function fetchNodeMetrics(): Promise<NodeMetricsSummary[]> {
  const data = await get<{ items: NodeMetricsSummary[] }>('/api/v1/node-metrics')
  return data.items
}

export async function fetchPodContainers(namespace: string, podName: string): Promise<string[]> {
  const data = await get<{ items: string[] }>(`/api/v1/pods/${namespace}/${podName}/containers`)
  return data.items
}

/** Returns a WebSocket URL for pod log streaming */
export function podLogsWsUrl(namespace: string, name: string, container: string, follow: boolean, previous: boolean, tail?: number): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({ container, follow: String(follow), previous: String(previous) })
  if (tail && tail > 0) params.set('tail', String(tail))
  return `${protocol}//${window.location.host}/ws/pods/${namespace}/${name}/logs?${params}`
}

/** Returns a WebSocket URL for pod exec */
export function podExecWsUrl(namespace: string, name: string, container: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const params = new URLSearchParams({ container })
  return `${protocol}//${window.location.host}/ws/pods/${namespace}/${name}/exec?${params}`
}

export async function fetchTopology(namespace: string): Promise<TopologyGraph> {
  return get<TopologyGraph>(`/api/v1/topology?namespace=${namespace}`)
}

export async function fetchAPIResources(): Promise<APIResourceInfo[]> {
  const data = await get<{ items: APIResourceInfo[] }>('/api/v1/api-resources')
  return data.items
}

export async function fetchResourceList(
  group: string, version: string, resource: string, namespace: string
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams({ group, version, resource, namespace })
  const data = await get<{ items: Record<string, unknown>[] }>(`/api/v1/resource-list?${params}`)
  return data.items
}

export async function fetchResourceGet(
  group: string, version: string, resource: string, namespace: string, name: string
): Promise<string> {
  const params = new URLSearchParams({ group, version, resource, namespace, name })
  const res = await fetch(`/api/v1/resource-get?${params}`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return JSON.stringify(json, null, 2)
}

export async function applyResource(
  group: string, version: string, resource: string, namespace: string, name: string,
  data: unknown
): Promise<void> {
  const res = await fetch('/api/v1/resource-apply', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ group, version, resource, namespace, name, data }),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
}

/** Returns a WebSocket URL for AI diagnostic streaming */
export function diagnosticWsUrl(namespace: string, name: string): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/ws/pods/${namespace}/${name}/diagnose`
}

export async function fetchDetectedCRDs(): Promise<CRDPresence> {
  return get<CRDPresence>('/api/v1/detected-crds')
}

export async function switchContext(contextName: string): Promise<void> {
  await action('/api/v1/contexts/switch', 'POST', { context: contextName })
}

export async function fetchSettings(): Promise<{ provider: string; model: string; apiKey: string; baseURL: string }> {
  return get('/api/v1/settings')
}

export async function saveSettings(settings: { provider: string; model: string; apiKey: string; baseURL: string }): Promise<void> {
  const res = await fetch('/api/v1/settings', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error: string }).error)
  }
}

export async function fetchHelmReleases(namespace: string): Promise<HelmReleaseSummary[]> {
  const data = await get<{ items: HelmReleaseSummary[] }>(`/api/v1/helm/releases?namespace=${namespace}`)
  return data.items
}

export const uninstallHelmRelease = (namespace: string, name: string) =>
  action(`/api/v1/helm/releases/${namespace}/${name}`, 'DELETE')

export async function fetchDaemonSets(namespace: string): Promise<DaemonSetSummary[]> {
  const data = await get<{ items: DaemonSetSummary[] }>(`/api/v1/daemonsets?namespace=${namespace}`)
  return data.items
}

export const rolloutRestartDaemonSet = (ns: string, name: string) =>
  action(`/api/v1/daemonsets/${ns}/${name}/rollout-restart`, 'POST')

export const deleteDaemonSet = (ns: string, name: string) =>
  action(`/api/v1/daemonsets/${ns}/${name}`, 'DELETE')

export async function fetchJobs(namespace: string): Promise<JobSummary[]> {
  const data = await get<{ items: JobSummary[] }>(`/api/v1/jobs?namespace=${namespace}`)
  return data.items
}

export const deleteJob = (ns: string, name: string) =>
  action(`/api/v1/jobs/${ns}/${name}`, 'DELETE')

export async function fetchCronJobs(namespace: string): Promise<CronJobSummary[]> {
  const data = await get<{ items: CronJobSummary[] }>(`/api/v1/cronjobs?namespace=${namespace}`)
  return data.items
}

export const deleteCronJob = (ns: string, name: string) =>
  action(`/api/v1/cronjobs/${ns}/${name}`, 'DELETE')

export const triggerCronJob = (ns: string, name: string) =>
  action(`/api/v1/cronjobs/${ns}/${name}/trigger`, 'POST')

export async function fetchHPAs(namespace: string): Promise<HPASummary[]> {
  const data = await get<{ items: HPASummary[] }>(`/api/v1/hpas?namespace=${namespace}`)
  return data.items
}

export const patchHPALimits = (ns: string, name: string, minReplicas: number, maxReplicas: number) =>
  action(`/api/v1/hpas/${ns}/${name}/limits`, 'PATCH', { minReplicas, maxReplicas })

export async function startPortForward(req: {
  namespace: string
  targetKind: string
  targetName: string
  localPort: number
  remotePort: number
}): Promise<{ id: string; localPort: number }> {
  const res = await fetch('/api/v1/port-forward', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
  return res.json()
}

export async function listPortForwards(): Promise<PortForwardEntry[]> {
  const data = await get<{ items: PortForwardEntry[] }>('/api/v1/port-forward')
  return data.items
}

export const stopPortForward = (id: string) =>
  action(`/api/v1/port-forward/${id}`, 'DELETE')

export const rollbackDeployment = (ns: string, name: string) =>
  action(`/api/v1/deployments/${ns}/${name}/rollback`, 'POST')

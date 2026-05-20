import type { PodSummary, DeploymentSummary, ContextInfo, ServiceSummary, NodeSummary, NamespaceSummary, ConfigMapSummary, SecretSummary } from './types'

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

export async function fetchServices(namespace: string): Promise<ServiceSummary[]> {
  const data = await get<{ items: ServiceSummary[] }>(`/api/v1/services?namespace=${namespace}`)
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

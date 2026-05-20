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

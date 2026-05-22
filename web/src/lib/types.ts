export interface ContainerInfo {
  name: string
  type: 'init' | 'sidecar' | 'main'
  ready: boolean
  restarts: number
  state: string
  reason: string
}

export interface PodSummary {
  name: string
  namespace: string
  status: 'Running' | 'Pending' | 'Succeeded' | 'Failed' | 'Unknown' | string
  ready: string
  restarts: number
  age: string
  node: string
  ip: string
  containers: ContainerInfo[]
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

export interface ServiceSummary {
  name: string
  namespace: string
  type: string
  clusterIP: string
  ports: string
  age: string
}

export interface IngressSummary {
  name: string
  namespace: string
  hosts: string
  address: string
  ports: string
  age: string
}

export interface NodeSummary {
  name: string
  status: 'Ready' | 'NotReady' | string
  roles: string
  age: string
  version: string
  schedulable: boolean
}

export interface NamespaceSummary {
  name: string
  status: string
  age: string
}

export interface ConfigMapSummary {
  name: string
  namespace: string
  dataCount: number
  age: string
}

export interface SecretSummary {
  name: string
  namespace: string
  type: string
  dataCount: number
  age: string
}

export interface EventSummary {
  name: string
  namespace: string
  reason: string
  message: string
  type: 'Normal' | 'Warning' | string
  object: string
  count: number
  age: string
}

export interface PodMetricsSummary {
  name: string
  namespace: string
  cpu: string
  memory: string
}

export interface NodeMetricsSummary {
  name: string
  cpu: string
  memory: string
}

export interface StatefulSetSummary {
  name: string
  namespace: string
  ready: string
  age: string
}

export interface TopologyNode {
  id: string
  kind: 'Pod' | 'Deployment' | 'Service' | 'Ingress' | string
  name: string
  namespace: string
  status: string
  labels?: Record<string, string>
}

export interface TopologyEdge {
  source: string
  target: string
  label: string
}

export interface TopologyGraph {
  nodes: TopologyNode[]
  edges: TopologyEdge[]
}

export interface APIResourceInfo {
  name: string
  kind: string
  group: string
  version: string
  namespaced: boolean
}

export interface AISettings {
  provider: string
  model: string
  apiKey: string
  baseURL: string
}

export interface CRDPresence {
  istio: boolean
  gatewayApi: boolean
  flaggerCanary: boolean
  argoRollouts: boolean
}

export interface HelmReleaseSummary {
  name: string
  namespace: string
  revision: string
  updated: string
  status: string
  chart: string
  appVersion: string
}

export interface DaemonSetSummary {
  name: string
  namespace: string
  desired: number
  current: number
  ready: number
  available: number
  age: string
}

export interface JobSummary {
  name: string
  namespace: string
  completions: string
  succeeded: number
  failed: number
  status: 'Complete' | 'Running' | 'Failed' | string
  duration: string
  age: string
}

export interface CronJobSummary {
  name: string
  namespace: string
  schedule: string
  suspend: boolean
  active: number
  lastSchedule: string
  age: string
}

export interface HPASummary {
  name: string
  namespace: string
  targetKind: string
  targetName: string
  minReplicas: number
  maxReplicas: number
  currentReplicas: number
  age: string
}

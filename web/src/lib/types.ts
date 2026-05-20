export interface PodSummary {
  name: string
  namespace: string
  status: 'Running' | 'Pending' | 'Succeeded' | 'Failed' | 'Unknown' | string
  ready: string
  restarts: number
  age: string
  node: string
  ip: string
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

export interface NodeSummary {
  name: string
  status: 'Ready' | 'NotReady' | string
  roles: string
  age: string
  version: string
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

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

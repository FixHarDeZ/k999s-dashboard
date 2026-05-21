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

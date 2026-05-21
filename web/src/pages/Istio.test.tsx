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
    await waitFor(() => expect(screen.getAllByText('reviews').length).toBeGreaterThan(0))
  })

  it('shows empty state when no resources', async () => {
    vi.mocked(api.fetchResourceList).mockResolvedValue([])
    renderIstio()
    await waitFor(() => expect(screen.getByText('No resources found')).toBeInTheDocument())
  })
})

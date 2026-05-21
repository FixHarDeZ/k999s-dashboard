import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, Outlet } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Canary } from './Canary'
import * as api from '@/lib/api'
import type { CRDPresence } from '@/lib/types'

vi.mock('@/lib/api')

const mockAPIResources = [
  { name: 'canaries', kind: 'Canary', group: 'flagger.app', version: 'v1beta1', namespaced: true },
  { name: 'rollouts', kind: 'Rollout', group: 'argoproj.io', version: 'v1alpha1', namespaced: true },
]

const mockCanaries = [
  {
    metadata: { name: 'podinfo', namespace: 'default', creationTimestamp: new Date(Date.now() - 3600000).toISOString() },
    spec: { targetRef: { name: 'podinfo', kind: 'Deployment' }, analysis: { maxWeight: 50 } },
    status: { phase: 'Progressing', canaryWeight: 20 },
  },
]

function renderCanary(detectedCRDs: CRDPresence) {
  function Parent() {
    return <Outlet context={{ namespace: '', detectedCRDs }} />
  }
  return render(
    <MemoryRouter initialEntries={['/canary']}>
      <Routes>
        <Route element={<Parent />}>
          <Route path="/canary" element={<Canary />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

describe('Canary page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchAPIResources).mockResolvedValue(mockAPIResources)
    vi.mocked(api.fetchResourceList).mockResolvedValue(mockCanaries)
  })

  it('renders page heading', () => {
    renderCanary({ istio: false, gatewayApi: false, flaggerCanary: true, argoRollouts: false })
    expect(screen.getByText('Canary')).toBeInTheDocument()
  })

  it('shows Flagger Canary tab when flaggerCanary detected', () => {
    renderCanary({ istio: false, gatewayApi: false, flaggerCanary: true, argoRollouts: false })
    expect(screen.getByText('Flagger Canary')).toBeInTheDocument()
  })

  it('shows Argo Rollouts tab when argoRollouts detected', () => {
    vi.mocked(api.fetchResourceList).mockResolvedValue([])
    renderCanary({ istio: false, gatewayApi: false, flaggerCanary: false, argoRollouts: true })
    expect(screen.getByText('Argo Rollouts')).toBeInTheDocument()
  })

  it('shows both tabs when both detected', () => {
    renderCanary({ istio: false, gatewayApi: false, flaggerCanary: true, argoRollouts: true })
    expect(screen.getByText('Flagger Canary')).toBeInTheDocument()
    expect(screen.getByText('Argo Rollouts')).toBeInTheDocument()
  })

  it('shows Flagger canary resource name after loading', async () => {
    renderCanary({ istio: false, gatewayApi: false, flaggerCanary: true, argoRollouts: false })
    await waitFor(() => expect(screen.getAllByText('podinfo').length).toBeGreaterThan(0))
  })

  it('shows phase badge', async () => {
    renderCanary({ istio: false, gatewayApi: false, flaggerCanary: true, argoRollouts: false })
    await waitFor(() => expect(screen.getByText('Progressing')).toBeInTheDocument())
  })
})

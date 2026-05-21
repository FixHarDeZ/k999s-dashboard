import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { Sidebar } from './Sidebar'

describe('Sidebar', () => {
  it('renders all main navigation sections', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(screen.getByText('Pods')).toBeInTheDocument()
    expect(screen.getByText('Deployments')).toBeInTheDocument()
    expect(screen.getByText('Services')).toBeInTheDocument()
    expect(screen.getByText('Nodes')).toBeInTheDocument()
  })

  it('renders k999s brand', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(screen.getByText('k999s')).toBeInTheDocument()
  })

  it('hides Istio/Gateway/Canary when no CRDs detected', () => {
    render(<MemoryRouter><Sidebar /></MemoryRouter>)
    expect(screen.queryByText('Istio')).not.toBeInTheDocument()
    expect(screen.queryByText('Gateway API')).not.toBeInTheDocument()
    expect(screen.queryByText('Canary')).not.toBeInTheDocument()
  })

  it('shows Istio when istio CRD detected', () => {
    render(<MemoryRouter><Sidebar detectedCRDs={{ istio: true, gatewayApi: false, flaggerCanary: false, argoRollouts: false }} /></MemoryRouter>)
    expect(screen.getByText('Istio')).toBeInTheDocument()
  })

  it('shows Gateway API when gatewayApi CRD detected', () => {
    render(<MemoryRouter><Sidebar detectedCRDs={{ istio: false, gatewayApi: true, flaggerCanary: false, argoRollouts: false }} /></MemoryRouter>)
    expect(screen.getByText('Gateway API')).toBeInTheDocument()
  })

  it('shows Canary when flaggerCanary detected', () => {
    render(<MemoryRouter><Sidebar detectedCRDs={{ istio: false, gatewayApi: false, flaggerCanary: true, argoRollouts: false }} /></MemoryRouter>)
    expect(screen.getByText('Canary')).toBeInTheDocument()
  })

  it('shows Canary when argoRollouts detected', () => {
    render(<MemoryRouter><Sidebar detectedCRDs={{ istio: false, gatewayApi: false, flaggerCanary: false, argoRollouts: true }} /></MemoryRouter>)
    expect(screen.getByText('Canary')).toBeInTheDocument()
  })
})

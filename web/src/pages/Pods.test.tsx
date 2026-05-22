import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Pods } from './Pods'
import * as api from '@/lib/api'

vi.mock('@/lib/api')
vi.mock('@/hooks/useWebSocket', () => ({ useWebSocket: vi.fn() }))


const mockPods = [
  { name: 'nginx-abc', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '2h', node: 'node-1', ip: '10.0.0.1', containers: [], cpuRequest: '100m', cpuLimit: '500m', memRequest: '128Mi', memLimit: '256Mi' },
  { name: 'crash-pod', namespace: 'default', status: 'CrashLoopBackOff', ready: '0/1', restarts: 5, age: '30m', node: 'node-2', ip: '10.0.0.2', containers: [], cpuRequest: '100m', cpuLimit: '500m', memRequest: '128Mi', memLimit: '256Mi' },
]

function renderPods() {
  return render(
    <MemoryRouter initialEntries={['/pods']}>
      <Routes>
        <Route path="/pods" element={<Pods />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Pods page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchPods).mockResolvedValue(mockPods)
    vi.mocked(api.fetchPodMetrics).mockResolvedValue([])
  })

  it('renders pod names after loading', async () => {
    renderPods()
    await waitFor(() => expect(screen.getByText('nginx-abc')).toBeInTheDocument())
    expect(screen.getByText('crash-pod')).toBeInTheDocument()
  })

  it('shows Running status in green', async () => {
    renderPods()
    await waitFor(() => screen.getByText('nginx-abc'))
    const statusEl = screen.getByText('● Running')
    expect(statusEl.className).toContain('text-green')
  })

  it('highlights CrashLoopBackOff pods', async () => {
    renderPods()
    await waitFor(() => screen.getByText('crash-pod'))
    const statusEl = screen.getByText('● CrashLoopBackOff')
    expect(statusEl.className).toContain('text-red')
  })
})

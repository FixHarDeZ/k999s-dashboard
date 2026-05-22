import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { DaemonSets } from './DaemonSets'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockDaemonSets = [
  { name: 'fluentd', namespace: 'logging', desired: 3, current: 3, ready: 3, available: 3, age: '5d' },
  { name: 'node-exporter', namespace: 'monitoring', desired: 2, current: 2, ready: 1, available: 1, age: '2d' },
]

function renderDaemonSets() {
  return render(
    <MemoryRouter initialEntries={['/daemonsets']}>
      <Routes>
        <Route path="/daemonsets" element={<DaemonSets />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('DaemonSets page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchDaemonSets).mockResolvedValue(mockDaemonSets)
  })

  it('renders daemonset names after loading', async () => {
    renderDaemonSets()
    await waitFor(() => expect(screen.getByText('fluentd')).toBeInTheDocument())
    expect(screen.getByText('node-exporter')).toBeInTheDocument()
  })

  it('shows Rollout Restart and Delete buttons', async () => {
    renderDaemonSets()
    await waitFor(() => screen.getByText('fluentd'))
    expect(screen.getAllByTitle('Rollout Restart').length).toBeGreaterThan(0)
    expect(screen.getAllByTitle('Delete').length).toBeGreaterThan(0)
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Jobs } from './Jobs'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockJobs = [
  { name: 'backup', namespace: 'default', completions: '1/1', succeeded: 1, failed: 0, status: 'Complete', duration: '30s', age: '1h' },
  { name: 'migration', namespace: 'default', completions: '0/1', succeeded: 0, failed: 1, status: 'Failed', duration: '5m', age: '2h' },
]

function renderJobs() {
  return render(
    <MemoryRouter initialEntries={['/jobs']}>
      <Routes>
        <Route path="/jobs" element={<Jobs />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('Jobs page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchJobs).mockResolvedValue(mockJobs)
  })

  it('renders job names after loading', async () => {
    renderJobs()
    await waitFor(() => expect(screen.getByText('backup')).toBeInTheDocument())
    expect(screen.getByText('migration')).toBeInTheDocument()
  })

  it('shows status badges', async () => {
    renderJobs()
    await waitFor(() => screen.getByText('backup'))
    expect(screen.getByText('Complete')).toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })
})

import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { CronJobs } from './CronJobs'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockCronJobs = [
  { name: 'backup', namespace: 'default', schedule: '0 * * * *', suspend: false, active: 0, lastSchedule: '1h', age: '5d' },
  { name: 'cleanup', namespace: 'default', schedule: '0 0 * * *', suspend: true, active: 0, lastSchedule: 'Never', age: '2d' },
]

function renderCronJobs() {
  return render(
    <MemoryRouter initialEntries={['/cronjobs']}>
      <Routes>
        <Route path="/cronjobs" element={<CronJobs />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('CronJobs page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchCronJobs).mockResolvedValue(mockCronJobs)
  })

  it('renders cronjob names after loading', async () => {
    renderCronJobs()
    await waitFor(() => expect(screen.getByText('backup')).toBeInTheDocument())
    expect(screen.getByText('cleanup')).toBeInTheDocument()
  })

  it('shows suspend badges', async () => {
    renderCronJobs()
    await waitFor(() => screen.getByText('backup'))
    expect(screen.getByText('Active')).toBeInTheDocument()
    expect(screen.getByText('Suspended')).toBeInTheDocument()
  })
})

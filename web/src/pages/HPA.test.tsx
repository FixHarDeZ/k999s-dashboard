import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { HPA } from './HPA'
import * as api from '@/lib/api'

vi.mock('@/lib/api')

const mockHPAs = [
  { name: 'my-hpa', namespace: 'default', targetKind: 'Deployment', targetName: 'my-app', minReplicas: 2, maxReplicas: 10, currentReplicas: 3, age: '1d' },
]

function renderHPA() {
  return render(
    <MemoryRouter initialEntries={['/hpa']}>
      <Routes>
        <Route path="/hpa" element={<HPA />} />
      </Routes>
    </MemoryRouter>
  )
}

describe('HPA page', () => {
  beforeEach(() => {
    vi.mocked(api.fetchHPAs).mockResolvedValue(mockHPAs)
  })

  it('renders HPA names after loading', async () => {
    renderHPA()
    await waitFor(() => expect(screen.getByText('my-hpa')).toBeInTheDocument())
  })

  it('shows target reference', async () => {
    renderHPA()
    await waitFor(() => screen.getByText('my-hpa'))
    expect(screen.getByText('Deployment/my-app')).toBeInTheDocument()
  })
})

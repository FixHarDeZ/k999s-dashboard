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
})

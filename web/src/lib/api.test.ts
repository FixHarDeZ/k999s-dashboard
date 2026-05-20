import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchPods, fetchNamespaces } from './api'

const mockFetch = vi.fn()
globalThis.fetch = mockFetch as any

beforeEach(() => mockFetch.mockReset())

describe('fetchPods', () => {
  it('calls correct endpoint with namespace', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ items: [{ name: 'pod-1', namespace: 'default', status: 'Running', ready: '1/1', restarts: 0, age: '1h', node: 'node-1', ip: '10.0.0.1' }] }),
    })

    const result = await fetchPods('default')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/pods?namespace=default')
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('pod-1')
  })

  it('fetches all namespaces when namespace is empty', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: [] }) })
    await fetchPods('')
    expect(mockFetch).toHaveBeenCalledWith('/api/v1/pods?namespace=')
  })
})

describe('fetchNamespaces', () => {
  it('returns namespace list', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ items: ['default', 'kube-system'] }) })
    const result = await fetchNamespaces()
    expect(result).toEqual(['default', 'kube-system'])
  })
})

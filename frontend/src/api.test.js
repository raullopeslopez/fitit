import { apiFetch } from './api.js'
import { getToken, setToken, setUnauthorizedHandler } from './auth.js'

describe('apiFetch', () => {
  beforeEach(() => {
    localStorage.clear()
    setUnauthorizedHandler(null)
    vi.restoreAllMocks()
  })

  it('attaches the stored token as a Bearer header and prefixes /api', async () => {
    setToken('tok-123')
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await apiFetch('/workouts')

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/workouts')
    expect(options.headers.Authorization).toBe('Bearer tok-123')
  })

  it('parses and returns JSON on success', async () => {
    setToken('tok')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 1 }) }),
    )
    expect(await apiFetch('/workouts/1')).toEqual({ id: 1 })
  })

  it('returns null for a 204 No Content response', async () => {
    setToken('tok')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }))
    expect(await apiFetch('/workouts/sets/1', { method: 'DELETE' })).toBeNull()
  })

  it('clears the token and notifies on 401', async () => {
    setToken('tok')
    const onUnauthorized = vi.fn()
    setUnauthorizedHandler(onUnauthorized)
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }),
    )

    await expect(apiFetch('/workouts')).rejects.toThrow()
    expect(getToken()).toBeNull()
    expect(onUnauthorized).toHaveBeenCalled()
  })
})

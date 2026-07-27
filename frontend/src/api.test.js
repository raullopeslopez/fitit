import { apiFetch, register } from './api.js'
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

describe('register', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.restoreAllMocks()
  })

  it('posts the credentials and returns the access token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ access_token: 'tok-new', token_type: 'bearer' }),
    })
    vi.stubGlobal('fetch', fetchMock)

    expect(await register('amigo', 's3cretpass')).toBe('tok-new')

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/auth/register')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({
      username: 'amigo',
      password: 's3cretpass',
    })
  })

  // The status is what Register.jsx branches on to tell "that name is taken"
  // apart from every other refusal, so it has to survive the throw.
  it('carries the status on the error when the username is taken', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ detail: 'username already taken' }),
      }),
    )

    await expect(register('amigo', 's3cretpass')).rejects.toMatchObject({ status: 409 })
  })

  it('still rejects when the error body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json')
        },
      }),
    )

    await expect(register('amigo', 's3cretpass')).rejects.toMatchObject({ status: 500 })
  })
})

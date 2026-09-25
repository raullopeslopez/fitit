import { afterEach, describe, expect, it, vi } from 'vitest'

import { version } from '../../package.json'

async function load() {
  vi.resetModules()
  return import('./http.js')
}

describe('platform/http', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('sin VITE_API_BASE las rutas quedan relativas, como en la web de siempre', async () => {
    vi.stubEnv('VITE_API_BASE', '')
    const { apiUrl } = await load()
    expect(apiUrl('/days')).toBe('/api/days')
  })

  it('con VITE_API_BASE habla con ese origen, que es lo que hará el APK', async () => {
    vi.stubEnv('VITE_API_BASE', 'https://fitit-n4q0.onrender.com/')
    const { apiUrl } = await load()
    expect(apiUrl('/days')).toBe('https://fitit-n4q0.onrender.com/api/days')
  })

  it('cada petición dice qué versión de la app la hace', async () => {
    const { clientHeaders } = await load()
    expect(clientHeaders()).toEqual({ 'X-Client-Version': version })
  })
})

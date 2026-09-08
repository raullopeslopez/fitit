import { apiFetch, deleteExercise, logFood, mergeExercise, register } from './api.js'
import { foodDayIso } from './food.js'
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

  // El cuerpo del error, no sólo su número. El 409 del renombrado trae el
  // ejercicio con el que chocaste —id, nombre tal y como está guardado, kind y
  // cuántas series lleva— y ésa es la única fuente que conoce un ejercicio que
  // la pantalla nunca llegó a pedir. Tirándolo, la oferta de fusión tenía que
  // rebuscarlo en la lista que hubiera cargada, que puede no contenerlo.
  it('carries the error body on the error', async () => {
    setToken('tok')
    const detail = {
      code: 'name_taken',
      message: 'an exercise with that name already exists',
      exercise: { id: 1, name: 'Press banca', kind: 'strength', set_count: 48 },
    }
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 409, json: async () => ({ detail }) }),
    )

    await expect(apiFetch('/exercises/2', { method: 'PATCH' })).rejects.toMatchObject({
      status: 409,
      detail,
    })
  })

  // Lo que no se puede tocar: la bandeja de salida decide entre «no hay señal,
  // guarda la serie y reintenta» y «el servidor la ha juzgado y la rechaza»
  // leyendo `.status`, y un cuerpo ilegible no puede llevarse ese número por
  // delante. Un 500 sin JSON sigue siendo un 500.
  it('keeps the status when the error body cannot be read', async () => {
    setToken('tok')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new SyntaxError('Unexpected token < in JSON')
        },
      }),
    )

    await expect(apiFetch('/workouts')).rejects.toMatchObject({ status: 500 })
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

// Progreso mocks this module, so the wire shape of the two exercise cleanups is
// only checked here. A field named wrong (`intoId` for `into_id`) is a 422 the
// component tests would never see.
describe('cleaning up exercises', () => {
  beforeEach(() => {
    localStorage.clear()
    setToken('tok')
    vi.restoreAllMocks()
  })

  it('deletes an exercise by id', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 204 })
    vi.stubGlobal('fetch', fetchMock)

    expect(await deleteExercise(32)).toBeNull()
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/exercises/32')
    expect(options.method).toBe('DELETE')
  })

  it('merges one exercise into another', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 20 }) })
    vi.stubGlobal('fetch', fetchMock)

    await mergeExercise(32, 20)

    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/exercises/32/merge')
    expect(options.method).toBe('POST')
    expect(JSON.parse(options.body)).toEqual({ into_id: 20 })
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

// El sello que viaja con una entrada del diario decide en qué día alimentario
// cae, y el servidor no tiene otro reloj con el que fecharla. `toISOString()`
// no sirve: siempre sale en UTC, y con el offset perdido un desayuno a las
// 05:00 en Madrid llega al backend como las 03:00, que restadas las cuatro
// horas del corte cae en el día anterior. La pantalla pide un día y le
// contestan otro, sin error en ninguna parte (2026-09-08).
describe('logFood y el día alimentario', () => {
  // Lo que hace el servidor con lo que le mandamos: `food_log_date()` aplica el
  // offset primero y luego resta las 4 h, o sea que se queda con el reloj de
  // pared que trae el sello. Reproducirlo aquí es lo único que comprueba que
  // las dos reglas siguen siendo la misma.
  const backendFoodDay = (stamp) => {
    const [y, m, d, hh, mm] = stamp.match(/\d+/g).map(Number)
    return foodDayIso(new Date(y, m - 1, d, hh, mm))
  }

  const bodyOf = async (fetchMock) => JSON.parse(fetchMock.mock.calls[0][1].body)

  beforeEach(() => {
    localStorage.clear()
    setToken('tok')
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('manda el reloj del móvil, no UTC, para el desayuno de las 05:00', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 8, 8, 5, 0))
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await logFood({ foodId: 1, grams: 100 })

    const { logged_at: stamp } = await bodyOf(fetchMock)
    // El offset de verdad, nunca `Z`: con `+00:00` en un runner en UTC vale,
    // porque ahí sí es el reloj del usuario.
    expect(stamp).toMatch(/[+-]\d{2}:\d{2}$/)
    // Y la comprobación que importa: el día que el servidor derivará del sello
    // es el mismo que la pantalla está pintando.
    expect(backendFoodDay(stamp)).toBe(foodDayIso(new Date(2026, 8, 8, 5, 0)))
  })

  it('sigue respetando la hora original al deshacer un borrado', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)

    await logFood({ foodId: 1, grams: 100, loggedAt: '2026-08-31T14:00:00+02:00' })

    expect((await bodyOf(fetchMock)).logged_at).toBe('2026-08-31T14:00:00+02:00')
  })
})

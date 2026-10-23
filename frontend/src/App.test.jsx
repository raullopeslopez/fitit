import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import App from './App.jsx'
import * as api from './api.js'
import { notifyUpdateRequired, setToken } from './auth.js'
import * as offline from './offline.js'
import { foodDayIso } from './food.js'

vi.mock('./api.js')
// El puente con el APK. `onLaunch` es la orden con la que el widget o la
// notificación abrieron la app; el resto no hace nada, como en la web.
const launch = vi.hoisted(() => ({ listener: null }))
vi.mock('./platform/session.js', async (original) => {
  const real = await original()
  return {
    ...real,
    session: {
      ...real.session,
      onLaunch: vi.fn((listener) => {
        launch.listener = listener
        return () => {}
      }),
    },
  }
})
// Sólo lo que habla con el nativo; el resto de la cola funciona de verdad.
vi.mock('./offline.js', async (original) => ({
  ...(await original()),
  startNativeQueue: vi.fn(),
  stopNativeQueue: vi.fn(),
}))

// Lo que Perfil pide al abrirse, con respuestas tranquilas.
function stubPerfil() {
  api.weightTrend.mockResolvedValue({ kg: null, weigh_ins: 0, up_to: null })
  api.getTargetProfile.mockResolvedValue({})
  api.getTargetProposal.mockResolvedValue(null)
}

describe('App', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.resetAllMocks()
    // Entreno asks what is still recovering as soon as it mounts. These specs
    // are about navigation, so the quiet answer is the right one — but it has
    // to be a promise, or the auto-mock hands the effect an undefined.
    api.recentlyTrained.mockResolvedValue([])
  })

  // En el APK la cola la envía el nativo, también con la app cerrada, y para eso
  // necesita el token. En la web estas dos llamadas no hacen nada (offline.js).
  describe('el token, también para el nativo', () => {
    beforeEach(() => {
      api.listDays.mockResolvedValue([])
    })

    it('se lo da al abrir la app con la sesión ya iniciada', async () => {
      setToken('tok')
      render(<App />)

      expect(offline.startNativeQueue).toHaveBeenCalledWith('tok')
    })

    it('no le da nada sin sesión', () => {
      render(<App />)

      expect(offline.startNativeQueue).not.toHaveBeenCalled()
    })

    it('se lo quita al salir', async () => {
      setToken('tok')
      stubPerfil()
      render(<App />)

      // «Salir» vive en Perfil, al final: es lo más raro que se hace.
      await userEvent.click(await screen.findByRole('button', { name: 'Tú' }))
      await userEvent.click(await screen.findByRole('button', { name: /^salir$/i }))

      expect(offline.stopNativeQueue).toHaveBeenCalled()
    })
  })

  // Fase 3: tocar el widget o la notificación abre la app con una orden.
  // Spec: docs/widgets-entreno.md, «2 · Widget».
  describe('abrir desde el widget o la notificación', () => {
    // El «hoy» de la app: corta a las 04:00 locales. Con la fecha local a
    // secas esta prueba fallaba cada noche entre las 00:00 y las 04:00.
    const todayISO = () => foodDayIso()

    beforeEach(() => {
      launch.listener = null
      api.listExercises.mockResolvedValue([])
    })

    it('«abre este entreno» abre ese entreno', async () => {
      setToken('tok')
      api.listDays.mockResolvedValue([])
      api.getWorkout.mockResolvedValue({ id: 4, date: '2026-07-15', name: 'Legs', sets: [] })
      render(<App />)
      await vi.waitFor(() => expect(launch.listener).toBeTypeOf('function'))

      act(() => launch.listener({ action: 'open', workoutId: 4 }))

      expect(await screen.findByLabelText('Ejercicio')).toBeInTheDocument()
      expect(api.getWorkout).toHaveBeenCalledWith(4)
    })

    it('«Empezar entreno» continúa el de hoy si ya lo hay', async () => {
      setToken('tok')
      api.listDays.mockResolvedValue([
        { id: 1, date: todayISO(), workouts: [{ id: 9, date: todayISO(), name: null, sets: [] }] },
      ])
      api.getWorkout.mockResolvedValue({ id: 9, date: todayISO(), name: null, sets: [] })
      render(<App />)
      await vi.waitFor(() => expect(launch.listener).toBeTypeOf('function'))

      act(() => launch.listener({ action: 'start' }))

      expect(await screen.findByLabelText('Ejercicio')).toBeInTheDocument()
      expect(api.getWorkout).toHaveBeenCalledWith(9)
      expect(api.createWorkout).not.toHaveBeenCalled()
    })

    it('«Empezar entreno» crea el de hoy si no lo hay', async () => {
      setToken('tok')
      api.listDays.mockResolvedValue([])
      api.createWorkout.mockResolvedValue({ id: 12, date: todayISO(), name: null, sets: [] })
      api.getWorkout.mockResolvedValue({ id: 12, date: todayISO(), name: null, sets: [] })
      render(<App />)
      await vi.waitFor(() => expect(launch.listener).toBeTypeOf('function'))

      act(() => launch.listener({ action: 'start' }))

      expect(await screen.findByLabelText('Ejercicio')).toBeInTheDocument()
      expect(api.createWorkout).toHaveBeenCalledTimes(1)
    })

    // «food», la pantalla Comida del widget.
    it.each(['food'])('«%s» abre Comida', async (action) => {
      setToken('tok')
      api.listDays.mockResolvedValue([])
      api.listExercises.mockResolvedValue([])
      api.getFoodDay.mockResolvedValue({
        date: '2026-07-15',
        entries: [],
        totals: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
        unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
      })
      api.frequentFoods.mockResolvedValue([])
      render(<App />)
      await vi.waitFor(() => expect(launch.listener).toBeTypeOf('function'))

      act(() => launch.listener({ action }))

      expect(await screen.findByRole('button', { name: 'Añadir a desayuno' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-current', 'page')
    })

    // «review», el aviso de la revisión semanal: la revisión vive al planificar
    // la semana que viene, que ahora está en su propia pestaña.
    it('«review» abre Plan, en la semana que viene', async () => {
      setToken('tok')
      api.listDays.mockResolvedValue([])
      api.getPlan.mockResolvedValue(null)
      api.listDishes.mockResolvedValue([])
      api.getReview.mockResolvedValue({ due: false })
      api.getTargetProfile.mockResolvedValue({})
      render(<App />)
      await vi.waitFor(() => expect(launch.listener).toBeTypeOf('function'))

      act(() => launch.listener({ action: 'review' }))

      expect(await screen.findByRole('button', { name: 'La que viene' })).toHaveAttribute('aria-current', 'true')
      expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-current', 'page')
    })

    it('sin sesión no escucha: la orden espera a que entres', () => {
      render(<App />)
      expect(launch.listener).toBeNull()
    })
  })

  // Estados (Marcador): un 426 en cualquier petición lleva a la pantalla de
  // actualizar, la única entera en mandarina.
  it('una versión que el servidor ya no acepta pasa a «Actualizar»', async () => {
    setToken('tok')
    api.listDays.mockResolvedValue([])
    render(<App />)
    act(() => notifyUpdateRequired())
    expect(await screen.findByRole('heading', { name: 'Esta versión ya no habla con el servidor' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Actualizar' })).toHaveAttribute(
      'href',
      'https://github.com/raullopeslopez/fitit/releases/latest',
    )
  })

  it('shows the login screen when there is no token', () => {
    render(<App />)
    expect(screen.getByLabelText(/usuario/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('switches to the register screen and back', async () => {
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /crear cuenta/i }))
    expect(screen.getByRole('button', { name: /ya tengo cuenta/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^entrar$/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /ya tengo cuenta/i }))
    expect(screen.getByRole('button', { name: /entrar/i })).toBeInTheDocument()
  })

  it('opens a workout from the days view and can go back', async () => {
    setToken('tok')
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-15',
        // The API nests the day's date on each workout too; the seed handed to
        // Entreno needs it to render its header before the fetch lands.
        workouts: [{ id: 4, date: '2026-07-15', name: 'Legs', sets: [] }],
      },
    ])
    api.getWorkout.mockResolvedValue({ id: 4, date: '2026-07-15', name: 'Legs', sets: [] })
    api.listExercises.mockResolvedValue([])
    render(<App />)

    // Historial -> open a workout
    await userEvent.click(await screen.findByRole('button', { name: 'Historial' }))
    await userEvent.click(await screen.findByRole('button', { name: /^Legs/ }))
    expect(await screen.findByLabelText('Ejercicio')).toBeInTheDocument()

    // back to the days view via the bottom nav
    await userEvent.click(screen.getByRole('button', { name: 'Historial' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Historial' })).toBeInTheDocument()
  })

  it('reaches Comida from the bottom nav and comes back', async () => {
    setToken('tok')
    api.listDays.mockResolvedValue([])
    api.listExercises.mockResolvedValue([])
    api.getFoodDay.mockResolvedValue({
      date: '2026-07-15',
      entries: [],
      totals: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
      unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
    })
    api.frequentFoods.mockResolvedValue([])
    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: 'Hoy' }))
    // Los raíles de comida: la pantalla ya no tiene un botón de añadir al pie.
    expect(await screen.findByRole('button', { name: 'Añadir a desayuno' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-current', 'page')

    await userEvent.click(screen.getByRole('button', { name: 'Historial' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Historial' })).toBeInTheDocument()
  })

  // Plan sale de Comida: registrar y planificar son dos trabajos, y la lista de
  // la compra se abre en el súper, no tres toques dentro de una tarjeta.
  it('Semana es su propia pestaña, entre Hoy e Historial', async () => {
    setToken('tok')
    api.listDays.mockResolvedValue([])
    api.getPlan.mockResolvedValue(null)
    api.listDishes.mockResolvedValue([])
    api.getTargetProfile.mockResolvedValue({})
    render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: 'Semana' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Semana' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-current', 'page')
  })

  // Lienzo «Movimiento → cambiar de pestaña»: la barra es una fila, así que la
  // pantalla nueva entra por el lado de la pestaña tocada.
  it('la pantalla entra por el lado de la pestaña que tocas', async () => {
    setToken('tok')
    api.listDays.mockResolvedValue([])
    api.getPlan.mockResolvedValue(null)
    api.listDishes.mockResolvedValue([])
    api.getTargetProfile.mockResolvedValue({})
    const { container } = render(<App />)
    const main = () => container.querySelector('.app-main')

    await screen.findByRole('navigation', { name: 'Navegación principal' })
    expect(main()).not.toHaveAttribute('data-dir')

    await userEvent.click(screen.getByRole('button', { name: 'Historial' }))
    expect(main()).toHaveAttribute('data-dir', 'adelante')

    await userEvent.click(screen.getByRole('button', { name: 'Semana' }))
    expect(main()).toHaveAttribute('data-dir', 'atras')

    // Volver a tocar la pestaña en la que estás no mueve nada.
    await userEvent.click(screen.getByRole('button', { name: 'Semana' }))
    expect(main()).toHaveAttribute('data-dir', 'atras')
  })

  // Lo que se fija una vez (objetivo, reparto, reglas, peso, preferencias de
  // Entreno) sale de Comida y de Entreno y vive aquí.
  it('Tú es la última pestaña, y la cabecera ya no lleva «Salir»', async () => {
    setToken('tok')
    api.listDays.mockResolvedValue([])
    stubPerfil()
    render(<App />)

    const nav = await screen.findByRole('navigation', { name: 'Navegación principal' })
    expect(
      [...nav.querySelectorAll('button')].map((b) => b.lastChild.textContent.trim()),
    ).toEqual(['Hoy', 'Semana', 'Historial', 'Progreso', 'Tú'])
    expect(screen.queryByRole('button', { name: /^salir$/i })).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Tú' }))
    expect(await screen.findByRole('heading', { name: 'Tu objetivo' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tú' })).toHaveAttribute('aria-current', 'page')
  })

  // Hoy es la primera pestaña y la que abre la app; «Entrenar» te mete en el
  // entreno de hoy en un toque, igual que «Empezar entreno» del widget.
  it('abre en Hoy, y «Entrenar» empieza el entreno de hoy', async () => {
    setToken('tok')
    api.listDays.mockResolvedValue([])
    api.listExercises.mockResolvedValue([])
    api.createWorkout.mockResolvedValue({ id: 12, date: foodDayIso(), name: null, sets: [] })
    api.getWorkout.mockResolvedValue({ id: 12, date: foodDayIso(), name: null, sets: [] })
    render(<App />)

    expect(await screen.findByRole('button', { name: 'Hoy' })).toHaveAttribute('aria-current', 'page')
    await userEvent.click(await screen.findByRole('button', { name: /^Entrenar$/ }))

    expect(await screen.findByLabelText('Ejercicio')).toBeInTheDocument()
    expect(api.createWorkout).toHaveBeenCalledTimes(1)
  })

  // Reopening the app between sets used to land on Días — a tap and a fetch
  // away from the set you were about to log. The open workout is the state you
  // were in, so it survives the relaunch.
  it('reopens the workout you were logging', async () => {
    setToken('tok')
    localStorage.setItem('fitit_open_workout', JSON.stringify({ id: 4, at: Date.now() }))
    api.getWorkout.mockResolvedValue({ id: 4, date: '2026-07-15', name: 'Legs', sets: [] })
    api.listExercises.mockResolvedValue([])
    render(<App />)

    expect(await screen.findByLabelText('Ejercicio')).toBeInTheDocument()
    expect(api.getWorkout).toHaveBeenCalledWith(4)
  })

  it('does not reopen a workout you left hours ago', async () => {
    setToken('tok')
    const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000
    localStorage.setItem('fitit_open_workout', JSON.stringify({ id: 4, at: fiveHoursAgo }))
    api.listDays.mockResolvedValue([])
    api.listExercises.mockResolvedValue([])
    render(<App />)

    expect(await screen.findByRole('button', { name: /^Entrenar$/ })).toBeInTheDocument()
    expect(api.getWorkout).not.toHaveBeenCalled()
  })

  // The launch screen is for the launch that has to wake the backend, and for
  // no other. On the normal open it must never be seen — not even for a frame.
  it('goes straight into the app when the first request lands fast', async () => {
    setToken('tok')
    api.checkHealth.mockResolvedValue({ status: 'ok' })
    api.listDays.mockResolvedValue([])
    api.listExercises.mockResolvedValue([])
    render(<App />)

    expect(await screen.findByRole('button', { name: /^Entrenar$/ })).toBeInTheDocument()
    expect(screen.queryByText('Tu primera sesión')).not.toBeInTheDocument()
  })

  it('puts the waiting screen up once the first request has been out 800 ms', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setToken('tok')
    let wake
    api.checkHealth.mockReturnValue(
      new Promise((resolve) => {
        wake = resolve
      }),
    )
    api.listDays.mockResolvedValue([])
    api.listExercises.mockResolvedValue([])
    render(<App />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(700)
    })
    expect(screen.queryByText('Tu primera sesión')).not.toBeInTheDocument()

    await act(async () => {
      await vi.advanceTimersByTimeAsync(200)
    })
    expect(screen.getByText('Tu primera sesión')).toBeInTheDocument()

    // …and it gets out of the way the moment the backend answers.
    await act(async () => {
      wake({ status: 'ok' })
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(screen.queryByText('Tu primera sesión')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Entrenar$/ })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('gives up after a minute and offers the way out', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    setToken('tok')
    api.checkHealth.mockReturnValue(new Promise(() => {}))
    api.listDays.mockResolvedValue([])
    api.listExercises.mockResolvedValue([])
    render(<App />)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60000)
    })
    expect(screen.getByText('No hemos podido cargar tu sesión')).toBeInTheDocument()

    // Logging on the device is always an option: the app already keeps sets in
    // an outbox, so the way out is the app itself, not a lesser copy of it.
    await act(async () => {
      screen.getByRole('button', { name: /empezar a registrar ya/i }).click()
      await vi.advanceTimersByTimeAsync(10)
    })
    expect(screen.getByRole('button', { name: /^Entrenar$/ })).toBeInTheDocument()
    vi.useRealTimers()
  })

  it('forgets the open workout once you leave it', async () => {
    setToken('tok')
    api.listDays.mockResolvedValue([
      {
        id: 1,
        date: '2026-07-15',
        // The API nests the day's date on each workout too; the seed handed to
        // Entreno needs it to render its header before the fetch lands.
        workouts: [{ id: 4, date: '2026-07-15', name: 'Legs', sets: [] }],
      },
    ])
    api.getWorkout.mockResolvedValue({ id: 4, date: '2026-07-15', name: 'Legs', sets: [] })
    api.listExercises.mockResolvedValue([])
    const { unmount } = render(<App />)

    await userEvent.click(await screen.findByRole('button', { name: 'Historial' }))
    await userEvent.click(await screen.findByRole('button', { name: /^Legs/ }))
    await screen.findByLabelText('Ejercicio')
    await userEvent.click(screen.getByRole('button', { name: 'Historial' }))
    await screen.findByRole('heading', { level: 1, name: 'Historial' })
    unmount()

    render(<App />)
    expect(await screen.findByRole('button', { name: /^Entrenar$/ })).toBeInTheDocument()
  })
})

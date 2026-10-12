import { act, render, screen } from '@testing-library/react'

import Days from './Days.jsx'
import Progress from './Progress.jsx'
import Workout from './Workout.jsx'
import * as api from './api.js'
import { SHOW_AFTER_MS } from './Skeleton.jsx'

vi.mock('./api.js')
vi.mock('./platform/wakelock.js')

// A request that never answers: the whole of what these screens draw while they
// wait, with nothing arriving to overwrite it.
const never = () => new Promise(() => {})

const tick = async (ms) => {
  await act(async () => {
    vi.advanceTimersByTime(ms)
  })
}

describe('placeholders de carga', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    localStorage.clear()
    api.listExercises.mockImplementation(never)
    api.recentlyTrained.mockImplementation(never)
  })

  describe('Días', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('dibuja el armazón de la lista en vez de la palabra "Cargando…"', async () => {
      api.listDays.mockImplementation(never)
      const { container } = render(<Days onOpenWorkout={() => {}} />)
      await tick(SHOW_AFTER_MS + 20)

      expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
      expect(container.querySelectorAll('.sk').length).toBeGreaterThan(0)
      // Tres días, siempre tres: el esqueleto no finge una cuenta.
      expect(container.querySelectorAll('.day-block')).toHaveLength(3)
    })

    // La regla de la semana la sabe el móvil sin preguntar a nadie, así que no
    // es un bloque gris: se dibuja de verdad.
    it('escribe ESTA SEMANA de verdad y deja en bloque sólo el total', async () => {
      api.listDays.mockImplementation(never)
      const { container } = render(<Days onOpenWorkout={() => {}} />)
      await tick(SHOW_AFTER_MS + 20)

      expect(screen.getByText('ESTA SEMANA')).toBeInTheDocument()
      expect(container.querySelector('.week-totals .sk')).toBeInTheDocument()
    })

    // "Empezar" y "Continuar" no son la misma frase, y acertar cuatro de cada
    // cinco veces es abrir una sesión partida la quinta.
    it('no rellena el botón con una suposición mientras espera', async () => {
      api.listDays.mockImplementation(never)
      const { container } = render(<Days onOpenWorkout={() => {}} />)
      await tick(SHOW_AFTER_MS + 20)

      const cta = container.querySelector('.days-cta .btn-log')
      expect(cta).toBeDisabled()
      expect(cta.textContent).not.toMatch(/entreno/i)
      expect(cta.querySelector('.sk')).toBeInTheDocument()
    })

    it('una cuenta nueva dice qué es esta lista, no sólo que está vacía', async () => {
      api.listDays.mockResolvedValue([])
      render(<Days onOpenWorkout={() => {}} />)
      // `findBy*` sondea con temporizadores, y aquí están congelados: la
      // respuesta ya está resuelta, así que basta con vaciar la cola.
      await act(async () => {})
      await tick(SHOW_AFTER_MS + 20)

      expect(screen.getByText('Aún no hay días registrados.')).toBeInTheDocument()
      expect(
        screen.getByText(/El botón de abajo abre la primera sesión/),
      ).toBeInTheDocument()
      // La semana en la que estás no se calla ni cuando no hay nada dentro.
      expect(screen.getByText('ESTA SEMANA')).toBeInTheDocument()
    })
  })

  describe('Entreno', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('dibuja las tarjetas plegadas y la de añadir, no "Cargando…"', async () => {
      api.getWorkout.mockImplementation(never)
      const { container } = render(<Workout workoutId={1} onExit={() => {}} />)
      await tick(SHOW_AFTER_MS + 20)

      expect(screen.queryByText('Cargando…')).not.toBeInTheDocument()
      expect(container.querySelectorAll('.sk').length).toBeGreaterThan(0)
      expect(container.querySelectorAll('.card-quiet')).toHaveLength(2)
      // La vuelta a Días es lo único que sigue funcionando aquí, así que es real.
      expect(screen.getByRole('button', { name: /Días/ })).toBeInTheDocument()
    })
  })

  describe('Progreso', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('reserva la tarjeta de la pestaña en vez de dejar la pantalla en blanco', async () => {
      api.listDays.mockImplementation(never)
      const { container } = render(<Progress />)
      await tick(SHOW_AFTER_MS + 20)

      // Una pestaña cada vez: abre en Series y reserva su tarjeta.
      expect(screen.getByRole('tab', { name: 'Series' })).toHaveAttribute('aria-selected', 'true')
      expect(screen.getByText('Series por músculo')).toBeInTheDocument()
      // La forma de la tarjeta de verdad: la cifra con su medidor y una lista
      // corta debajo. Ningún número inventado: sólo bloques.
      expect(container.querySelector('.sum-tally')).toBeInTheDocument()
      expect(container.querySelector('.sum-tally-n')).not.toBeInTheDocument()
      expect(container.querySelectorAll('.sum-item')).toHaveLength(3)
    })
  })
})

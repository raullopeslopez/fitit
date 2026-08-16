import { act, render, screen } from '@testing-library/react'

import ColdStart from './ColdStart.jsx'
import { buildBootSummary } from './coldstart.js'

const TODAY = '2026-08-16'

const DAYS = [
  {
    id: 1,
    date: TODAY,
    workouts: [
      {
        id: 1,
        date: TODAY,
        name: 'Empuje',
        sets: [
          { exercise_name: 'Press banca', weight: 80, reps: 5, muscle_group: 'Pecho' },
          { exercise_name: 'Fondos', weight: null, reps: 8, muscle_group: 'Pecho' },
        ],
      },
    ],
  },
]

function seedSummary() {
  localStorage.setItem(
    'fitit_boot_summary',
    JSON.stringify(buildBootSummary(DAYS, { today: TODAY })),
  )
}

async function tick(ms) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

describe('ColdStart', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('opens on your own session, not on an explanation', () => {
    seedSummary()
    render(<ColdStart phase="waiting" attempt={0} onRetry={() => {}} onLocal={() => {}} />)

    expect(screen.getByText('Hoy')).toBeInTheDocument()
    expect(screen.getByText('Empuje')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/servidor|arranc|cargando/i)
  })

  it('turns the page every four and a half seconds', async () => {
    seedSummary()
    render(<ColdStart phase="waiting" attempt={0} onRetry={() => {}} onLocal={() => {}} />)

    expect(screen.getByText('Hoy')).toBeInTheDocument()
    await tick(4600)
    expect(screen.queryByText('Hoy')).not.toBeInTheDocument()
    expect(screen.getByText('Tu marca a batir')).toBeInTheDocument()
  })

  // The way out only shows up once the wait is long enough to be worth
  // escaping. Offered from the first second it would just be a second CTA.
  it('offers the local way out after twelve seconds', async () => {
    seedSummary()
    const onLocal = vi.fn()
    render(<ColdStart phase="waiting" attempt={0} onRetry={() => {}} onLocal={onLocal} />)

    expect(screen.queryByRole('button', { name: /empezar a registrar ya/i })).not.toBeInTheDocument()
    await tick(12500)

    const escape = screen.getByRole('button', { name: /empezar a registrar ya/i })
    act(() => escape.click())
    expect(onLocal).toHaveBeenCalled()
  })

  it('fills the bar without ever finishing it', async () => {
    seedSummary()
    render(<ColdStart phase="waiting" attempt={0} onRetry={() => {}} onLocal={() => {}} />)

    const fill = document.querySelector('.cold-bar-fill')
    const at = () => Number.parseFloat(fill.style.width)
    expect(at()).toBe(0)
    await tick(5000)
    const early = at()
    expect(early).toBeGreaterThan(0)
    await tick(55000)
    expect(at()).toBeGreaterThan(early)
    expect(at()).toBeLessThan(95)
  })

  it('reassures about the history when it gives up, and offers both ways on', async () => {
    const onRetry = vi.fn()
    const onLocal = vi.fn()
    render(<ColdStart phase="failed" attempt={1} onRetry={onRetry} onLocal={onLocal} />)

    expect(screen.getByText('No hemos podido cargar tu sesión')).toBeInTheDocument()
    expect(screen.getByRole('alert').textContent).toMatch(/historial/i)

    act(() => screen.getByRole('button', { name: /volver a intentarlo/i }).click())
    expect(onRetry).toHaveBeenCalled()
    act(() => screen.getByRole('button', { name: /empezar a registrar ya/i }).click())
    expect(onLocal).toHaveBeenCalled()
  })

  // A new user has no history to show, so the screen falls back to the one
  // thing that is true about them — and still never mentions the wait.
  it('has something to say with no history at all', () => {
    render(<ColdStart phase="waiting" attempt={0} onRetry={() => {}} onLocal={() => {}} />)
    expect(screen.getByText('Tu primera sesión')).toBeInTheDocument()
  })
})

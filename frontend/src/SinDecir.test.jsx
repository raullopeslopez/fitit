import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import SinDecir, { notaSinDecir, pendientes } from './SinDecir.jsx'

// Miércoles 23: ayer es el martes 22 y anteayer el lunes 21, la misma semana.
const HOY = '2026-09-23'

function fila(over = {}) {
  return {
    id: 1,
    log_date: '2026-09-22',
    slot: 'cena',
    dish_id: 7,
    dish_name: 'Merluza al horno',
    grams: [150],
    kcal: 480,
    status: null,
    log_entry_id: null,
    ...over,
  }
}

const PLAN = {
  entries: [
    fila({ id: 1, log_date: '2026-09-22', slot: 'cena' }),
    fila({ id: 2, log_date: '2026-09-22', slot: 'comida', status: 'done' }),
    fila({ id: 3, log_date: '2026-09-21', slot: 'desayuno', dish_name: 'Tostadas' }),
    fila({ id: 4, log_date: '2026-09-20', slot: 'cena', dish_name: 'Pizza' }),
    fila({ id: 5, log_date: '2026-09-23', slot: 'cena', dish_name: 'Hoy' }),
  ],
}

describe('pendientes', () => {
  it('sólo lo sin decir de ayer y anteayer, de lo más reciente a lo más viejo', () => {
    const lista = pendientes([PLAN], HOY)
    expect(lista.map((e) => e.id)).toEqual([1, 3])
  })
})

describe('notaSinDecir', () => {
  it('nombra lo que falta de un día pasado', () => {
    expect(notaSinDecir([fila({ slot: 'cena' })], '2026-09-22', HOY)).toBe(
      'Cena sin decir: este total no es el del día.',
    )
    expect(
      notaSinDecir([fila({ slot: 'comida' }), fila({ id: 2, slot: 'cena' })], '2026-09-22', HOY),
    ).toBe('Comida y cena sin decir: este total no es el del día.')
  })

  it('«No sé» también cuenta como sin decir en el total', () => {
    expect(notaSinDecir([fila({ status: 'unknown' })], '2026-09-22', HOY)).toBe(
      'Cena sin decir: este total no es el del día.',
    )
  })

  it('hoy o con todo dicho no dice nada', () => {
    expect(notaSinDecir([fila({ log_date: HOY })], HOY, HOY)).toBeNull()
    expect(notaSinDecir([fila({ status: 'skipped' })], '2026-09-22', HOY)).toBeNull()
  })
})

describe('la franja de lo que quedó sin decir', () => {
  it('enseña lo de ayer y anteayer con su día, y deja cerrarlo', async () => {
    const setEntry = vi.fn().mockResolvedValue({})
    const leerPlan = vi.fn().mockResolvedValue(PLAN)
    render(<SinDecir hoy={HOY} leerPlan={leerPlan} setEntry={setEntry} />)
    expect(await screen.findByText('Ayer · Cena')).toBeInTheDocument()
    expect(screen.getByText('Anteayer · Desayuno')).toBeInTheDocument()
    expect(screen.queryByText('Pizza')).not.toBeInTheDocument()
    expect(leerPlan).toHaveBeenCalledWith('2026-09-21')

    await userEvent.click(screen.getAllByRole('button', { name: 'Lo comí' })[0])
    await waitFor(() =>
      expect(setEntry).toHaveBeenCalledWith(1, 'done', null, expect.stringMatching(/^2026-09-22T12:00:00/)),
    )
  })

  it('sin nada pendiente no pinta nada', async () => {
    const leerPlan = vi.fn().mockResolvedValue({ entries: [] })
    const { container } = render(<SinDecir hoy={HOY} leerPlan={leerPlan} />)
    await waitFor(() => expect(leerPlan).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })
})

// Debajo de las comidas de hoy, el bloque dice que empieza otra cosa.
it('el bloque lleva su sello', async () => {
  render(<SinDecir hoy={HOY} leerPlan={async () => PLAN} />)
  expect(await screen.findByRole('heading', { name: 'Sin decir' })).toBeInTheDocument()
})

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Reglas, { Veredictos, frase } from './Reglas.jsx'
import { createRule, listRules, retireRule } from './api.js'

vi.mock('./api.js')

const PROTEINA = {
  id: 1,
  type: 'macro_per_kg',
  scope: 'day',
  slot: null,
  day_condition: null,
  hardness: 'hard',
  params: { macro: 'protein', min: 1.5, max: 2 },
  active_from: '2026-09-01',
  active_to: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  listRules.mockResolvedValue([PROTEINA])
  createRule.mockResolvedValue({ ...PROTEINA, id: 2 })
  retireRule.mockResolvedValue({ ...PROTEINA, active_to: '2026-09-23' })
})

describe('frase', () => {
  it('says a rule in words, not in parameters', () => {
    expect(frase(PROTEINA)).toMatch(/Proteína/)
    expect(frase(PROTEINA)).toMatch(/1,5/)
  })

  it('names the meal a slot rule is about', () => {
    const regla = { type: 'group_presence', slot: 'comida', params: { familia: 'verdura' } }
    expect(frase(regla)).toMatch(/Verdura/)
    expect(frase(regla)).toMatch(/comida/)
  })

  it('says when a rule only applies on training days', () => {
    expect(frase({ ...PROTEINA, day_condition: 'training' })).toMatch(/entreno/i)
  })
})

describe('Reglas', () => {
  it('lists what I follow, in words', async () => {
    render(<Reglas onChanged={() => {}} onClose={() => {}} />)
    expect(await screen.findByText(/Proteína/)).toBeInTheDocument()
  })

  it('retires a rule instead of deleting it', async () => {
    render(<Reglas onChanged={() => {}} onClose={() => {}} />)
    await screen.findByText(/Proteína/)
    await userEvent.click(screen.getByRole('button', { name: /Retirar/ }))
    await waitFor(() => expect(retireRule).toHaveBeenCalled())
    // Con fecha, que es lo que la retira sin reescribir el pasado.
    expect(retireRule.mock.calls[0][1]).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('adds a rule from the closed catalogue', async () => {
    render(<Reglas onChanged={() => {}} onClose={() => {}} />)
    await screen.findByText(/Proteína/)

    await userEvent.selectOptions(screen.getByLabelText('Qué regla'), 'group_presence')
    await userEvent.selectOptions(screen.getByLabelText('En qué comida'), 'comida')
    await userEvent.click(screen.getByRole('button', { name: 'Añadir regla' }))

    await waitFor(() => expect(createRule).toHaveBeenCalled())
    expect(createRule.mock.calls[0][0]).toMatchObject({
      type: 'group_presence',
      scope: 'slot',
      slot: 'comida',
    })
  })
})

describe('Veredictos', () => {
  const v = (extra) => ({ rule_id: 1, type: 'macro_per_kg', hardness: 'hard', ...extra })

  it('says by how much a broken rule is broken', () => {
    render(<Veredictos verdicts={[v({ state: 'broken', short_by: 17 })]} rules={[PROTEINA]} />)
    expect(screen.getByText(/17/)).toBeInTheDocument()
  })

  // No saber no es incumplir, y no se puede pintar igual.
  it('tells "cannot say" apart from "broken"', () => {
    render(
      <Veredictos
        verdicts={[v({ state: 'unknown', unclassified: 2 })]}
        rules={[PROTEINA]}
      />,
    )
    expect(screen.getByText(/no puedo/i)).toBeInTheDocument()
    expect(screen.queryByText(/incumpl/i)).toBeNull()
  })

  it('says nothing at all about a rule that does not apply today', () => {
    const { container } = render(
      <Veredictos verdicts={[v({ state: 'n_a' })]} rules={[PROTEINA]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('and nothing at all when every rule is met', () => {
    const { container } = render(
      <Veredictos verdicts={[v({ state: 'met' })]} rules={[PROTEINA]} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})

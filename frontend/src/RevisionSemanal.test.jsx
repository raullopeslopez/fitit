import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import RevisionSemanal from './RevisionSemanal.jsx'
import { acceptTarget, answerReview, getReview, getTargetProfile } from './api.js'

vi.mock('./api.js')

const PROPUESTA = { kcal: 2230, source: 'measured', days: 21, missing: [], expenditure: 2780 }

beforeEach(() => {
  vi.resetAllMocks()
  getReview.mockResolvedValue({ due: true, answer: null })
  answerReview.mockResolvedValue(PROPUESTA)
  getTargetProfile.mockResolvedValue({ objetivo_kcal: 2150 })
  acceptTarget.mockResolvedValue({})
})

// La tarjeta pregunta una cosa y no toca nada hasta que tú decides: contestar
// propone, aceptar fija (decisión 18).
describe('La revisión semanal', () => {
  it('no se pinta si no toca', async () => {
    getReview.mockResolvedValue({ due: false })
    const { container } = render(<RevisionSemanal onAccepted={() => {}} />)
    await waitFor(() => expect(getReview).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  // Comida no se bloquea por una pregunta que no llega.
  it('no se pinta si la consulta falla', async () => {
    getReview.mockRejectedValue(new Error('offline'))
    const { container } = render(<RevisionSemanal onAccepted={() => {}} />)
    await waitFor(() => expect(getReview).toHaveBeenCalled())
    expect(container).toBeEmptyDOMElement()
  })

  it('pregunta si apuntaste todo, con tres respuestas', async () => {
    render(<RevisionSemanal onAccepted={() => {}} />)
    expect(await screen.findByText('REVISIÓN SEMANAL')).toBeInTheDocument()
    expect(screen.getByText('¿Apuntaste todo lo que comiste?')).toBeInTheDocument()
    for (const name of ['Sí, todo', 'Casi todo', 'No']) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument()
    }
  })

  it('«Sí, todo» manda all y enseña el gasto y el cambio', async () => {
    render(<RevisionSemanal onAccepted={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, todo' }))

    expect(answerReview).toHaveBeenCalledWith('all')
    expect(await screen.findByText('Gastaste unas 2780 kcal al día')).toBeInTheDocument()
    expect(screen.getByText('2150 → 2230 kcal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mantener 2150' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aceptar 2230' })).toBeInTheDocument()
    // Contestar no fija nada.
    expect(acceptTarget).not.toHaveBeenCalled()
  })

  it('«Casi todo» manda most', async () => {
    render(<RevisionSemanal onAccepted={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Casi todo' }))
    expect(answerReview).toHaveBeenCalledWith('most')
    expect(await screen.findByText('2150 → 2230 kcal')).toBeInTheDocument()
  })

  it('«Aceptar» fija la propuesta, cierra la tarjeta y avisa a Comida', async () => {
    const onAccepted = vi.fn()
    render(<RevisionSemanal onAccepted={onAccepted} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, todo' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Aceptar 2230' }))

    expect(acceptTarget).toHaveBeenCalledWith(2230)
    await waitFor(() => expect(onAccepted).toHaveBeenCalledOnce())
    expect(screen.queryByText('REVISIÓN SEMANAL')).not.toBeInTheDocument()
  })

  // Mantener es no hacer nada: ni acepta, ni avisa a nadie.
  it('«Mantener» cierra sin tocar el objetivo', async () => {
    const onAccepted = vi.fn()
    render(<RevisionSemanal onAccepted={onAccepted} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, todo' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Mantener 2150' }))

    expect(acceptTarget).not.toHaveBeenCalled()
    expect(onAccepted).not.toHaveBeenCalled()
    expect(screen.queryByText('REVISIÓN SEMANAL')).not.toBeInTheDocument()
  })

  it('si la propuesta es lo que ya tienes, no hay nada que decidir', async () => {
    getTargetProfile.mockResolvedValue({ objetivo_kcal: 2230 })
    render(<RevisionSemanal onAccepted={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, todo' }))

    expect(await screen.findByText('Tu objetivo sigue en 2230 kcal.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Aceptar/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Vale' }))
    expect(screen.queryByText('REVISIÓN SEMANAL')).not.toBeInTheDocument()
  })

  it('sin objetivo aceptado, la cifra sola y «Ahora no»', async () => {
    getTargetProfile.mockResolvedValue({ objetivo_kcal: null })
    render(<RevisionSemanal onAccepted={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, todo' }))

    expect(await screen.findByText('2230 kcal')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Aceptar 2230' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ahora no' }))
    expect(screen.queryByText('REVISIÓN SEMANAL')).not.toBeInTheDocument()
    expect(acceptTarget).not.toHaveBeenCalled()
  })

  // Sin gasto no se inventa uno: la línea se omite.
  it('sin gasto, no hay línea del gasto', async () => {
    answerReview.mockResolvedValue({ ...PROPUESTA, expenditure: null })
    render(<RevisionSemanal onAccepted={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sí, todo' }))
    await screen.findByText('2150 → 2230 kcal')
    expect(screen.queryByText(/Gastaste/)).not.toBeInTheDocument()
  })

  it('«No» manda none y explica por qué esa semana no cuenta', async () => {
    render(<RevisionSemanal onAccepted={() => {}} />)
    await userEvent.click(await screen.findByRole('button', { name: 'No' }))

    expect(answerReview).toHaveBeenCalledWith('none')
    expect(
      await screen.findByText(
        'Esta semana no la cuento: con días a medias tu gasto saldría más bajo de lo real.',
      ),
    ).toBeInTheDocument()
    expect(acceptTarget).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Vale' }))
    expect(screen.queryByText('REVISIÓN SEMANAL')).not.toBeInTheDocument()
  })
})

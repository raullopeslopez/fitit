import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PesoDeHoy, { CLAVE_AHORA_NO } from './PesoDeHoy.jsx'

const HOY = new Date(2026, 9, 7, 9, 0)

function montar({ pesadas = [], guardar = vi.fn().mockResolvedValue({}), onDone = vi.fn() } = {}) {
  const leer = vi.fn().mockResolvedValue(pesadas)
  render(<PesoDeHoy today={HOY} leer={leer} guardar={guardar} onDone={onDone} />)
  return { leer, guardar, onDone }
}

beforeEach(() => {
  localStorage.clear()
})

// Sin pesadas el objetivo no se ajusta solo, y la báscula se olvida. Confirmar
// una comida es el momento en que ya tienes el móvil en la mano.
describe('El peso de hoy, al confirmar una comida', () => {
  it('pregunta si no te has pesado hoy', async () => {
    montar()
    expect(await screen.findByText('¿Te has pesado hoy?')).toBeInTheDocument()
    expect(screen.getByLabelText('Peso de hoy (kg)')).toBeInTheDocument()
  })

  it('si ya te pesaste hoy, no pregunta', async () => {
    const { onDone } = montar({ pesadas: [{ measured_on: '2026-10-07', kg: 100.5 }] })
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(screen.queryByText('¿Te has pesado hoy?')).not.toBeInTheDocument()
  })

  it('una pesada de ayer no cuenta como la de hoy', async () => {
    montar({ pesadas: [{ measured_on: '2026-10-06', kg: 100.5 }] })
    expect(await screen.findByText('¿Te has pesado hoy?')).toBeInTheDocument()
  })

  it('guarda con coma, con la fecha de hoy, y lo confirma', async () => {
    const { guardar, onDone } = montar()
    await userEvent.type(await screen.findByLabelText('Peso de hoy (kg)'), '100,2')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(guardar).toHaveBeenCalledWith({ measured_on: '2026-10-07', kg: 100.2 })
    expect(await screen.findByText('Guardado: 100,2 kg')).toBeInTheDocument()
    expect(onDone).toHaveBeenCalled()
  })

  it('lo que no es un número no se manda', async () => {
    const { guardar } = montar()
    await userEvent.type(await screen.findByLabelText('Peso de hoy (kg)'), 'cien')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(screen.getByText('Escribe el peso, por ejemplo 78,4.')).toBeInTheDocument()
    expect(guardar).not.toHaveBeenCalled()
  })

  it('si no se guarda, lo dice y deja el campo', async () => {
    montar({ guardar: vi.fn().mockRejectedValue(new Error('offline')) })
    await userEvent.type(await screen.findByLabelText('Peso de hoy (kg)'), '100')
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }))
    expect(await screen.findByText('No se ha podido guardar. Inténtalo otra vez.')).toBeInTheDocument()
    expect(screen.getByLabelText('Peso de hoy (kg)')).toBeInTheDocument()
  })

  it('«Ahora no» lo calla hasta mañana', async () => {
    const { onDone } = montar()
    await userEvent.click(await screen.findByRole('button', { name: 'Ahora no' }))
    expect(onDone).toHaveBeenCalled()
    expect(localStorage.getItem(CLAVE_AHORA_NO)).toBe('2026-10-07')
  })

  it('callado hoy, no pregunta otra vez hoy', async () => {
    localStorage.setItem(CLAVE_AHORA_NO, '2026-10-07')
    const { onDone } = montar()
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(screen.queryByText('¿Te has pesado hoy?')).not.toBeInTheDocument()
  })

  it('callado ayer, hoy vuelve a preguntar', async () => {
    localStorage.setItem(CLAVE_AHORA_NO, '2026-10-06')
    montar()
    expect(await screen.findByText('¿Te has pesado hoy?')).toBeInTheDocument()
  })

  // Una pregunta que no llega no puede bloquear el plan.
  it('si no se pueden leer las pesadas, no pregunta', async () => {
    const onDone = vi.fn()
    render(<PesoDeHoy today={HOY} leer={vi.fn().mockRejectedValue(new Error('x'))} guardar={vi.fn()} onDone={onDone} />)
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(screen.queryByText('¿Te has pesado hoy?')).not.toBeInTheDocument()
  })
})

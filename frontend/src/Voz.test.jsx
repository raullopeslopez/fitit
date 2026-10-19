import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import Voz from './Voz.jsx'

// Una grabación que no graba: `done` se resuelve cuando la prueba quiere,
// como si hubieras dejado de hablar.
function grabadora() {
  let terminar = () => {}
  const stop = vi.fn(() => terminar(new Blob(['audio'])))
  // Una promesa nueva por grabación: «Seguir hablando» graba otra vez.
  const grabar = vi.fn(async ({ onTick }) => {
    const done = new Promise((resolve) => (terminar = resolve))
    onTick?.(4000)
    return { stop, done }
  })
  return { grabar, stop, callar: () => terminar(new Blob(['audio'])) }
}

const HUEVO = { id: 1, name: 'Huevo' }
const PASTA_H = { id: 2, name: 'Pasta Spaghetti' }
const PASTA_C = { id: 3, name: 'Pasta, cocida' }

function linea(over = {}) {
  return {
    text: 'dos huevos',
    status: 'chosen',
    food: HUEVO,
    candidates: [HUEVO],
    grams: 120,
    measure: null,
    measure_count: null,
    estimated: false,
    unit_question: null,
    ...over,
  }
}

async function montar(respuesta, props = {}) {
  const g = grabadora()
  const oir = vi.fn().mockResolvedValue(respuesta)
  const apuntar = vi.fn().mockResolvedValue([])
  const racion = vi.fn().mockResolvedValue({})
  const buscar = vi.fn().mockResolvedValue([])
  const onDone = vi.fn()
  render(
    <Voz
      slot="desayuno"
      dayIso="2026-10-16"
      grabar={g.grabar}
      oir={oir}
      apuntar={apuntar}
      guardarRacion={racion}
      buscar={buscar}
      onDone={onDone}
      onClose={vi.fn()}
      {...props}
    />,
  )
  expect(await screen.findByText(/Escuchando/)).toBeInTheDocument()
  await act(async () => g.callar())
  return { ...g, oir, apuntar, racion, buscar, onDone }
}

describe('Voz', () => {
  it('escucha, enseña lo que ha oído y apunta de un toque', async () => {
    const ctx = await montar({ transcript: 'dos huevos', lines: [linea()] })
    expect(await screen.findByText('Revisa lo que has dicho')).toBeInTheDocument()
    expect(screen.getByText('Has oído: dos huevos')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Desayuno' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Apuntar' }))
    await waitFor(() =>
      expect(ctx.apuntar).toHaveBeenCalledWith(
        expect.objectContaining({
          entries: [{ food_id: 1, grams: 120, estimated: false }],
          mealSlot: 'desayuno',
        }),
      ),
    )
    expect(ctx.onDone).toHaveBeenCalled()
  })

  it('«Listo» para la grabación a mano', async () => {
    const g = grabadora()
    render(<Voz slot={null} dayIso="2026-10-16" grabar={g.grabar} oir={vi.fn().mockResolvedValue({ transcript: '', lines: [], refusal: 'unreadable' })} onDone={vi.fn()} onClose={vi.fn()} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Listo' }))
    expect(g.stop).toHaveBeenCalled()
    expect(await screen.findByText('No he entendido nada. Prueba otra vez.')).toBeInTheDocument()
  })

  it('con algo sin elegir no se apunta, y elegir lo desbloquea', async () => {
    await montar({
      transcript: 'pasta',
      lines: [linea({ text: 'pasta', status: 'ambiguous', food: null, candidates: [PASTA_H, PASTA_C], grams: 80, estimated: true })],
    })
    expect(await screen.findByText('¿Cuál?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Falta elegir 1' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Pasta Spaghetti' }))
    expect(screen.getByRole('button', { name: 'Apuntar' })).toBeEnabled()
    expect(screen.getByText(/estimado/)).toBeInTheDocument()
  })

  it('pregunta una vez cuánto pesa una pieza, y la guarda como ración tuya', async () => {
    const ctx = await montar({
      transcript: 'dos huevos',
      lines: [linea({ grams: null, unit_question: { name: 'huevo', label: 'unidad', count: 2, suggested_grams: 60 } })],
    })
    const peso = await screen.findByLabelText('¿Cuánto pesa 1 huevo?')
    expect(peso).toHaveValue('60')
    await userEvent.click(screen.getByRole('button', { name: 'Apuntar' }))
    await waitFor(() => expect(ctx.racion).toHaveBeenCalledWith(1, 'unidad', 60))
    expect(ctx.apuntar).toHaveBeenCalledWith(
      expect.objectContaining({ entries: [{ food_id: 1, grams: 120, estimated: false }] }),
    )
  })

  it('las cucharadas se apuntan como medida', async () => {
    const ctx = await montar({
      transcript: 'dos cucharadas de aceite',
      lines: [linea({ text: 'dos cucharadas de aceite', food: { id: 5, name: 'Aceite de oliva' }, grams: 30, measure: 'cda', measure_count: 2 })],
    })
    // «2 cdas» va en tinta y el resto apagado, como en el diario: dos elementos.
    expect((await screen.findByText(/~30 g/)).closest('p')).toHaveTextContent('2 cdas · ~30 g')
    await userEvent.click(screen.getByRole('button', { name: 'Apuntar' }))
    await waitFor(() =>
      expect(ctx.apuntar).toHaveBeenCalledWith(
        expect.objectContaining({ entries: [{ food_id: 5, measure: 'cda', quantity: 2, estimated: false }] }),
      ),
    )
  })

  it('lo que no existe se busca desde la propia línea', async () => {
    const ctx = await montar({
      transcript: 'lomo embuchado',
      lines: [linea({ text: 'lomo embuchado', status: 'missing', food: null, candidates: [], grams: 40, estimated: true })],
    })
    ctx.buscar.mockResolvedValue([{ id: 9, name: 'Lomo embuchado Hacendado' }])
    expect(await screen.findByText('Falta: lomo embuchado')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }))
    expect(screen.getByLabelText('Buscar lomo embuchado')).toHaveValue('lomo embuchado')
    await userEvent.click(await screen.findByRole('button', { name: 'Lomo embuchado Hacendado' }))
    expect(ctx.buscar).toHaveBeenCalledWith('lomo embuchado')
    expect(screen.getByRole('button', { name: 'Apuntar' })).toBeEnabled()
  })

  it('una línea se quita con ✕', async () => {
    await montar({ transcript: 'x', lines: [linea(), linea({ text: 'pan', status: 'missing', food: null, candidates: [] })] })
    expect(await screen.findByRole('button', { name: 'Falta elegir 1' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Quitar pan' }))
    expect(screen.getByRole('button', { name: 'Apuntar' })).toBeEnabled()
  })

  it('sin cuota del día lo dice', async () => {
    await montar({ transcript: '', lines: [], refusal: 'quota', quota_scope: 'day' })
    expect(await screen.findByText('Sin cuota de voz hasta mañana. Busca o escanea.')).toBeInTheDocument()
  })

  it('con el modelo saturado no dice que no ha entendido', async () => {
    await montar({ transcript: '', lines: [], refusal: 'busy' })
    expect(await screen.findByText('Gemini está saturado. Prueba en un minuto.')).toBeInTheDocument()
  })

  it('si oyó pero el modelo no puede, enseña lo oído junto al aviso', async () => {
    await montar({ transcript: 'dos huevos', lines: [], refusal: 'busy' })
    expect(await screen.findByText('Gemini está saturado. Prueba en un minuto.')).toBeInTheDocument()
    expect(screen.getByText('Has oído: dos huevos')).toBeInTheDocument()
  })

  it('«Seguir hablando» añade líneas sin perder las que había', async () => {
    const ctx = await montar({ transcript: 'dos huevos', lines: [linea()] })
    ctx.oir.mockResolvedValueOnce({ transcript: 'y pan', lines: [linea({ text: 'pan', food: { id: 7, name: 'Pan' }, grams: 80 })] })
    await userEvent.click(await screen.findByRole('button', { name: 'Seguir hablando' }))
    expect(await screen.findByText(/Escuchando/)).toBeInTheDocument()
    await act(async () => ctx.callar())
    expect(await screen.findByRole('button', { name: 'Apuntar las 2' })).toBeEnabled()
  })
})

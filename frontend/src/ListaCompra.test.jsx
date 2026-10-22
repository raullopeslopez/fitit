import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import ListaCompra, { cantidad } from './ListaCompra.jsx'

const SEMANA = '2026-10-12'

const LISTA = {
  week_start: SEMANA,
  aisles: [
    {
      name: 'Carne',
      items: [
        { food_id: 1, name: 'Filetes pechuga pollo', brand: null, grams: 560, packs: null, package_grams: null },
        { food_id: 2, name: 'Solomillo de pavo', brand: null, grams: 300, packs: null, package_grams: null },
      ],
    },
    {
      name: 'Lácteos y huevos',
      items: [
        { food_id: 3, name: 'Queso fresco batido 0%', brand: 'Hacendado', grams: 1200, packs: 3, package_grams: 500 },
      ],
    },
    {
      name: 'Despensa',
      items: [{ food_id: 4, name: 'Aceite de oliva virgen extra', brand: null, grams: 180, packs: null, package_grams: null }],
    },
  ],
}

function montar(lista = LISTA) {
  const leer = vi.fn().mockResolvedValue(lista)
  render(<ListaCompra weekStart={SEMANA} onClose={vi.fn()} leer={leer} />)
  return { leer }
}

beforeEach(() => {
  localStorage.clear()
})

function fila(nombre) {
  return screen.getByText(nombre).closest('li')
}

describe('cantidad', () => {
  it('en envases cuando se sabe el envase', () => {
    expect(cantidad({ grams: 1200, packs: 3, package_grams: 500 })).toBe('3 × 500 g')
    expect(cantidad({ grams: 900, packs: 1, package_grams: 1000 })).toBe('1 × 1 kg')
    expect(cantidad({ grams: 2000, packs: 2, package_grams: 1500 })).toBe('2 × 1,5 kg')
  })

  it('al peso, redondeado y con «~», cuando no', () => {
    expect(cantidad({ grams: 563, packs: null })).toBe('~560 g')
    expect(cantidad({ grams: 1234, packs: null })).toBe('~1,2 kg')
  })
})

// La semana planificada, sumada como se compra. Se marca lo que va al carro, y
// lo que siempre tienes en casa se aparta para que no estorbe.
// Comida simple, fase 6 (lienzo fila Premium · Compra): Taski es donde se
// compra, así que la lista sólo pregunta una cosa —qué tienes ya en casa— y lo
// demás se manda.
describe('La lista de la compra', () => {
  const fila = (nombre) => screen.getByText(nombre).closest('li')
  const cifra = () => document.querySelector('.lista-cifra-n')

  it('es una pantalla con su semana', async () => {
    montar()
    expect(screen.getByRole('dialog', { name: 'Lista de la compra' })).toBeInTheDocument()
    expect(await screen.findByText('Semana del 12 oct')).toBeInTheDocument()
  })

  it('la cifra grande es lo que queda por comprar', async () => {
    montar()
    await waitFor(() => expect(cifra()).toHaveTextContent('4'))
    expect(screen.getByText('cosas que comprar')).toBeInTheDocument()
  })

  it('agrupa por pasillo, y cada artículo dice cuánto', async () => {
    montar()
    expect(await screen.findByRole('heading', { name: 'Carne' })).toBeInTheDocument()
    expect(within(fila('Queso fresco batido 0%')).getByText('3 × 500 g')).toBeInTheDocument()
    expect(within(fila('Filetes pechuga pollo')).getByText('~560 g')).toBeInTheDocument()
  })

  it('marcar lo que tienes lo apaga en su sitio y deja de contar', async () => {
    montar()
    await screen.findByText('Solomillo de pavo')
    const circulo = within(fila('Solomillo de pavo')).getByRole('button', { name: 'Ya lo tengo: Solomillo de pavo' })
    await userEvent.click(circulo)
    expect(circulo).toHaveAttribute('aria-pressed', 'true')
    expect(fila('Solomillo de pavo')).toHaveClass('is-tengo')
    expect(cifra()).toHaveTextContent('3')
    expect(document.querySelector('.lista-cifra-pista')).toHaveTextContent('Marca lo que ya tienes en casa. 1 fuera.')
    // Se queda en su pasillo: no se va a otra sección.
    expect(within(screen.getByRole('heading', { name: 'Carne' }).closest('section')).getByText('Solomillo de pavo')).toBeInTheDocument()
  })

  it('volver a tocarlo lo devuelve a la lista', async () => {
    montar()
    await screen.findByText('Solomillo de pavo')
    const circulo = within(fila('Solomillo de pavo')).getByRole('button', { name: 'Ya lo tengo: Solomillo de pavo' })
    await userEvent.click(circulo)
    await userEvent.click(circulo)
    expect(circulo).toHaveAttribute('aria-pressed', 'false')
    expect(cifra()).toHaveTextContent('4')
  })

  it('lo que tienes se recuerda para las semanas siguientes', async () => {
    localStorage.setItem('fitit_ya_lo_tengo', JSON.stringify([4]))
    montar()
    await screen.findByText('Aceite de oliva virgen extra')
    expect(fila('Aceite de oliva virgen extra')).toHaveClass('is-tengo')
    expect(cifra()).toHaveTextContent('3')
  })

  it('ya no hay carro ni «Lo tengo» suelto', async () => {
    montar()
    await screen.findByText('Solomillo de pavo')
    expect(screen.queryByRole('button', { name: 'En el carro' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Lo tengo' })).not.toBeInTheDocument()
  })

  it('una semana sin nada que comprar lo dice', async () => {
    montar({ week_start: SEMANA, aisles: [] })
    expect(await screen.findByText('Esta semana no tiene nada que comprar.')).toBeInTheDocument()
  })

  it('si no llega, lo dice', async () => {
    render(<ListaCompra weekStart={SEMANA} onClose={vi.fn()} leer={vi.fn().mockRejectedValue(new Error('red'))} />)
    expect(await screen.findByText('No se ha podido cargar la lista.')).toBeInTheDocument()
  })

  it('«Cerrar» cierra', async () => {
    const onClose = vi.fn()
    render(<ListaCompra weekStart={SEMANA} onClose={onClose} leer={vi.fn().mockResolvedValue(LISTA)} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
  })
})

describe('Enviar a Taski', () => {
  function montarConEnvio(enviar) {
    const leer = vi.fn().mockResolvedValue(LISTA)
    render(<ListaCompra weekStart={SEMANA} onClose={vi.fn()} leer={leer} enviar={enviar} />)
  }

  it('manda la semana sin lo que ya tengo y dice cuánto ha añadido', async () => {
    localStorage.setItem('fitit_ya_lo_tengo', JSON.stringify([4]))
    const enviar = vi.fn().mockResolvedValue({ added: 2, already: 1 })
    montarConEnvio(enviar)

    await userEvent.click(await screen.findByRole('button', { name: 'Enviar a Taski' }))

    expect(enviar).toHaveBeenCalledWith(SEMANA, [4])
    // Enviada: una banda «En Taski» con lo que ha pasado, en vez del botón.
    const banda = await screen.findByRole('status', { name: 'En Taski' })
    expect(banda).toHaveTextContent('2 añadidos a Taski · 1 ya estaba')
    expect(screen.queryByRole('button', { name: 'Enviar a Taski' })).not.toBeInTheDocument()
  })

  it('si Taski ya lo tenía todo, lo dice', async () => {
    montarConEnvio(vi.fn().mockResolvedValue({ added: 0, already: 4 }))
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar a Taski' }))
    expect(await screen.findByText('Taski ya lo tenía todo')).toBeInTheDocument()
  })

  it('mientras envía avisa de que Taski puede estar despertando', async () => {
    montarConEnvio(vi.fn().mockReturnValue(new Promise(() => {})))
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar a Taski' }))
    expect(screen.getByRole('button', { name: 'Enviando a Taski…' })).toBeDisabled()
    expect(screen.getByText('Si Taski estaba dormido, tarda hasta un minuto.')).toBeInTheDocument()
  })

  it('si Taski no contesta, lo dice y deja reintentar', async () => {
    montarConEnvio(vi.fn().mockRejectedValue(new Error('502')))
    await userEvent.click(await screen.findByRole('button', { name: 'Enviar a Taski' }))
    expect(await screen.findByText('Taski no ha contestado. Prueba otra vez en un rato.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enviar a Taski' })).toBeEnabled()
  })
})

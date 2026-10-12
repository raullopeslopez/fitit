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
describe('La lista de la compra', () => {
  it('es una pantalla con su semana', async () => {
    montar()
    expect(screen.getByRole('dialog', { name: 'Lista de la compra' })).toBeInTheDocument()
    expect(screen.getByText('Semana del 12 oct')).toBeInTheDocument()
    await screen.findByText('Filetes pechuga pollo')
  })

  it('agrupa por pasillo, con su cuenta', async () => {
    montar()
    await screen.findByText('Filetes pechuga pollo')
    expect(screen.getByRole('heading', { name: /Carne/ })).toHaveTextContent('0/2')
    expect(screen.getByRole('heading', { name: /Lácteos y huevos/ })).toHaveTextContent('0/1')
  })

  it('cada artículo dice cuánto, en envases o al peso', async () => {
    montar()
    await screen.findByText('Filetes pechuga pollo')
    expect(within(fila('Queso fresco batido 0%')).getByText('3 × 500 g')).toBeInTheDocument()
    expect(within(fila('Filetes pechuga pollo')).getByText('~560 g')).toBeInTheDocument()
  })

  it('el contador dice cuánto llevas en el carro', async () => {
    montar()
    await screen.findByText('Filetes pechuga pollo')
    expect(screen.getByText('0')).toBeInTheDocument()
    expect(screen.getByText('/ 4 en el carro')).toBeInTheDocument()
  })

  it('marcar lo mete en el carro, lo tacha y lo baja al final de su pasillo', async () => {
    montar()
    await screen.findByText('Filetes pechuga pollo')
    await userEvent.click(within(fila('Filetes pechuga pollo')).getByRole('button', { name: 'En el carro' }))

    expect(within(fila('Filetes pechuga pollo')).getByRole('button', { name: 'En el carro' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(fila('Filetes pechuga pollo')).toHaveClass('is-done')
    expect(screen.getByText('1')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /Carne/ })).toHaveTextContent('1/2')
    const carne = screen.getByRole('heading', { name: /Carne/ }).closest('section')
    const nombres = within(carne).getAllByRole('listitem').map((li) => li.textContent)
    expect(nombres[nombres.length - 1]).toMatch(/Filetes pechuga pollo/)
  })

  it('lo marcado se recuerda al volver a abrir la lista de esa semana', async () => {
    montar()
    await screen.findByText('Filetes pechuga pollo')
    await userEvent.click(within(fila('Filetes pechuga pollo')).getByRole('button', { name: 'En el carro' }))
    document.body.innerHTML = ''
    montar()
    await screen.findByText('Filetes pechuga pollo')
    expect(fila('Filetes pechuga pollo')).toHaveClass('is-done')
  })

  // Lo de siempre —aceite, sal— no se compra cada semana. Apartarlo una vez
  // vale para las siguientes: se recuerda por alimento, no por semana.
  it('«Lo tengo» lo aparta a «Ya lo tengo» y deja de contar', async () => {
    montar()
    await screen.findByText('Aceite de oliva virgen extra')
    await userEvent.click(within(fila('Aceite de oliva virgen extra')).getByRole('button', { name: 'Lo tengo' }))

    expect(screen.getByText('/ 3 en el carro')).toBeInTheDocument()
    const tengo = screen.getByRole('button', { name: 'Ya lo tengo · 1' })
    expect(tengo).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('Aceite de oliva virgen extra')).not.toBeInTheDocument()
    await userEvent.click(tengo)
    expect(screen.getByText('Aceite de oliva virgen extra')).toBeInTheDocument()
  })

  it('«Ya lo tengo» se recuerda para las semanas siguientes', async () => {
    montar()
    await screen.findByText('Aceite de oliva virgen extra')
    await userEvent.click(within(fila('Aceite de oliva virgen extra')).getByRole('button', { name: 'Lo tengo' }))
    document.body.innerHTML = ''
    render(<ListaCompra weekStart="2026-10-19" onClose={vi.fn()} leer={vi.fn().mockResolvedValue({ ...LISTA, week_start: '2026-10-19' })} />)
    expect(await screen.findByRole('button', { name: 'Ya lo tengo · 1' })).toBeInTheDocument()
  })

  it('«Lo necesito» lo devuelve a la lista', async () => {
    montar()
    await screen.findByText('Aceite de oliva virgen extra')
    await userEvent.click(within(fila('Aceite de oliva virgen extra')).getByRole('button', { name: 'Lo tengo' }))
    await userEvent.click(screen.getByRole('button', { name: 'Ya lo tengo · 1' }))
    await userEvent.click(within(fila('Aceite de oliva virgen extra')).getByRole('button', { name: 'Lo necesito' }))
    expect(screen.getByText('/ 4 en el carro')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Ya lo tengo/ })).not.toBeInTheDocument()
  })

  it('una semana sin nada que comprar lo dice', async () => {
    montar({ week_start: SEMANA, aisles: [] })
    expect(await screen.findByText('Esta semana no tiene nada que comprar.')).toBeInTheDocument()
  })

  it('si no llega, lo dice', async () => {
    render(<ListaCompra weekStart={SEMANA} onClose={vi.fn()} leer={vi.fn().mockRejectedValue(new Error('x'))} />)
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
    expect(await screen.findByText('2 añadidos a Taski · 1 ya estaba')).toBeInTheDocument()
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

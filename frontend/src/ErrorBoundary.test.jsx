import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ErrorBoundary from './ErrorBoundary.jsx'

// Lo que esto fija es el peor fallo que esta app puede tener, y no porque sea
// el más grave: porque es el único que **no dice nada**. Sin una barrera, una
// excepción en el render o en un efecto de layout hace que React desmonte el
// árbol entero, y lo que queda es `<div id="root">` vacío con el fondo del
// tema detrás. En oscuro `--bg` es `#0B0C0E`, así que la pantalla se queda
// literalmente negra: ni mensaje, ni botón, ni pista de qué se estaba haciendo.
//
// Medido en Chromium a 430×932 abriendo `Editar ejercicio` con una API de
// geometría rota: `root.children.length === 0`, `body.innerText` vacío y
// `background-color: rgb(11, 12, 14)`. El navegador sí tenía la excepción en la
// consola — pero la consola de un móvil no la abre nadie a media serie.

function Bomba({ cuando = true }) {
  if (cuando) throw new Error('geometría no disponible')
  return <p>contenido</p>
}

describe('ErrorBoundary', () => {
  let onError
  beforeEach(() => {
    // React imprime el error por consola además de propagarlo a la barrera.
    // Silenciarlo aquí es lo que deja legible la salida de la suite.
    onError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    onError.mockRestore()
    vi.restoreAllMocks()
  })

  it('deja pasar a sus hijos cuando no falla nada', () => {
    render(
      <ErrorBoundary>
        <Bomba cuando={false} />
      </ErrorBoundary>,
    )
    expect(screen.getByText('contenido')).toBeInTheDocument()
  })

  it('pone algo en pantalla en vez de dejarla vacía', () => {
    const { container } = render(
      <ErrorBoundary>
        <Bomba />
      </ErrorBoundary>,
    )
    // La aserción es la del defecto: que quede *algo*. Un árbol desmontado deja
    // el contenedor sin hijos y sin una letra, que es la pantalla negra.
    expect(container.textContent.trim().length).toBeGreaterThan(0)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('dice que la app se ha roto y que lo que había registrado sigue ahí', () => {
    render(
      <ErrorBoundary>
        <Bomba />
      </ErrorBoundary>,
    )
    expect(screen.getByText('Algo se ha roto')).toBeInTheDocument()
    // Lo primero que uno piensa a media serie es «¿he perdido lo que llevaba?».
    // El servidor ya tiene las series registradas, así que la respuesta es no y
    // la pantalla tiene que darla sin que haya que preguntarla.
    expect(
      screen.getByText('Lo que ya habías registrado está guardado.'),
    ).toBeInTheDocument()
  })

  it('trae el mensaje del fallo, que es lo único que permite arreglarlo', () => {
    render(
      <ErrorBoundary>
        <Bomba />
      </ErrorBoundary>,
    )
    expect(screen.getByText(/geometría no disponible/)).toBeInTheDocument()
  })

  it('ofrece recargar, que es la salida que siempre funciona', async () => {
    const reload = vi.fn()
    render(
      <ErrorBoundary onReload={reload}>
        <Bomba />
      </ErrorBoundary>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Recargar' }))
    expect(reload).toHaveBeenCalled()
  })

  it('avisa a quien quiera apuntar el fallo', () => {
    const onCatch = vi.fn()
    render(
      <ErrorBoundary onCatch={onCatch}>
        <Bomba />
      </ErrorBoundary>,
    )
    expect(onCatch).toHaveBeenCalled()
    expect(onCatch.mock.calls[0][0]).toBeInstanceOf(Error)
  })
})

// La barrera no sirve de nada si no envuelve a la app. Se lee el fuente por lo
// mismo que `main.test.js` lee el suyo: lo que tiene que ser cierto es una
// propiedad del montaje, y montar la app de verdad aquí sólo mediría el mock.
describe('el montaje', () => {
  const source = readFileSync(join(process.cwd(), 'src', 'main.jsx'), 'utf8')

  it('envuelve el árbol entero en la barrera', () => {
    expect(source).toContain("import ErrorBoundary from './ErrorBoundary.jsx'")
    expect(source).toMatch(/<ErrorBoundary>[\s\S]*\{tree\}[\s\S]*<\/ErrorBoundary>/)
  })

  it('la pone por dentro de StrictMode, para que cubra también al árbol de dev', () => {
    const strict = source.indexOf('<React.StrictMode>')
    const barrera = source.indexOf('<ErrorBoundary>')
    expect(strict).toBeGreaterThan(-1)
    expect(barrera).toBeGreaterThan(strict)
  })
})

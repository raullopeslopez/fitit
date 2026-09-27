import { render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import ErrorBoundary from '../ErrorBoundary.jsx'
import {
  clearForcedTheme,
  contrastFloor,
  contrastRatio,
  forceTheme,
  parseColor,
  backdropOf,
  textContrastReport,
} from './geometry.js'

// ── La pantalla negra, medida donde se veía negra ──────────────────────────
//
// Ésta es la única prueba de la casa cuya aserción central es «que haya algo
// pintado». Suena a nada y es exactamente el defecto: sin barrera, una
// excepción en un render o en un efecto de layout desmontaba el árbol entero y
// dejaba `<div id="root">` vacío. Lo que se veía entonces no era un error: era
// el fondo del tema a pantalla completa. En oscuro, `--bg` es `#1A1918`.
//
// jsdom no puede decidir esto. Allí no hay pintado, `getComputedStyle` no
// resuelve `var()` y el contraste de un texto sobre la superficie que de verdad
// tiene debajo no se puede calcular. Las pruebas de `ErrorBoundary.test.jsx`
// fijan la conducta —que la barrera atrapa, qué dice y qué ofrece—; ésta fija
// lo único que jsdom no alcanza: que eso se **ve**, y que se lee.

function Bomba() {
  throw new Error('geometría no disponible')
}

const pantallaDeFallo = () =>
  render(
    <ErrorBoundary onReload={() => {}}>
      <Bomba />
    </ErrorBoundary>,
  )

describe('la pantalla de fallo', () => {
  let onError
  beforeEach(() => {
    onError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    onError.mockRestore()
    clearForcedTheme()
  })

  for (const theme of ['dark', 'light']) {
    it(`${theme} · hay algo pintado, y no el fondo desnudo`, () => {
      forceTheme(theme)
      const { container } = pantallaDeFallo()

      const aviso = screen.getByRole('alert')
      const r = aviso.getBoundingClientRect()
      // La aserción del defecto: una caja con superficie de verdad. Un árbol
      // desmontado da 0×0 y ni una letra.
      expect(r.width).toBeGreaterThan(200)
      expect(r.height).toBeGreaterThan(100)
      expect(container.innerText ?? container.textContent).toContain('Algo se ha roto')

      // Y no es transparente: la caja tiene su propio velo sobre el fondo, que
      // es lo que la separa de la nada que había antes.
      const velo = parseColor(getComputedStyle(aviso).backgroundColor)
      expect(velo[3]).toBeGreaterThan(0)
    })

    it(`${theme} · todo lo que dice se lee`, () => {
      forceTheme(theme)
      pantallaDeFallo()
      const aviso = screen.getByRole('alert')

      // Sobre el color realmente pintado, no sobre el token — y esta prueba se
      // ganó el sitio a la primera: en claro cazó dos suspensos que ningún
      // token leído a secas habría visto. El mensaje del fallo en `--muted`
      // sobre el velo del 6 % daba 3,82, y el título en el `--danger` que
      // hereda `.alert`, sobre el velo del 10 % de la propia caja, 4,18. Los
      // dos colores están validados en DESIGN.md — pero sobre superficie
      // limpia, que no es donde acaban aquí.
      const flojos = textContrastReport(aviso).filter((f) => f.ratio < f.floor)
      expect(
        flojos.map((f) => `«${f.text}» ${f.ratio.toFixed(2)} < ${f.floor}`),
      ).toEqual([])
    })

    it(`${theme} · el mensaje del fallo se distingue del fondo de su caja`, () => {
      forceTheme(theme)
      pantallaDeFallo()
      const detalle = document.querySelector('.app-crash-detail')
      expect(detalle).toBeTruthy()
      expect(detalle.textContent).toContain('geometría no disponible')
      const ratio = contrastRatio(
        parseColor(getComputedStyle(detalle).color),
        backdropOf(detalle),
      )
      expect(ratio).toBeGreaterThanOrEqual(contrastFloor(detalle))
    })
  }

  it('la salida es alcanzable con un pulgar: 44 px, como todo aquí', () => {
    pantallaDeFallo()
    const boton = screen.getByRole('button', { name: 'Recargar' })
    expect(boton.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
  })

  it('un mensaje larguísimo no se lleva la salida fuera de la pantalla', () => {
    // Un `stack` de un navegador real es una tira sin espacios de varios miles
    // de caracteres. Si la caja del detalle lo dejase estirar la página, el
    // único control de esta pantalla acabaría fuera del alcance — y el defecto
    // que esto arregla es precisamente «no hay forma de salir».
    const BombaLarga = () => {
      throw new Error('x'.repeat(4000))
    }
    render(
      <ErrorBoundary onReload={() => {}}>
        <BombaLarga />
      </ErrorBoundary>,
    )
    const boton = screen.getAllByRole('button', { name: 'Recargar' }).at(-1)
    const r = boton.getBoundingClientRect()
    expect(r.left).toBeGreaterThanOrEqual(0)
    expect(r.right).toBeLessThanOrEqual(window.innerWidth)
    // Y la página no se desborda en horizontal, que es la otra forma de
    // perderlo de vista.
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(
      window.innerWidth + 1,
    )
  })
})

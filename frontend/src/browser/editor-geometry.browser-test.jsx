// ── El editor de ejercicio, medido donde se pinta ──────────────────────────
//
// El editor era un panel en sitio que se recolocaba midiendo la página, y esta
// suite medía, en un Chromium a 430×932, que no partiese nada al colocarse. En
// la APK esa colocación peleaba con el sistema y el selector del grupo se
// quedaba parpadeando, así que el panel se retiró: ahora es la hoja de la casa,
// fija al pie, con fondo, y no mide nada. Lo que se mide aquí es lo que una
// hoja tiene que cumplir y jsdom no puede ver: que se pega al pie y tapa la
// barra, que todo lo de dentro se toca con un pulgar, que no se sale por el
// ancho, y que abrir y cerrar no mueven la página.
//
// Todas las medidas pasan por `settle()`, que cede dos fotogramas.
import { afterEach, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
// El puntero de verdad. El de testing-library dispara eventos sintéticos que no
// hacen casar `:hover` en CSS; éste mueve el ratón de Playwright, que sí.
import { userEvent as hoverPointer } from '@vitest/browser/context'

import {
  backdropOf,
  clearForcedTheme,
  contrastRatio,
  controlsIn,
  coverage,
  describe as name,
  EPS,
  forceTheme,
  isVisible,
  lineRects,
  overlap,
  pageControls,
  pageProse,
  paintedRect,
  parseColor,
  scrollPageTo,
  scrollStops,
  settle,
  textContrastReport,
} from './geometry.js'
import { MAIN, mountApp, mountEntreno, mountProgreso, openDrawer, openEditor } from './screen.jsx'

// DESIGN.md, «Layout / Touch targets»: 44 px mínimo en todo control
// interactivo, porque esto se usa con una mano y a media serie.
const TOUCH_FLOOR = 44
// Cada 25 px, que es menos de lo que mide media fila: un paso más grueso puede
// saltarse por encima la posición exacta en la que un canto cae dentro de un
// control.
const STEP = 25

let user

beforeEach(() => {
  user = userEvent.setup()
})

afterEach(() => {
  clearForcedTheme()
})

const navBar = () => document.querySelector('nav.bottom-nav')

/** Lo que el dedo encuentra en un punto de la pantalla. */
const hitAt = (x, y) => document.elementFromPoint(x, y)

// En Entreno la hoja sólo toca la sesión: ni grupo ni nota, y quitar es
// «Quitar», arriba junto al aspa. El grupo es del ejercicio entero y vive en Progreso.
for (const [screenName, mount, deleteLabel, hasGroups] of [
  ['Entreno', () => mountEntreno(), 'Quitar', false],
  ['Progreso', () => mountProgreso(), 'Eliminar ejercicio', true],
]) {
  describe(`${screenName} · la hoja del editor`, () => {
    it('se pega al pie y tapa la barra de pestañas', async () => {
      await mount()
      const sheet = await openEditor(user)
      const r = sheet.getBoundingClientRect()
      expect(Math.abs(r.bottom - window.innerHeight)).toBeLessThanOrEqual(EPS)
      expect(r.left).toBeGreaterThanOrEqual(-EPS)
      expect(r.right).toBeLessThanOrEqual(window.innerWidth + EPS)
      // La barra sigue en el DOM, pero el dedo que apunta a ella da en la hoja
      // o en su fondo: tocarla no navega con un renombrado a medias.
      const nav = navBar().getBoundingClientRect()
      const hit = hitAt(nav.left + nav.width / 2, nav.top + nav.height / 2)
      expect(hit.closest('.sheet-scrim')).not.toBeNull()
    })

    it('por encima de la hoja, el toque cae en el fondo', async () => {
      await mount()
      const sheet = await openEditor(user)
      const top = sheet.getBoundingClientRect().top
      expect(top).toBeGreaterThan(40)
      expect(hitAt(window.innerWidth / 2, top / 2)).toHaveClass('sheet-scrim')
    })

    it(`todo control de la hoja mide ${TOUCH_FLOOR} px o más`, async () => {
      await mount()
      const sheet = await openEditor(user)
      const small = controlsIn(sheet)
        .map((el) => [name(el), el.getBoundingClientRect().height])
        .filter(([, h]) => h + EPS < TOUCH_FLOOR)
        .map(([n, h]) => `${n}: ${h.toFixed(1)} px`)
      expect(small).toEqual([])
    })

    if (hasGroups) it('las diez fichas del grupo caben a lo ancho, sin desplazarse de lado', async () => {
      await mount()
      const sheet = await openEditor(user)
      const chips = [...sheet.querySelectorAll('[role="radio"]')]
      expect(chips).toHaveLength(10)
      for (const chip of chips) {
        const r = chip.getBoundingClientRect()
        expect(r.right).toBeLessThanOrEqual(sheet.getBoundingClientRect().right + EPS)
      }
      expect(sheet.scrollWidth).toBeLessThanOrEqual(sheet.clientWidth + EPS)
    })

    it(`lleva «${deleteLabel}» y nada de segundo paso`, async () => {
      await mount()
      const sheet = await openEditor(user)
      expect(sheet.querySelector('.editor-more, .editor-back')).toBeNull()
      const del = [...sheet.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === deleteLabel,
      )
      expect(del).toBeTruthy()
      expect(isVisible(del)).toBe(true)
    })

    it('abrir y cerrar no mueven la página', async () => {
      await mount()
      const stops = scrollStops(STEP)
      await scrollPageTo(stops[Math.floor(stops.length / 2)])
      const before = window.scrollY
      await openEditor(user)
      expect(window.scrollY).toBe(before)
      await user.click(screen.getByRole('button', { name: 'Cerrar' }))
      await settle()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(window.scrollY).toBe(before)
    })
  })
}

// ───────────────────────────────────────────────────────────────────────────
// Ningún botón hereda un relleno que no pidió
// ───────────────────────────────────────────────────────────────────────────
//
// La hoja pintaba de ámbar **todo** `<button>`, así que cada control que es
// texto —una fila, una pestaña, un `⋯`— tenía que excluirse a mano. La lista de
// excepciones llegó a catorce selectores en cuatro bloques, y cada vez que se
// amplió fue porque el defecto ya se había enviado: `Borrar día` en rojo sobre
// un bloque ámbar, `Guardar nota` en ámbar sobre ámbar, una fila de serie
// rellenándose bajo el ratón. La lección estaba escrita cuatro veces en prosa y
// comprobada cero veces — y la quinta, la ✕ del editor, llevaba viva desde que
// se escribió: ámbar bajo el puntero con la tinta clara encima, 3,33:1.
//
// La invariante no nombra ningún selector, así que no se queda vieja: **si un
// botón acaba pintado con el relleno de la marca, su letra tiene que ser la
// tinta que se lee encima de él** (`--on-accent`, que DESIGN.md fija en casi
// negro precisamente porque el blanco sobre ámbar no pasa AA). Un CTA nuevo lo
// cumple sin enterarse; un control de texto que hereda el relleno por accidente
// no puede cumplirlo, porque su letra es `--text`, `--muted` o `--danger`.
//
// El puntero tiene que ser el de Playwright (`@vitest/browser/context`) y no el
// de testing-library: los eventos sintéticos de éste no hacen casar `:hover` en
// CSS, así que un audit escrito con él mide el reposo dos veces y sale verde
// sin haber mirado nada.
describe('Ningún botón hereda un relleno que no pidió', () => {
  const label = (b) =>
    (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 34) ||
    b.className

  /** El token, resuelto a rgb por el navegador y no por nosotros. */
  function tokenRgb(name) {
    const probe = document.createElement('span')
    probe.style.color = `var(${name})`
    document.body.appendChild(probe)
    const out = parseColor(getComputedStyle(probe).color)
    probe.remove()
    return out
  }

  const near = (a, b, tol = 6) =>
    Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol

  /** Apaga las transiciones mientras se mide: `background 0.15s` hace que a
   *  mitad de camino no se lea ni el color de antes ni el de después. */
  function freezeTransitions() {
    const style = document.createElement('style')
    style.textContent = '*, *::before, *::after { transition: none !important; }'
    document.head.appendChild(style)
    return () => style.remove()
  }

  /**
   * Pasa el puntero por cada botón de `root` y mira el color **realmente
   * pintado**, ya compuesto por el navegador. Devuelve las infracciones, cuántos
   * botones llegó a mirar y cuántos salieron ámbar — este último es el que
   * impide que la prueba pase por no haber encontrado un solo CTA que mirar.
   */
  async function hoverAudit(paso, root = document) {
    const fills = [tokenRgb('--accent'), tokenRgb('--accent-hover')]
    const ink = tokenRgb('--on-accent')
    const fails = []
    let seen = 0
    let amber = 0
    const buttons = [...root.querySelectorAll('button')].filter((b) => isVisible(b) && !b.disabled)
    for (const b of buttons) {
      if (!b.isConnected) continue
      try {
        // Sin `scrollIntoView` previo: el puntero de Playwright ya arrastra la
        // página hasta el botón, y adelantárselo le movía el blanco debajo.
        await hoverPointer.hover(b)
      } catch {
        // Tapado por el panel, o fuera de alcance: ahí el puntero no llega y no
        // hay nada que medir. Se salta, no se aprueba.
        continue
      }
      await settle()
      seen += 1
      const bg = backdropOf(b)
      if (!fills.some((f) => near(f, bg))) continue
      amber += 1
      const fg = parseColor(getComputedStyle(b).color)
      if (!near(ink, fg)) {
        fails.push(
          `${paso}: «${label(b)}» (.${b.className || 'sin clase'}) se pinta ` +
            `rgb(${bg.slice(0, 3).map(Math.round).join(' ')}) con la letra en ` +
            `rgb(${fg.slice(0, 3).map(Math.round).join(' ')}), que no es --on-accent`,
        )
      }
    }
    return { fails, seen, amber }
  }

  for (const theme of ['dark', 'light']) {
    it(`Días · tema ${theme}`, async () => {
      await mountApp()
      // El CTA aparece antes que la lista, así que esperar sólo por él deja la
      // pantalla en cinco botones y el audit sin `.link-row` ni `.day-repeat`
      // que mirar — justo los dos que estrenaron esta lista de excepciones.
      await screen.findByRole('button', { name: /Empezar entreno|Continuar/ }, { timeout: 5000 })
      await waitFor(() => expect(document.querySelectorAll('button.link-row').length).toBeGreaterThan(2))
      await settle()
      forceTheme(theme)
      const undo = freezeTransitions()
      const { fails, seen, amber } = await hoverAudit('Días')
      undo()
      expect(seen).toBeGreaterThan(8)
      expect(amber).toBeGreaterThan(0)
      expect(fails).toEqual([])
    })

    it(`Entreno · tema ${theme}, y el editor abierto sobre él`, async () => {
      await mountEntreno()
      forceTheme(theme)
      const undo = freezeTransitions()
      const suelto = await hoverAudit('Entreno')
      const panel = await openEditor(user)
      const nombre = await hoverAudit('editor · nombre', panel)
      await openDrawer(user)
      await settle()
      const cajon = await hoverAudit('editor · cajón', screen.getByRole('dialog'))
      undo()
      expect(suelto.seen).toBeGreaterThan(12)
      expect(suelto.amber).toBeGreaterThan(0)
      // Cuatro: el aspa y `Grupo y nota` en el primer paso, la vuelta y el
      // aspa en el cajón. Eran seis mientras hubo `Guardar nombre` y
      // `Guardar nota`; el suelo baja con ellos porque lo que este número
      // guarda es que el audit haya mirado el panel entero, no que el panel
      // tenga un tamaño concreto.
      expect(nombre.seen + cajon.seen).toBeGreaterThan(3)
      expect([...suelto.fails, ...nombre.fails, ...cajon.fails]).toEqual([])
    })

    it(`Progreso · tema ${theme}, donde viven los chips y el borrado`, async () => {
      await mountProgreso()
      forceTheme(theme)
      const undo = freezeTransitions()
      const suelto = await hoverAudit('Progreso')
      const panel = await openEditor(user)
      await openDrawer(user)
      await settle()
      const cajon = await hoverAudit('editor · cajón', screen.getByRole('dialog'))
      undo()
      expect(suelto.seen).toBeGreaterThan(8)
      expect(cajon.seen).toBeGreaterThan(2)
      expect([...suelto.fails, ...cajon.fails]).toEqual([])
      expect(panel).toBeInTheDocument()
    })
  }
})

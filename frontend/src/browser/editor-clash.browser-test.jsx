// ── El choque de nombres, medido donde se pinta ────────────────────────────
//
// La suite de geometría no tenía ni una aserción sobre el bloque que contesta a
// un nombre duplicado, y no por descuido: su `fetch` falso sólo sabía leer, así
// que un 409 no se podía provocar. Los tres defectos que se miden aquí se
// enviaron con la suite entera en verde, y los tres son exactamente de la clase
// que esta suite existe para coger.
//
// - **Los dos botones debajo de la barra fija.** El bloque se traía a la vista
//   con `scrollIntoView({ block: 'nearest' })`, que alinea contra el
//   *viewport*. El viewport no es lo que se ve: la barra de pestañas es
//   `fixed`, mide 57 px y va a `z-index: 10`. Medido en Entreno a 430×932 desde
//   scroll 0: bloque en 776..932 —encajado en el viewport, misión cumplida—,
//   barra en 875, y los dos botones en 875..919. `elementFromPoint` en el
//   centro de `Sí, fusionar` devolvía `SPAN.tab-icon`. Tocar la respuesta a la
//   pregunta te sacaba de la pantalla.
// - **La pantalla dibujando la fusión antes de ofrecerla.** `applyRename` mueve
//   todo lo que se llame así, o sea que contra un nombre ya presente la ida
//   fundía las dos tarjetas y la vuelta no sabía separarlas.
// - **La fila de deshacer la nota, tapada y viva.** El disparador de al lado sí
//   salía del orden de tabulación; ella no, con los mismos píxeles ocupados por
//   el `select` del grupo.
import { afterEach, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  clearForcedTheme,
  coverage,
  describe as name,
  EPS,
  forceTheme,
  pageControls,
  paintedRect,
  scrollPageTo,
  scrollStops,
  settle,
  textContrastReport,
} from './geometry.js'
import {
  MAIN,
  TAKEN,
  mountEntreno,
  mountProgreso,
  openClash,
  openDrawer,
  openEditor,
} from './screen.jsx'

let user

beforeEach(() => {
  user = userEvent.setup()
})

afterEach(() => {
  clearForcedTheme()
})

const navBar = () => document.querySelector('nav.bottom-nav')
const answers = (block) => [...block.querySelectorAll('button')]

/**
 * ¿Se puede tocar cada una de las dos respuestas? Tres preguntas, y la tercera
 * es la que importa: no dónde dice la geometría que está el botón, sino quién
 * recibe de verdad el toque en su centro.
 */
function buriedAt(block, y) {
  const navTop = navBar().getBoundingClientRect().top
  const out = []
  for (const button of answers(block)) {
    const r = button.getBoundingClientRect()
    if (r.height === 0) continue
    if (r.bottom > navTop + EPS) {
      out.push(
        `scroll ${y}: ${name(button)} llega a ${r.bottom.toFixed(1)} y la barra ` +
          `empieza en ${navTop.toFixed(1)} — ${(r.bottom - navTop).toFixed(1)} px detrás de ella`,
      )
      continue
    }
    if (r.top < -EPS) {
      out.push(`scroll ${y}: ${name(button)} empieza en ${r.top.toFixed(1)}, fuera por arriba`)
      continue
    }
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    if (!hit || !button.contains(hit)) {
      out.push(`scroll ${y}: tocar el centro de ${name(button)} llega a ${name(hit)}`)
    }
  }
  return out
}

describe('el bloque de la oferta se puede contestar', () => {
  for (const [screenName, mount] of [
    ['Entreno', mountEntreno],
    ['Progreso', mountProgreso],
  ]) {
    it(`${screenName} · las dos respuestas se tocan, desde tres posiciones de scroll`, async () => {
      await mount()
      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      const starts = [0, Math.round(max / 2), max]
      const problems = []
      for (const start of starts) {
        await scrollPageTo(start)
        const block = await openClash(user)
        // Dos: `Sí, fusionar` y `Escribir otro nombre`. Si algún día son otras
        // dos, esta prueba tiene que enterarse.
        expect(answers(block).map((b) => b.textContent)).toEqual([
          'Sí, fusionar',
          'Escribir otro nombre',
        ])
        problems.push(...buriedAt(block, start))
        // Se sale por la puerta del propio bloque, para dejar la pantalla como
        // estaba antes de la siguiente vuelta.
        await user.click(screen.getByRole('button', { name: 'Escribir otro nombre' }))
        await settle()
        await user.keyboard('{Escape}')
        await settle()
      }
      expect(problems).toEqual([])
    })
  }
})

describe('un choque rechazado no dibuja la fusión', () => {
  const cards = () => [...document.querySelectorAll('button.card-toggle')]
  const cardsFor = (text) => cards().filter((b) => b.textContent.includes(text))

  it('Entreno · ni funde las dos tarjetas ni pregunta dos veces', async () => {
    await mountEntreno()
    const before = cards().length
    expect(cardsFor(MAIN)).toHaveLength(1)
    await openClash(user)

    // Una tarjeta por ejercicio, ni una más ni una menos: la del ejercicio que
    // renombras sigue estando y no se ha duplicado.
    expect(cardsFor(MAIN)).toHaveLength(1)
    expect(cards()).toHaveLength(before)
    // El nombre con el que chocaste no está en esta sesión, así que no puede
    // aparecer una tarjeta suya.
    expect(cardsFor(TAKEN)).toHaveLength(0)
    // Y una sola oferta. Dos bloques `role="alert"` idénticos son dos preguntas
    // para una sola decisión.
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Sí, fusionar' })).toHaveLength(1)
  })
})

describe('lo que el panel tapa sale del orden de tabulación', () => {
  /**
   * Deja la nota escrita y luego vaciada, que es lo que hace nacer la fila de
   * deshacer — la que vive en la tarjeta y sobrevive al cierre del panel.
   */
  async function clearTheNote() {
    await openEditor(user)
    await openDrawer(user)
    await user.type(screen.getByLabelText(`Nota de ${MAIN}`), 'agarre ancho{Enter}')
    await settle()
    await user.keyboard('{Escape}')
    await settle()
    await openEditor(user)
    await openDrawer(user)
    await user.clear(screen.getByLabelText(`Nota de ${MAIN}`))
    await user.keyboard('{Enter}')
    await settle()
    await user.keyboard('{Escape}')
    await settle()
    return screen.findByRole(
      'button',
      { name: 'Deshacer el borrado de la nota' },
      { timeout: 5000 },
    )
  }

  /** El barrido de siempre, con la fila de deshacer en pantalla. */
  async function sweepWith(panel) {
    const problems = []
    for (const y of scrollStops(50)) {
      await scrollPageTo(y)
      const panelRect = panel.getBoundingClientRect()
      if (panelRect.bottom <= 0 || panelRect.top >= window.innerHeight) continue
      for (const el of pageControls(panel)) {
        const box = paintedRect(el)
        if (!box) continue
        const { state, cross, fraction } = coverage(panelRect, box)
        if (state === 'clear') continue
        if (state === 'sliced') {
          problems.push(
            `scroll ${y}: PARTIDO ${name(el)} (${cross.height.toFixed(1)} px, ${(fraction * 100).toFixed(1)} %)`,
          )
          continue
        }
        if (!el.hasAttribute('inert')) {
          problems.push(`scroll ${y}: TAPADO PERO VIVO ${name(el)}`)
        }
      }
    }
    return problems
  }

  it('Entreno · con la fila de deshacer la nota en pantalla, nada queda tapado y vivo', async () => {
    await mountEntreno()
    await clearTheNote()
    const panel = await openEditor(user)
    expect(await sweepWith(panel)).toEqual([])
  })

  // En Progreso el panel sí llega a taparla —el disparador vive al pie de un
  // documento largo, así que el panel tiene que subir su propia altura entera y
  // su canto de arriba pasa por encima de la fila—. Ahí es donde la regla de la
  // casa se puede comprobar en lugar de suponerse: **o limpio, o tapado entero
  // y fuera del orden de tabulación**, y sobre este control en concreto, que es
  // el que se midió vivo debajo del panel con los píxeles del `select` del
  // grupo delante.
  it('Progreso · la fila de deshacer la nota, tapada por el panel, no es tabulable', async () => {
    await mountProgreso()
    const undo = await clearTheNote()
    const panel = await openEditor(user)
    expect(await sweepWith(panel)).toEqual([])

    let everCovered = false
    for (const y of scrollStops(50)) {
      await scrollPageTo(y)
      const p = panel.getBoundingClientRect()
      const r = undo.getBoundingClientRect()
      const covered = r.left < p.right && r.right > p.left && r.top < p.bottom && r.bottom > p.top
      if (!covered) continue
      everCovered = true
      expect(undo.hasAttribute('inert'), `scroll ${y}: tapada y viva`).toBe(true)
      // Y sus píxeles pertenecen al panel, no a ella: quien recibe el toque en
      // su centro es lo que hay delante.
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      expect(undo.contains(hit)).toBe(false)
    }
    // Si un día el panel deja de taparla, esta prueba deja de medir nada y
    // tiene que decirlo en vez de pasar de largo.
    expect(everCovered).toBe(true)
  })

  // La otra mitad del mismo defecto: dos vueltas atrás vivas a la vez, con el
  // mismo nombre, distinto alcance y distinta vida. Se quedan las dos —perder
  // un deshacer para arreglar una etiqueta es un mal cambio— y lo que se
  // arregla es el nombre.
  it('Entreno · las dos vueltas atrás no se llaman igual', async () => {
    await mountEntreno()
    await clearTheNote()
    await openEditor(user)
    await openDrawer(user)
    await user.selectOptions(screen.getByLabelText(`Grupo muscular de ${MAIN}`), 'Pecho')
    await settle()
    expect(screen.queryAllByRole('button', { name: 'Deshacer' })).toHaveLength(0)
    expect(
      screen.getAllByRole('button', { name: 'Deshacer el borrado de la nota' }),
    ).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Deshacer el cambio de grupo' })).toHaveLength(1)
  })
})

describe('Progreso ofrece los mismos cinco actos que Entreno', () => {
  it('el cajón lleva grupo, nota y borrado en las dos pantallas', async () => {
    for (const mount of [mountEntreno, mountProgreso]) {
      await mount()
      await openEditor(user)
      await openDrawer(user)
      expect(screen.getByLabelText(`Grupo muscular de ${MAIN}`)).toBeInTheDocument()
      expect(screen.getByLabelText(`Nota de ${MAIN}`)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Eliminar ejercicio' })).toBeInTheDocument()
      await user.keyboard('{Escape}')
      await settle()
    }
  })
})

// ── Y con la pinta que la app ya eligió para lo irreversible ───────────────
// `Sí, fusionar` iba de fantasma bordeado mientras `Sí, eliminar` —el otro
// confirmar sin vuelta de esta app— va relleno. Ahora lleva el mismo relleno,
// así que el contraste hay que medirlo sobre el color realmente pintado y en
// los dos temas, que es la regla de la casa que ya cazó el ámbar del hover.
describe('el bloque de la oferta lee bien en los dos temas', () => {
  for (const theme of ['dark', 'light']) {
    it(`tema ${theme}`, async () => {
      await mountEntreno()
      forceTheme(theme)
      const block = await openClash(user)
      const rows = textContrastReport(block)
      const fails = rows
        .filter((r) => r.ratio < r.floor - 0.01)
        .map((r) => `«${r.text}» ${r.ratio.toFixed(2)}:1 contra un suelo de ${r.floor}`)
      // La frase, y los dos botones que la contestan.
      expect(rows.length).toBeGreaterThan(2)
      expect(fails).toEqual([])
    })
  }
})

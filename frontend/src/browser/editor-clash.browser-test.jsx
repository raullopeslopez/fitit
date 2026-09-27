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
import { screen, within } from '@testing-library/react'
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

  // ── Y con la barra ocupando de verdad el sitio del bloque ────────────────
  // «Una prueba de geometría que nunca se ha visto fallar no vale nada», dice
  // la suite de al lado, y las tres paradas de arriba nunca ven el caso: en
  // esta siembra el bloque cae con 19 px de sobra por encima de la barra, así
  // que pasan aunque el desplazamiento no funcione. El defecto del banco vivía
  // justo ahí — y su segunda mitad también, porque el `focus()` con el que el
  // panel devuelve el foco a su disparador **deshacía** el desplazamiento que
  // este bloque acababa de pedir.
  //
  // Se fuerza el caso en lugar de esperarlo: se sube el canto de la barra fija
  // hasta donde estorba, que es el mismo sabotaje controlado con el que la otra
  // suite comprueba sus detectores.
  it('Entreno · con la barra fija subida, la respuesta sigue estando delante', async () => {
    await mountEntreno()
    const style = document.createElement('style')
    style.textContent = '.bottom-nav .tab { min-height: 560px; }'
    document.head.appendChild(style)
    try {
      await settle()
      const navTop = navBar().getBoundingClientRect().top
      // Sin esto la prueba no mide nada: la barra tiene que estar de verdad
      // metida en la mitad de abajo de la pantalla.
      expect(navTop).toBeLessThan(400)

      const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
      const problems = []
      for (const start of [0, Math.round(max / 2), max]) {
        await scrollPageTo(start)
        const block = await openClash(user)
        problems.push(...buriedAt(block, start))
        await user.click(screen.getByRole('button', { name: 'Escribir otro nombre' }))
        await settle()
        await user.keyboard('{Escape}')
        await settle()
      }
      expect(problems).toEqual([])
    } finally {
      style.remove()
      await settle()
    }
  })
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

describe('lo que la hoja tapa queda fuera de alcance', () => {
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

  // Con la hoja arriba, lo de detrás —la fila de deshacer incluida— queda
  // fuera de alcance: ni tabulable ni tocable. Es lo que respalda el
  // `aria-modal` de la hoja; sin esto sería una promesa sin cumplir.
  for (const [screenName, mount] of [
    ['Entreno', mountEntreno],
    ['Progreso', mountProgreso],
  ]) {
    it(`${screenName} · la fila de deshacer la nota queda inerte y tapada bajo la hoja`, async () => {
      await mount()
      const undo = await clearTheNote()
      await openEditor(user)
      expect(undo.closest('[inert]')).not.toBeNull()
      const r = undo.getBoundingClientRect()
      if (r.bottom > 0 && r.top < window.innerHeight) {
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
        expect(undo.contains(hit)).toBe(false)
      }
    })
  }

  // La otra mitad del mismo defecto: dos vueltas atrás vivas a la vez, con el
  // mismo nombre, distinto alcance y distinta vida. Se quedan las dos —perder
  // un deshacer para arreglar una etiqueta es un mal cambio— y lo que se
  // arregla es el nombre.
  it('Entreno · las dos vueltas atrás no se llaman igual', async () => {
    await mountEntreno()
    await clearTheNote()
    await openEditor(user)
    await openDrawer(user)
    await user.click(
      within(screen.getByLabelText(`Grupo muscular de ${MAIN}`)).getByRole('radio', {
        name: 'Pecho',
      }),
    )
    await settle()
    expect(screen.queryAllByRole('button', { name: 'Deshacer' })).toHaveLength(0)
    expect(
      screen.getAllByRole('button', { name: 'Deshacer el borrado de la nota' }),
    ).toHaveLength(1)
    expect(screen.getAllByRole('button', { name: 'Deshacer el cambio de grupo' })).toHaveLength(1)
  })
})

describe('las dos pantallas llevan grupo, nota y eliminar', () => {
  // Mismo cajón en las dos, y un «Eliminar» que dice su alcance: en Entreno
  // quita el ejercicio de la sesión; en Progreso, el ejercicio entero.
  it('Entreno dice «Eliminar»; Progreso, «Eliminar ejercicio»', async () => {
    for (const [mount, label] of [
      [mountEntreno, 'Eliminar'],
      [mountProgreso, 'Eliminar ejercicio'],
    ]) {
      await mount()
      await openEditor(user)
      expect(screen.getByLabelText(`Grupo muscular de ${MAIN}`)).toBeInTheDocument()
      expect(screen.getByLabelText(`Nota de ${MAIN}`)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
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

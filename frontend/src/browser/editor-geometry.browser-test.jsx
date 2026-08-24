// ── El editor de ejercicio, medido donde se pinta ──────────────────────────
//
// Esta suite existe por un defecto concreto y por la clase entera a la que
// pertenece. El defecto: con el editor abierto en Progreso y la página movida
// 60 px, el `select` del grupo se quedaba con **42,9 de sus 44 px** debajo de
// la barra de pestañas —`position: fixed`, `z-index: 10` contra el 3 del
// panel, y no `inert`—, de modo que tocarlo no era tocar en el vacío: navegaba
// a Días y tiraba un renombrado sin guardar. Pérdida de datos.
//
// La clase: había una prueba verde para ese caso. Pasaba porque el mundo falso
// que las pruebas de jsdom construyen a mano —sobrescribiendo
// `getBoundingClientRect`— **no contiene ningún elemento fijo fuera del flujo
// de scroll**. La prueba demostraba que la aritmética de `fit()` era correcta;
// no podía demostrar que se le estuviera preguntando lo correcto. Todos los
// defectos de esta familia los ha encontrado un humano mirando la pantalla, y
// se han vuelto a encontrar desde cero en la ronda siguiente.
//
// Aquí no hay geometría inventada: hay un Chromium a 430×932 con la hoja de
// estilos de verdad, la barra fija de verdad y un documento que se desplaza de
// verdad. Lo único simulado es la red.
//
// **Todas las medidas pasan por `settle()`**, que cede dos fotogramas. Sin eso
// el bucle de barrido no deja correr el `requestAnimationFrame` en el que el
// panel se recoloca y lo que se lee son las posiciones de antes del gesto: una
// suite entera verde midiendo el estado anterior a cada scroll. Es la trampa
// que ya se llevó por delante dos intentos, y por eso vive dentro de un helper
// del que ninguna aserción puede escaparse.
import { afterEach, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import {
  clearForcedTheme,
  controlsIn,
  coverage,
  describe as name,
  EPS,
  forceTheme,
  isVisible,
  pageControls,
  paintedRect,
  scrollPageTo,
  scrollStops,
  settle,
  textContrastReport,
} from './geometry.js'
import { MAIN, mountEntreno, mountProgreso, openDrawer, openEditor } from './screen.jsx'

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

/** ¿Se ve algo de este panel por encima de la barra fija? */
function panelOnScreen(panel) {
  const r = panel.getBoundingClientRect()
  return r.bottom > 0 && r.top < window.innerHeight
}

/**
 * El corazón de la suite: en cada parada del barrido, cada control de la página
 * está **o limpio, o tapado del todo y fuera del orden de tabulación**. Nunca a
 * medias.
 *
 * Devuelve la lista de infracciones en vez de aserciones sueltas para que el
 * mensaje de fallo diga *qué* control, *en qué scroll* y *cuánto* — sin eso una
 * prueba de barrido sólo dice «algo, en algún sitio».
 */
function violationsAt(panel, y) {
  const panelRect = panel.getBoundingClientRect()
  const out = []
  for (const el of pageControls(panel)) {
    // Lo pintado, no la caja: un chip desplazado fuera de su carrusel no está
    // tapado por nadie porque no está en pantalla.
    const box = paintedRect(el)
    if (!box) continue
    const { state, cross, fraction } = coverage(panelRect, box)
    if (state === 'clear') continue
    if (state === 'sliced') {
      out.push(
        `scroll ${y}: PARTIDO ${name(el)} — el canto del panel lo cruza ` +
          `(${cross.height.toFixed(1)} px de solape, ${(fraction * 100).toFixed(1)} %)`,
      )
      continue
    }
    if (!el.hasAttribute('inert')) {
      out.push(`scroll ${y}: TAPADO PERO VIVO ${name(el)} — tapado entero y sin \`inert\``)
    }
  }
  return out
}

/** Lo que el panel esconde debajo de la barra fija, si algo. */
function underTheBarAt(panel, y) {
  const navTop = navBar().getBoundingClientRect().top
  const panelRect = panel.getBoundingClientRect()
  const out = []
  if (panelRect.bottom > navTop + EPS && panelRect.top < navTop) {
    out.push(
      `scroll ${y}: el panel acaba en ${panelRect.bottom.toFixed(1)} y la barra ` +
        `empieza en ${navTop.toFixed(1)} — ${(panelRect.bottom - navTop).toFixed(1)} px suyos detrás de ella`,
    )
  }
  for (const el of controlsIn(panel)) {
    const r = el.getBoundingClientRect()
    // Lo que asoma por debajo del recorte del propio panel no está «detrás de
    // la barra», está recortado por el panel: es otro defecto y tiene otra
    // prueba. Aquí se mide sólo la parte que se pinta.
    const paintedBottom = Math.min(r.bottom, panelRect.bottom)
    if (paintedBottom > navTop + EPS && r.top < navTop) {
      out.push(
        `scroll ${y}: ${name(el)} llega a ${paintedBottom.toFixed(1)}, ` +
          `${(paintedBottom - navTop).toFixed(1)} px por debajo del canto de la barra (${navTop.toFixed(1)})`,
      )
    }
  }
  return out
}

/**
 * Tres posiciones de scroll desde las que un pulgar puede abrir el editor.
 *
 * No valen tres números redondos. En Progreso el disparador cae en y1019 de un
 * documento largo, así que «abrir con la página en 0» significa pulsar un botón
 * que no está en pantalla — y entonces el navegador desplaza la página para
 * enseñar el campo que recibe el foco, 310 px de golpe. Ese salto es una
 * consecuencia de la prueba, no un defecto de la app: nadie puede tocar un
 * control que no ve. La estabilidad del layout sólo significa algo medida desde
 * donde la puerta se puede abrir de verdad.
 *
 * (Dicho eso, el mecanismo es real y conviene tenerlo escrito: enfocar el campo
 * del nombre *puede* mover la página si el campo no está a la vista. Aquí no
 * llega a pasar porque el panel nace pegado a un disparador que sí lo está.)
 */
async function reachableStops(count = 3) {
  const trigger = document.querySelector('button.unit-fix.exercise-edit')
  await scrollPageTo(0)
  const docTop = trigger.getBoundingClientRect().top + window.scrollY
  const docBottom = trigger.getBoundingClientRect().bottom + window.scrollY
  const usable = navBar().getBoundingClientRect().top
  const maxScroll = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  // Entero por encima de la barra fija y por debajo del canto de arriba.
  const lo = Math.max(0, Math.ceil(docBottom - usable))
  const hi = Math.min(maxScroll, Math.floor(docTop))
  if (hi <= lo) return [Math.max(0, Math.min(maxScroll, hi))]
  const out = []
  for (let i = 0; i < count; i += 1) out.push(Math.round(lo + ((hi - lo) * i) / (count - 1)))
  return out
}

/** Barre el rango desplazable llamando a `check` en cada parada. */
async function sweep(panel, check) {
  const problems = []
  const stops = scrollStops(STEP)
  for (const y of stops) {
    await scrollPageTo(y)
    if (!panelOnScreen(panel)) continue
    problems.push(...check(panel, y))
  }
  return { problems, stops: stops.length }
}

// ───────────────────────────────────────────────────────────────────────────
// Entreno
// ───────────────────────────────────────────────────────────────────────────
describe('Entreno · el panel no parte nada', () => {
  it('con el cajón cerrado, todo control está limpio o tapado entero e inert', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    const { problems, stops } = await sweep(panel, violationsAt)
    expect(stops).toBeGreaterThan(4) // un barrido de dos paradas no barre nada
    expect(problems).toEqual([])
  })

  it('con el cajón abierto, sigue sin partir nada', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    await openDrawer(user)
    const { problems } = await sweep(panel, violationsAt)
    expect(problems).toEqual([])
  })

  it('nada del editor se mete debajo de la barra de pestañas, a ningún scroll', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    const cerrado = await sweep(panel, underTheBarAt)
    await openDrawer(user)
    const abierto = await sweep(panel, underTheBarAt)
    expect([...cerrado.problems, ...abierto.problems]).toEqual([])
  })

  // La promesa entera de esta caja: cuelga de un hueco de altura cero, así que
  // no le quita un píxel a la columna de contenido. Si abrirla alargase el
  // documento o moviese el scroll, lo que estabas registrando se iría de la
  // pantalla para hacer sitio a un renombrado que haces dos veces al año.
  it('abrir, entrar en el cajón y cerrar no mueven ni la página ni su altura', async () => {
    await mountEntreno()
    const moves = []
    for (const y of await reachableStops()) {
      await scrollPageTo(y)
      const before = { h: document.documentElement.scrollHeight, y: window.scrollY }
      const stamp = (etapa) => {
        const now = { h: document.documentElement.scrollHeight, y: window.scrollY }
        if (Math.abs(now.h - before.h) > EPS) {
          moves.push(
            `scroll ${y} · ${etapa}: el documento pasó de ${before.h} a ${now.h} px`,
          )
        }
        if (Math.abs(now.y - before.y) > EPS) {
          moves.push(`scroll ${y} · ${etapa}: la página saltó de ${before.y} a ${now.y}`)
        }
      }
      await openEditor(user)
      stamp('abierto')
      await openDrawer(user)
      stamp('cajón')
      await user.click(screen.getByRole('button', { name: 'Cerrar' }))
      await settle()
      stamp('cerrado')
    }
    expect(moves).toEqual([])
  })

  // DESIGN.md: «cuando una acción rara y una acción por serie se pelean por el
  // mismo sitio, gana la de la serie, siempre». Lo marcado `data-editor-protect`
  // es exactamente eso: la fila de peso y reps con sus seis botones,
  // `Registrar serie`, `Repetir serie` y las filas del log.
  it('el aparato de la serie no se tapa ni se parte con el cajón abierto', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    await openDrawer(user)
    const perSet = (p, y) => {
      const panelRect = p.getBoundingClientRect()
      const out = []
      for (const zone of document.querySelectorAll('[data-editor-protect]')) {
        for (const el of controlsIn(zone)) {
          const box = paintedRect(el)
          if (!box) continue
          const { state, fraction } = coverage(panelRect, box)
          if (state === 'clear') continue
          out.push(`scroll ${y}: ${state} ${name(el)} (${(fraction * 100).toFixed(1)} %)`)
        }
      }
      return out
    }
    const { problems } = await sweep(panel, perSet)
    expect(problems).toEqual([])
  })

  it('todo control del panel mide 44 px o más, con el cajón cerrado y abierto', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    const short = []
    const measure = () => {
      for (const el of controlsIn(panel)) {
        const h = el.getBoundingClientRect().height
        if (h < TOUCH_FLOOR - EPS) short.push(`${name(el)} mide ${h.toFixed(1)} px`)
      }
    }
    measure()
    await openDrawer(user)
    measure()
    expect(short).toEqual([])
  })

  // La prueba que sólo un navegador puede hacer: preguntarle al compositor
  // quién recibe el toque. Si la geometría dice «limpio» y `elementFromPoint`
  // dice «el panel» o «la barra», la geometría estaba midiendo otra cosa.
  it('el primer control bajo el panel recibe el toque en sus tres alturas', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    await scrollPageTo(0)
    const panelRect = panel.getBoundingClientRect()
    const navTop = navBar().getBoundingClientRect().top
    const below = pageControls(panel)
      .map((el) => ({ el, r: el.getBoundingClientRect() }))
      .filter(({ r }) => r.top >= panelRect.bottom - EPS && r.bottom <= navTop - EPS && r.top >= 0)
      .filter(({ r }) => r.left < panelRect.right && r.right > panelRect.left)
      .sort((a, b) => a.r.top - b.r.top)[0]
    expect(below, 'no hay ningún control debajo del panel que probar').toBeTruthy()

    const { el, r } = below
    const x = (r.left + r.right) / 2
    const probes = [
      ['borde de arriba', r.top + 2],
      ['centro', (r.top + r.bottom) / 2],
      ['borde de abajo', r.bottom - 2],
    ]
    const wrong = []
    for (const [dónde, y] of probes) {
      const hit = document.elementFromPoint(x, y)
      if (!hit || !(el.contains(hit) || hit === el)) {
        wrong.push(`${dónde} (${x.toFixed(0)},${y.toFixed(1)}): el toque cae en ${hit ? name(hit) : 'nada'}`)
      }
    }
    expect(wrong, `probando ${name(el)}`).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Progreso — la pantalla donde se midió el defecto que da origen a todo esto
// ───────────────────────────────────────────────────────────────────────────
describe('Progreso · el panel no parte nada', () => {
  it('con el cajón cerrado y abierto, todo control está limpio o tapado entero e inert', async () => {
    await mountProgreso()
    const panel = await openEditor(user)
    const cerrado = await sweep(panel, violationsAt)
    await openDrawer(user)
    const abierto = await sweep(panel, violationsAt)
    expect(cerrado.stops).toBeGreaterThan(4)
    expect([...cerrado.problems, ...abierto.problems]).toEqual([])
  })

  // El defecto exacto: abriendo con la página en un sitio y moviéndola 60 px,
  // el panel conservaba la subida de antes y 90 px suyos acababan detrás de una
  // barra que está delante, no es `inert` y navega a Días.
  it('nada del editor se mete debajo de la barra de pestañas, a ningún scroll', async () => {
    await mountProgreso()
    const panel = await openEditor(user)
    const cerrado = await sweep(panel, underTheBarAt)
    await openDrawer(user)
    const abierto = await sweep(panel, underTheBarAt)
    expect([...cerrado.problems, ...abierto.problems]).toEqual([])
  })

  it('abrir, entrar en el cajón y cerrar no mueven ni la página ni su altura', async () => {
    await mountProgreso()
    const moves = []
    for (const y of await reachableStops()) {
      await scrollPageTo(y)
      const before = { h: document.documentElement.scrollHeight, y: window.scrollY }
      const stamp = (etapa) => {
        const now = { h: document.documentElement.scrollHeight, y: window.scrollY }
        if (Math.abs(now.h - before.h) > EPS) {
          moves.push(`scroll ${y} · ${etapa}: el documento pasó de ${before.h} a ${now.h} px`)
        }
        if (Math.abs(now.y - before.y) > EPS) {
          moves.push(`scroll ${y} · ${etapa}: la página saltó de ${before.y} a ${now.y}`)
        }
      }
      await openEditor(user)
      stamp('abierto')
      await openDrawer(user)
      stamp('cajón')
      await user.click(screen.getByRole('button', { name: 'Cerrar' }))
      await settle()
      stamp('cerrado')
    }
    expect(moves).toEqual([])
  })

  it('todo control del panel mide 44 px o más, con el cajón cerrado y abierto', async () => {
    await mountProgreso()
    const panel = await openEditor(user)
    const short = []
    const measure = () => {
      for (const el of controlsIn(panel)) {
        const h = el.getBoundingClientRect().height
        if (h < TOUCH_FLOOR - EPS) short.push(`${name(el)} mide ${h.toFixed(1)} px`)
      }
    }
    measure()
    await openDrawer(user)
    measure()
    expect(short).toEqual([])
  })
})

// ───────────────────────────────────────────────────────────────────────────
// Contraste, calculado sobre el color realmente pintado
// ───────────────────────────────────────────────────────────────────────────
//
// No sobre el token declarado. El panel es opaco sobre una tarjeta sobre el
// fondo de página: tres capas, y el veredicto cambia según cuál esté detrás.
// jsdom no puede hacer esto de ninguna manera — allí `getComputedStyle`
// devuelve la cadena literal, sin resolver `var()`, sin componer alfa y sin
// saber qué hay debajo.
//
// **La aserción va contra el suelo, no contra el valor de hoy.** DESIGN.md
// («Contrast: text on bg and accent-on-surface must pass WCAG AA — 4.5:1 body,
// 3:1 large») es lo que se comprueba. Si un token no llega, la prueba se pone
// roja y se queda roja hasta que el token cambie: bajar el listón para que
// pase sería convertir la prueba en un registro de lo que hay en vez de en una
// medida de lo que debe haber.
for (const theme of ['dark', 'light']) {
  describe(`Contraste real · tema ${theme}`, () => {
    it('todo el texto del panel pasa su suelo de AA', async () => {
      await mountEntreno()
      forceTheme(theme)
      const panel = await openEditor(user)
      const fails = []
      const audit = (paso) => {
        for (const r of textContrastReport(panel)) {
          if (r.ratio + 0.005 < r.floor) {
            fails.push(
              `${paso}: «${r.text}» ${r.ratio.toFixed(2)}:1 sobre ` +
                `rgb(${r.bg.slice(0, 3).map(Math.round).join(' ')}), suelo ${r.floor}`,
            )
          }
        }
      }
      audit('nombre')
      await openDrawer(user)
      audit('cajón')
      expect(fails).toEqual([])
    })

    it('el mismo texto en Progreso, donde vive el borrado en rojo', async () => {
      await mountProgreso()
      forceTheme(theme)
      const panel = await openEditor(user)
      await openDrawer(user)
      await settle()
      const fails = []
      for (const r of textContrastReport(panel)) {
        if (r.ratio + 0.005 < r.floor) {
          fails.push(
            `«${r.text}» ${r.ratio.toFixed(2)}:1 sobre ` +
              `rgb(${r.bg.slice(0, 3).map(Math.round).join(' ')}), suelo ${r.floor}`,
          )
        }
      }
      expect(fails).toEqual([])
    })
  })
}

// ───────────────────────────────────────────────────────────────────────────
// La red se sabe romper
// ───────────────────────────────────────────────────────────────────────────
//
// «Una prueba de geometría que nunca se ha visto fallar no vale nada.» Lo de
// arriba está verde, y verde no distingue «no hay defecto» de «no hay detector».
// Así que aquí se introduce el defecto a mano —se baja el panel 20 px, que es
// menos de media fila— y se comprueba que el detector lo canta. Si alguien
// rompe `violationsAt` o `pageControls`, esta prueba se cae antes que las
// otras y dice por qué.
describe('el detector de cortes se cae cuando toca', () => {
  it('un panel movido 20 px parte algo, y se dice cuál', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    await scrollPageTo(0)
    expect(violationsAt(panel, 0)).toEqual([])

    // Sin volver a desplazar: `fit()` recalcula en cada scroll y desharía el
    // sabotaje antes de que nadie lo midiera.
    const was = panel.style.top
    panel.style.top = `${parseFloat(was || '0') + 20}px`
    await settle()
    const caught = violationsAt(panel, 0)
    panel.style.top = was
    await settle()

    expect(caught.length).toBeGreaterThan(0)
    expect(caught.join('\n')).toMatch(/PARTIDO|TAPADO PERO VIVO/)
    // Y al deshacerlo vuelve a estar limpio: el detector mide el estado, no
    // arrastra una queja de antes.
    expect(violationsAt(panel, 0)).toEqual([])
  })

  it('un control del panel que asome bajo la barra se canta', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    await scrollPageTo(0)
    expect(underTheBarAt(panel, 0)).toEqual([])

    const navTop = navBar().getBoundingClientRect().top
    const panelRect = panel.getBoundingClientRect()
    const was = panel.style.top
    // Justo lo suficiente para que el pie del panel cruce el canto de la barra.
    panel.style.top = `${parseFloat(was || '0') + (navTop - panelRect.bottom) + 10}px`
    await settle()
    const caught = underTheBarAt(panel, 0)
    panel.style.top = was
    await settle()

    expect(caught.length).toBeGreaterThan(0)
    expect(underTheBarAt(panel, 0)).toEqual([])
  })
})

// Una comprobación de que el barrido barre lo que dice: si `scrollStops` se
// quedase en una sola parada, todo lo de arriba seguiría verde sin haber mirado
// nada. Va aquí y no dentro de cada prueba porque es una propiedad del banco.
describe('el barrido barre', () => {
  it('Entreno tiene recorrido y el editor sigue abierto al final de él', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    const stops = scrollStops(STEP)
    expect(stops.length).toBeGreaterThan(8)
    await scrollPageTo(stops.at(-1))
    expect(screen.getByRole('dialog')).toBe(panel)
    expect(isVisible(panel)).toBe(true)
    expect(screen.getByLabelText(`Nombre de ${MAIN}`)).toBeInTheDocument()
  })
})

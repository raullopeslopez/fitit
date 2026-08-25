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
// El mismo `TOP_GAP` que `ExerciseEditor.jsx`. Cuando el canto de arriba del
// panel está ahí, el panel ha gastado toda la subida que tenía y su posición ya
// no es una elección suya: es la única que le queda.
const TOP_GAP = 8

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

/**
 * Lo mismo, para las frases: en cada parada, ningún canto del panel cae
 * **dentro de un renglón** de prosa de la página.
 *
 * Es la misma regla de la casa que vigila `violationsAt` —«un canto opaco
 * cruzando un control no se lee como tapado, se lee como roto»— aplicada a lo
 * único que se le escapaba, que es todo lo que no se toca. Y no es teórica: al
 * ir el panel a lo ancho de la tarjeta para dejar de partir el chip `Tríceps`
 * de Progreso, su canto de arriba se puso a cruzar `.exercise-note` —la nota
 * del ejercicio, la frase que se lee antes de la primera repetición— en
 * **todas** las paradas del barrido de Entreno, 8,0 px de sus 18,3. El mismo
 * texto salía entero dentro del cajón 126 px más abajo, así que la pantalla
 * llevaba el dato dos veces y una de las dos copias rota.
 *
 * `clear` y `covered` valen las dos, igual que arriba y por lo mismo: tapar
 * una frase entera dice «hay algo delante», partirla dice «esto está roto».
 * Aquí `covered` no exige además `inert` porque una frase no está en el orden
 * de tabulación: no hay nada que retirar.
 */
function proseSlicesAt(panel, y) {
  const panelRect = panel.getBoundingClientRect()
  const out = []
  // ── La parada en la que el panel no elige ───────────────────────────────
  // Con la tarjeta desplazada hasta arriba, el panel se queda clavado contra
  // el aire de 8 px y su único grado de libertad —subir— vale cero: medido en
  // Entreno con el cajón abierto, en `y=350` la subida pedida es 141 contra un
  // máximo de 141,3, y en `y=375` 116 contra 116,3. Su canto de abajo cae
  // donde caiga y el contenido pasa por debajo. Ahí `.target-today` («52.5»,
  // 41,6 px de cifra) queda cruzada, y ninguna posición lo arregla, porque no
  // hay ninguna otra posición.
  //
  // Es exactamente la misma callejón sin salida por el que sigue en rojo
  // `card-toggle` en el barrido de controles, y por eso se dice aquí en vez de
  // taparlo: esta prueba vigila todas las paradas en las que el panel **puede**
  // elegir, que son las que producen un defecto de colocación. La nota del
  // ejercicio —el corte que da origen a esta prueba— nunca cae en este caso, y
  // tiene su propia aserción sin excepciones más abajo.
  if (panelRect.top <= TOP_GAP + EPS) return out
  for (const { el, rect } of pageProse(panel)) {
    const { state, cross, fraction } = coverage(panelRect, rect)
    if (state !== 'sliced') continue
    out.push(
      `scroll ${y}: FRASE PARTIDA ${name(el)} — el canto cruza el renglón ` +
        `[${rect.top.toFixed(1)}–${rect.bottom.toFixed(1)}] ` +
        `(${cross.height.toFixed(1)} px de ${rect.height.toFixed(1)}, ${(fraction * 100).toFixed(1)} %)`,
    )
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
// ───────────────────────────────────────────────────────────────────────────
// Ni una frase
// ───────────────────────────────────────────────────────────────────────────
describe('el panel tampoco parte una frase', () => {
  it('Entreno · con el cajón cerrado, ningún renglón queda cruzado', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    const { problems, stops } = await sweep(panel, proseSlicesAt)
    expect(stops).toBeGreaterThan(4)
    expect(problems).toEqual([])
  })

  it('Entreno · con el cajón abierto tampoco, que es donde se partía la nota', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    await openDrawer(user)
    const { problems } = await sweep(panel, proseSlicesAt)
    expect(problems).toEqual([])
  })

  // El corte concreto que abrió esta familia, sin ninguna excepción: la nota
  // del ejercicio (`sin rebote`) partida por el canto de arriba del panel en
  // todas las paradas del barrido, 8,0 px de sus 18,3 — mientras el mismo texto
  // salía entero dentro del cajón 126 px más abajo.
  it('Entreno · la nota del ejercicio no queda cruzada en ninguna parada', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    await openDrawer(user)
    const cortes = []
    for (const y of scrollStops(STEP)) {
      await scrollPageTo(y)
      const nota = document.querySelector('.exercise-note')
      if (!nota) continue
      for (const rect of lineRects(nota)) {
        const { state, cross } = coverage(panel.getBoundingClientRect(), rect)
        if (state !== 'sliced') continue
        cortes.push(
          `scroll ${y}: la nota partida ${cross.height.toFixed(1)} px de ` +
            `${rect.height.toFixed(1)} [${rect.top.toFixed(1)}–${rect.bottom.toFixed(1)}]`,
        )
      }
    }
    expect(cortes).toEqual([])
  })

  it('Progreso · con el cajón abierto, ningún renglón queda cruzado', async () => {
    await mountProgreso()
    const panel = await openEditor(user)
    await openDrawer(user)
    const { problems } = await sweep(panel, proseSlicesAt)
    expect(problems).toEqual([])
  })
})

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
// Progreso — la gráfica dice de quién es este panel
// ───────────────────────────────────────────────────────────────────────────
//
// En Progreso la tercera fila del cajón es `Eliminar ejercicio`, y la gráfica
// es la única prueba en pantalla de **qué ejercicio** es éste: el campo del
// nombre lo tapa el propio panel, y el rótulo del disparador se va con el
// scroll. Un botón de borrado a 166 px de una identidad tapada no es un
// defecto de acabado, es el usuario confirmando un borrado a ciegas.
//
// El listón no es «no la tapes»: el panel tiene que caber entre la gráfica y
// la barra de pestañas y a veces no cabe, y entonces —DESIGN.md, «una acción
// rara y una por serie»— manda que el panel se vea entero. El listón es que
// **nunca desaparezca del todo**: a cualquier parada del barrido queda
// gráfica en pantalla.
const CHART_CEILING = 0.5

describe('Progreso · la gráfica no desaparece debajo del panel', () => {
  it('con el cajón abierto, queda gráfica a la vista en toda parada del barrido', async () => {
    await mountProgreso()
    const panel = await openEditor(user)
    await openDrawer(user)
    const chart = document.querySelector('svg.chart[data-editor-protect]')
    expect(chart, 'sin gráfica no hay nada que medir').toBeTruthy()
    const covered = []
    for (const y of scrollStops(STEP)) {
      await scrollPageTo(y)
      if (!panelOnScreen(panel)) continue
      const box = paintedRect(chart)
      if (!box) continue
      const cross = overlap(panel.getBoundingClientRect(), box)
      const fraction = cross ? (cross.width * cross.height) / (box.width * box.height) : 0
      if (fraction > CHART_CEILING) {
        covered.push(`scroll ${y}: la gráfica tapada al ${(fraction * 100).toFixed(1)} %`)
      }
    }
    expect(covered).toEqual([])
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

    // ── El rótulo que no es texto ──────────────────────────────────────────
    // `textContrastReport` recorre nodos de texto, y la fila de la nota vacía
    // no tiene ninguno: lo que hace de rótulo ahí es el `placeholder`, un
    // pseudo-elemento. Sin una regla propia Chrome lo pinta a su gris de
    // fábrica, que no es ninguno de los tokens de la casa. Y esa fila vacía es
    // el **estado por defecto de todo ejercicio recién creado**, así que la
    // cadena con menos contraste del panel es la que sostiene la tesis entera
    // de esta rejilla: una fila sin rótulo impreso que se explica sola.
    it('el marcador de posición de la nota pasa su suelo de AA', async () => {
      await mountEntreno()
      forceTheme(theme)
      const panel = await openEditor(user)
      await openDrawer(user)
      await settle()
      const fails = []
      for (const el of panel.querySelectorAll('[placeholder]')) {
        const fg = parseColor(getComputedStyle(el, '::placeholder').color)
        const ratio = contrastRatio(fg, backdropOf(el))
        if (ratio + 0.005 < 4.5) {
          fails.push(
            `«${el.getAttribute('placeholder')}» ${ratio.toFixed(2)}:1 en ` +
              `rgb(${fg.slice(0, 3).map(Math.round).join(' ')})`,
          )
        }
      }
      expect(fails.length + panel.querySelectorAll('[placeholder]').length).toBeGreaterThan(0)
      expect(fails).toEqual([])
    })
  })
}

// ───────────────────────────────────────────────────────────────────────────
// El ámbar es escaso o no significa nada — resuelto quitando el botón
// ───────────────────────────────────────────────────────────────────────────
//
// Aquí vivían dos pruebas sobre el `Guardar nota` del cajón: que su ámbar
// estuviera apagado en reposo y que un marco lo separase del campo que tenía a
// 8 px. Las dos policiaban un control que ya no existe.
//
// La queja que las trajo era que ese botón encendía ámbar **antes de que
// pasara nada**, 153 px por encima de `Registrar serie` y de las banderas de
// récord, gastándose la escasez de la que viven los otros dos. Apagarlo en
// reposo era la respuesta pequeña; la grande es que un botón cuya etiqueta
// tenía que cambiar de `Guardar` a `Borrar` para no mentir no estaba
// representando un acto, y la fila no lo necesitaba: la nota se guarda al
// volver al nombre, al cerrar el panel y con Intro. Cero ámbares nuevos en esa
// columna, y ninguna regla que recordar.
//
// Lo que sí sigue vigilado, y con un listón que no depende de qué botones
// haya: `Ningún botón hereda un relleno que no pidió`, unas líneas más abajo.

// ───────────────────────────────────────────────────────────────────────────
// Cada fila dice de qué campo es, y lo sigue diciendo con un valor dentro
// ───────────────────────────────────────────────────────────────────────────
//
// El listón que hay que pasar no es «hay algo que nombra la fila», es que ese
// algo sea **invariante**: el glifo de prioridad de la referencia nombra su
// campo porque las barras ascendentes dicen «prioridad» tanto en Urgente como
// en Baja. Un punto de color que cambia con el valor no lo cumple —es el valor
// dibujado dos veces— y un marcador de posición tampoco, porque desaparece en
// cuanto la fila tiene algo dentro, que es su estado normal a partir del primer
// uso.
//
// Así que la prueba es esa exactamente: cambiar los dos valores y comprobar que
// los rótulos no se mueven, y que además ninguno repite el valor que rotula.
describe('la rejilla nombra sus campos, y el nombre no depende del valor', () => {
  const labelsOf = (panel) =>
    [...panel.querySelectorAll('.editor-row-label')].map((el) => el.textContent.trim())

  it('Entreno · `Grupo` y `Nota` siguen impresos con las dos filas llenas', async () => {
    await mountEntreno()
    const panel = await openEditor(user)
    await openDrawer(user)
    expect(labelsOf(panel)).toEqual(['Grupo', 'Nota'])

    await user.type(screen.getByLabelText(`Nota de ${MAIN}`), 'sin rebote')
    await user.selectOptions(screen.getByLabelText(`Grupo muscular de ${MAIN}`), 'Pecho')
    await settle()

    // Los mismos rótulos, con la fila llena y con otro valor dentro.
    expect(labelsOf(panel)).toEqual(['Grupo', 'Nota'])
    // Y ninguno es el valor otra vez: un rótulo que repita lo que rotula no
    // está nombrando el campo, está gastando anchura.
    for (const el of panel.querySelectorAll('.editor-row-label')) {
      const control = document.getElementById(el.htmlFor)
      expect(control, `${el.textContent} no apunta a ningún campo`).toBeTruthy()
      expect(el.textContent.trim()).not.toBe(control.value)
      // El rótulo es visible de verdad, no un `<label>` escondido.
      expect(isVisible(el)).toBe(true)
    }
  })

  it('Progreso · la fila del grupo también, y el borrado no está en la pila', async () => {
    await mountProgreso()
    const panel = await openEditor(user)
    await openDrawer(user)
    expect(labelsOf(panel)).toEqual(['Grupo'])

    // El destructivo no es una propiedad y no puede leerse como el valor de
    // una: ni comparte la sangría de los valores ni va pegado a la fila de
    // encima. Las dos cosas medidas, no declaradas.
    const borrar = screen.getByRole('button', { name: 'Eliminar ejercicio' })
    const valor = screen.getByLabelText(`Grupo muscular de ${MAIN}`)
    expect(borrar.getBoundingClientRect().left).toBeLessThan(
      valor.getBoundingClientRect().left - 8,
    )
    const cs = getComputedStyle(borrar)
    expect(parseFloat(cs.borderTopWidth)).toBeGreaterThan(0)
    expect(parseFloat(cs.marginTop)).toBeGreaterThan(0)
  })
})

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

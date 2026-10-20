// ── Cómo se mide en un navegador de verdad ─────────────────────────────────
//
// Todo lo que hay aquí existe para que una aserción de geometría no pueda
// medir mal. Son cuatro familias: esperar a un fotograma, leer rectángulos,
// clasificar el solapamiento entre dos, y resolver el color que hay realmente
// detrás de un elemento pintado.
//
// La trampa que ya se ha llevado por delante a dos intentos está en la primera
// familia y se explica entera en `settle()`.

// Medio píxel. No es holgura de conveniencia: es el redondeo de subpíxel que un
// navegador aplica al componer, y por debajo de eso «tapado» y «tapado del
// todo» no se distinguen a ojo ni con el dedo. Por encima sí: la astilla viva
// de 0,9 px que el crítico midió en Progreso fallaría con este umbral, y los
// 42,9 px del control bajo la barra fija fallarían por dos órdenes de magnitud.
export const EPS = 0.5

// La misma lista que usa `fit()` en `ExerciseEditor.jsx`. Deliberadamente la
// misma: si el componente y la prueba no están de acuerdo en qué es un control,
// la prueba mide otro mundo.
export const INTERACTIVE = 'a[href], button, input, select, textarea, [tabindex]'

/**
 * Espera a que el navegador haya pintado.
 *
 * **Esto no es una comodidad, es la condición de validez de toda medida de
 * abajo.** El panel se recoloca en un `requestAnimationFrame` colgado del
 * evento `scroll` (`ExerciseEditor.jsx`, `onScroll`), así que un bucle apretado
 * de `scrollTo` + medir **no cede ni un fotograma**: el rAF no llega a correr,
 * `fit()` no se ejecuta y lo que se lee son las posiciones de antes del scroll.
 * Una suite entera puede salir verde midiendo el estado anterior a cada gesto.
 *
 * Dos fotogramas y no uno: el primero es en el que corre el rAF que el scroll
 * encoló; el segundo es en el que se ve lo que ese rAF escribió. Y encima un
 * respiro corto, porque `fit()` puede disparar un `setState` —el rótulo
 * `Editando · …`— y React vuelve a pintar en un fotograma más.
 *
 * Por eso ninguna aserción llama a `getBoundingClientRect` directamente: todas
 * pasan por `scrollPageTo` o por `settle`, y así ninguna puede olvidarse.
 */
export async function settle() {
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
  await new Promise((resolve) => setTimeout(resolve, 24))
  // El movimiento (lienzo «Movimiento») anima entradas de hasta 600 ms: se mide
  // donde queda, no a mitad de camino. Las animaciones que no acaban solas
  // (un pulso que se repite) no se esperan.
  const enCurso = document
    .getAnimations()
    .filter((a) => a.playState === 'running' && a.effect?.getTiming?.().iterations !== Infinity)
  if (enCurso.length > 0) {
    await Promise.race([
      Promise.all(enCurso.map((a) => a.finished.catch(() => {}))),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ])
  }
  await new Promise((resolve) => requestAnimationFrame(resolve))
}

/** Desplaza la página y espera al fotograma. La única forma de mover el scroll. */
export async function scrollPageTo(y) {
  window.scrollTo(0, y)
  await settle()
}

/**
 * Las paradas del barrido: de arriba del todo al final del documento, cada
 * `step` píxeles, más el final exacto — que es donde el pie del panel se junta
 * con la barra fija y por tanto donde más duele.
 */
export function scrollStops(step = 25) {
  const max = Math.max(0, document.documentElement.scrollHeight - window.innerHeight)
  const stops = []
  for (let y = 0; y < max; y += step) stops.push(y)
  stops.push(max)
  return stops
}

/** ¿Este elemento ocupa sitio y se pinta? Un control de 0×0 no tapa a nadie. */
export function isVisible(el) {
  const r = el.getBoundingClientRect()
  if (r.width === 0 || r.height === 0) return false
  const cs = getComputedStyle(el)
  return cs.visibility !== 'hidden' && cs.display !== 'none' && cs.opacity !== '0'
}

/** Todos los controles visibles bajo `root`, ya filtrados. */
export function controlsIn(root) {
  return [...root.querySelectorAll(INTERACTIVE)].filter(isVisible)
}

/**
 * Los controles de la *página* que el panel puede llegar a partir o a tapar.
 *
 * Se excluye lo mismo que excluye `fit()`, y por las mismas razones: lo de
 * dentro del panel (es el panel), lo que *contiene* al panel (un abuelo con
 * `tabindex` cruzaría los dos cantos siempre) y las barras fijas, que viven por
 * encima —`z-index: 10` contra el 3 del panel— así que solapar con ellas no
 * significa que el panel las tape, significa lo contrario. De eso se ocupa una
 * aserción propia.
 */
export function pageControls(panel) {
  return [...document.querySelectorAll(INTERACTIVE)].filter((el) => {
    if (panel.contains(el) || el.contains(panel)) return false
    if (el.closest('.bottom-nav, .days-cta')) return false
    return isVisible(el)
  })
}

const area = (r) => Math.max(0, r.width) * Math.max(0, r.height)

/**
 * El rectángulo que de verdad se pinta: el del elemento recortado por cada
 * antepasado que recorta.
 *
 * Hace falta porque la app tiene carruseles. La fila de chips de músculo de
 * Progreso es `overflow-x: auto` con `flex-wrap: nowrap`, así que un chip del
 * borde tiene caja más allá del recorte de su propia fila. Medir el solapamiento
 * contra la caja sin recortar diría que el panel tapa trozos que nadie ve, y la
 * fracción que sale en el mensaje de fallo sería un número inventado. Se mide lo
 * que hay en pantalla.
 *
 * Devuelve `null` cuando no queda nada: un control desplazado fuera de su
 * carrusel no lo tapa nadie, porque no está.
 */
export function paintedRect(el) {
  let r = el.getBoundingClientRect()
  let box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom }
  for (let node = el.parentElement; node; node = node.parentElement) {
    const cs = getComputedStyle(node)
    if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue
    const c = node.getBoundingClientRect()
    if (cs.overflowX !== 'visible') {
      box.left = Math.max(box.left, c.left)
      box.right = Math.min(box.right, c.right)
    }
    if (cs.overflowY !== 'visible') {
      box.top = Math.max(box.top, c.top)
      box.bottom = Math.min(box.bottom, c.bottom)
    }
    if (box.right - box.left <= 0 || box.bottom - box.top <= 0) return null
  }
  return { ...box, width: box.right - box.left, height: box.bottom - box.top }
}

/** El rectángulo común a dos, o `null` si no se tocan. */
export function overlap(a, b) {
  const left = Math.max(a.left, b.left)
  const right = Math.min(a.right, b.right)
  const top = Math.max(a.top, b.top)
  const bottom = Math.min(a.bottom, b.bottom)
  if (right - left <= EPS || bottom - top <= EPS) return null
  return { left, right, top, bottom, width: right - left, height: bottom - top }
}

/**
 * Clasifica lo que el panel le hace a un control. Tres respuestas y sólo tres,
 * que es justo la regla que esta suite existe para vigilar: **o no lo toca, o
 * lo tapa entero — nunca a medias.**
 *
 * `covered` exige que el rectángulo del control quepa dentro del panel por los
 * cuatro lados, no que solapen mucho. Un control tapado al 97 % sigue teniendo
 * un canto opaco cruzándolo, y un canto opaco cruzando un control no se lee
 * como «tapado», se lee como «roto».
 */
export function coverage(panelRect, elRect) {
  const cross = overlap(panelRect, elRect)
  if (!cross) return { state: 'clear', cross: null }
  const inside =
    elRect.left >= panelRect.left - EPS &&
    elRect.right <= panelRect.right + EPS &&
    elRect.top >= panelRect.top - EPS &&
    elRect.bottom <= panelRect.bottom + EPS
  return {
    state: inside ? 'covered' : 'sliced',
    cross,
    fraction: area(elRect) === 0 ? 0 : area(cross) / area(elRect),
  }
}

/** Cómo se nombra un control en un mensaje de fallo: sin esto no se depura. */
export function describe(el) {
  const label =
    el.getAttribute('aria-label') ||
    (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 40) ||
    el.getAttribute('placeholder') ||
    el.id
  const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(/\s+/).join('.')}` : ''
  const r = el.getBoundingClientRect()
  return `${el.tagName.toLowerCase()}${cls} «${label}» [${r.top.toFixed(1)}–${r.bottom.toFixed(1)}]`
}

// ── El tema, forzado ───────────────────────────────────────────────────────
// La hoja pinta lo que diga `<html data-theme>` (src/theme.js), así que una
// suite que no lo fije mide el que haya dejado otra y el contraste del otro no
// lo mira nadie. Fijar el atributo es exactamente lo que hace la app al elegir
// tema en Perfil: se mide la misma hoja, sin copiar un solo hex.
export function forceTheme(theme) {
  document.documentElement.dataset.theme = theme
}

export function clearForcedTheme() {
  delete document.documentElement.dataset.theme
}

// ── Contraste sobre el color realmente pintado ─────────────────────────────
// No sobre el token declarado: sobre lo que hay debajo. Un panel opaco encima
// de una tarjeta encima del fondo de página son tres capas, y `--danger` cambia
// de veredicto según cuál de las tres esté detrás. Esto es lo que jsdom no
// puede hacer de ninguna manera — allí `getComputedStyle` devuelve la cadena
// literal, sin resolver `var()`, sin componer alfa y sin saber qué hay debajo.

export function parseColor(str) {
  // `color-mix()` no vuelve como `rgb()`. Chrome resuelve
  // `color-mix(in srgb, var(--muted) 70%, transparent)` a
  // `color(srgb 0.607 0.631 0.662 / 0.7)`, que el patrón de abajo no casa — y
  // sin esto devolvía `[0,0,0,0]`, o sea «transparente», y cualquier contraste
  // medido sobre un token mezclado salía exactamente 1:1 en vez de fallar. Un
  // falso aprobado silencioso, justo en los tokens que la casa escribe
  // mezclados: los filetes, los velos y los bordes.
  const srgb = String(str).match(/color\(srgb\s+([^)]+)\)/)
  if (srgb) {
    const parts = srgb[1].split(/[/\s]+/).filter(Boolean).map(Number)
    return [parts[0] * 255, parts[1] * 255, parts[2] * 255, parts.length > 3 ? parts[3] : 1]
  }
  const m = String(str).match(/rgba?\(([^)]+)\)/)
  if (!m) return [0, 0, 0, 0]
  const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(Number)
  const [r, g, b] = parts
  const a = parts.length > 3 ? parts[3] : 1
  return [r, g, b, a]
}

/** `src` sobre `dst`, alfa recto. */
function composite(src, dst) {
  const a = src[3] + dst[3] * (1 - src[3])
  if (a === 0) return [0, 0, 0, 0]
  const ch = (i) => (src[i] * src[3] + dst[i] * dst[3] * (1 - src[3])) / a
  return [ch(0), ch(1), ch(2), a]
}

/**
 * El color que hay detrás de este elemento, compuesto de dentro hacia fuera
 * hasta dar con algo opaco. El lienzo es blanco si nadie pinta nada, que es lo
 * que hace el navegador.
 */
export function backdropOf(el) {
  let acc = [0, 0, 0, 0]
  for (let node = el; node; node = node.parentElement) {
    const c = parseColor(getComputedStyle(node).backgroundColor)
    if (c[3] === 0) continue
    acc = composite(acc, c)
    if (acc[3] >= 0.999) return acc
  }
  return composite(acc, [255, 255, 255, 1])
}

const channel = (v) => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

const luminance = ([r, g, b]) =>
  0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)

export function contrastRatio(fg, bg) {
  const painted = composite(fg, bg)
  const l1 = luminance(painted)
  const l2 = luminance(bg)
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * El suelo que le toca a este texto, según WCAG AA y según DESIGN.md, que dice
 * lo mismo: «text on bg and accent-on-surface must pass WCAG AA (4.5:1 body,
 * 3:1 large)». Grande es ≥24 px, o ≥18,66 px en negrita.
 */
export function contrastFloor(el) {
  const cs = getComputedStyle(el)
  const size = parseFloat(cs.fontSize)
  const weight = Number(cs.fontWeight) || 400
  const large = size >= 24 || (size >= 18.66 && weight >= 700)
  return large ? 3 : 4.5
}

/** ¿Este nodo escribe texto propio, o sólo contiene a quien lo escribe? */
export function ownsText(el) {
  return [...el.childNodes].some(
    (n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0,
  )
}

/**
 * Cada trozo de texto pintado bajo `root`, con su color, su fondo real, su
 * ratio y el suelo que le toca. Se saltan los elementos ocultos y los que sólo
 * llevan un glifo decorativo (`aria-hidden`), que no se leen.
 */
export function textContrastReport(root) {
  const out = []
  const nodes = [root, ...root.querySelectorAll('*')]
  for (const el of nodes) {
    if (!ownsText(el)) continue
    if (el.closest('[aria-hidden="true"]')) continue
    if (!isVisible(el)) continue
    const fg = parseColor(getComputedStyle(el).color)
    const bg = backdropOf(el)
    out.push({
      el,
      text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 40),
      ratio: contrastRatio(fg, bg),
      floor: contrastFloor(el),
      fg,
      bg,
    })
  }
  return out
}

// ── Y lo mismo para una frase ──────────────────────────────────────────────
// Todo lo de arriba mide *controles*, y la regla de la casa —«un canto opaco
// cruzando un control no se lee como tapado, se lee como roto»— no es una regla
// sobre controles: es una regla sobre cantos. Una frase partida por la mitad
// horizontal de sus letras se lee igual de rota, y encima no hay nada que
// tocar que devuelva el trozo que falta.
//
// La unidad no es el elemento, es **la línea**. Un párrafo de tres renglones
// cortado entre el primero y el segundo no tiene ninguna letra partida: dice
// «hay más debajo», que es lo que dice cualquier lista cortada. Lo que se
// prohíbe es que el canto caiga *dentro* de un renglón. Por eso se miden los
// rectángulos que el navegador le da a un rango de texto y no la caja del
// elemento.

/** Los renglones que este elemento pinta de su propio texto, ya recortados. */
export function lineRects(el) {
  const clip = paintedRect(el)
  if (!clip) return []
  const out = []
  for (const node of el.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE) continue
    if (!node.textContent.trim()) continue
    const range = document.createRange()
    range.selectNodeContents(node)
    for (const r of range.getClientRects()) {
      const left = Math.max(r.left, clip.left)
      const right = Math.min(r.right, clip.right)
      const top = Math.max(r.top, clip.top)
      const bottom = Math.min(r.bottom, clip.bottom)
      if (right - left <= 0 || bottom - top <= 0) continue
      out.push({ left, right, top, bottom, width: right - left, height: bottom - top })
    }
  }
  return out
}

/**
 * Cada renglón de prosa de la página que el panel puede llegar a cruzar.
 *
 * **Se salta lo que vive dentro de un control**, y no por comodidad: eso ya lo
 * barre `pageControls`, con un listón más duro —un control tapado entero
 * además tiene que estar `inert`—, así que contarlo aquí sería la misma queja
 * dicha dos veces y con el veredicto más flojo de los dos.
 */
export function pageProse(panel) {
  const out = []
  for (const el of document.querySelectorAll('*')) {
    if (panel.contains(el) || el.contains(panel)) continue
    if (el.closest('.bottom-nav, .days-cta')) continue
    if (el.closest(INTERACTIVE)) continue
    if (el.closest('[aria-hidden="true"]')) continue
    if (!ownsText(el) || !isVisible(el)) continue
    for (const r of lineRects(el)) out.push({ el, rect: r })
  }
  return out
}

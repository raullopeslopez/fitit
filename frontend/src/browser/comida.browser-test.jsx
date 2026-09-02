// Comida, medida donde se puede medir: en un navegador con motor de maquetación.
//
// Lo que esta suite comprueba es exactamente lo que jsdom no puede decir. La
// pantalla se sostiene sobre una distinción que es **de color y de altura**: un
// total desconocido se imprime `—` y no `0`, y esa raya tiene que (a) pintarse
// con la misma tinta que las cifras de al lado, para que se lea como un valor y
// no como un hueco, y (b) ocupar la misma altura de línea, para que la columna
// no se hunda. Ninguna de las dos cosas existe en jsdom: no hay pintado y
// `getBoundingClientRect()` devuelve ceros.
//
// Lo demás es geometría de teléfono: cuatro columnas en 430 px sin desbordar, y
// la CTA por delante de la barra de pestañas fija en vez de debajo de ella —
// que es el defecto que esta suite se creó para cazar en el editor.
import { afterEach } from 'vitest'

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { mountComida } from './screen.jsx'
import {
  backdropOf,
  clearForcedTheme,
  contrastRatio,
  forceTheme,
  overlap,
  paintedRect,
  parseColor,
  settle,
} from './geometry.js'

afterEach(() => clearForcedTheme())

const macroCells = () => [...document.querySelectorAll('.food-macro')]

describe('Comida', () => {
  it('llega con el día pintado', async () => {
    await mountComida()
    expect(document.querySelector('.food-sum')).not.toBeNull()
    expect(macroCells()).toHaveLength(4)
  })

  it('la fecha y sus dos pasos van en un solo renglón', async () => {
    await mountComida()
    const nav = document.querySelector('.food-daynav')
    const [prev, next] = [...nav.querySelectorAll('.food-daystep')].map(paintedRect)
    const stamp = paintedRect(nav.querySelector('.food-daystamp'))

    // Un renglón, no tres. La fila mide lo que mide un objetivo de dedo, y no
    // la suma de sus tres hijos apilados: cuando `.food-daynav` no llega a
    // pintarse —un comentario sin abrir más arriba en la hoja se lo comió— los
    // hijos se apilan y esto pasa de 44 a 110 px sin que falle nada más.
    expect(paintedRect(nav).height).toBeLessThanOrEqual(56)

    // Y los tres a la misma altura: el sello entre los dos pasos, cada uno a un
    // lado. Con `‹` encima de la fecha y `›` debajo no hay «alineación» que
    // arreglar — no es una fila.
    const middle = (box) => box.top + box.height / 2
    expect(middle(prev)).toBeCloseTo(middle(stamp), 0)
    expect(middle(next)).toBeCloseTo(middle(stamp), 0)
    expect(prev.right).toBeLessThanOrEqual(stamp.left + 0.5)
    expect(next.left).toBeGreaterThanOrEqual(stamp.right - 0.5)
  })

  it('la raya de un dato desconocido se pinta como una cifra, no como un hueco', async () => {
    await mountComida()
    const values = macroCells().map((cell) => cell.querySelector('.food-macro-value'))
    const dash = values.find((el) => el.textContent === '—')
    const number = values.find((el) => el.textContent !== '—')
    expect(dash).toBeDefined()

    // Misma tinta. Si la raya se pintara en `--muted` se leería como "aquí no
    // hay nada", que es justo lo contrario de lo que dice: hay un dato y no lo
    // sabemos. Un JPEG no distingue estos dos colores; `getComputedStyle` sí.
    expect(getComputedStyle(dash).color).toBe(getComputedStyle(number).color)

    // Misma altura de caja, o la columna sin dato se hunde y la fila deja de
    // leerse como una fila.
    expect(paintedRect(dash).height).toBeCloseTo(paintedRect(number).height, 0)
  })

  it('el pie explica la raya y se lee', async () => {
    await mountComida()
    const note = document.querySelector('.food-unknown')
    expect(note.textContent).toBe('— no es cero: 1 entrada sin fibra.')
    for (const theme of ['light', 'dark']) {
      forceTheme(theme)
      await settle()
      const ratio = contrastRatio(
        parseColor(getComputedStyle(note).color),
        backdropOf(note),
      )
      // 4.5 es el suelo de AA para texto normal; el pie es prosa, no un sello.
      expect(ratio, `${theme}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('las cuatro macros caben en 430 px sin desbordar', async () => {
    await mountComida()
    const card = document.querySelector('.food-sum')
    expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
    // Y ninguna celda se sale de la tarjeta que las contiene.
    const box = paintedRect(card)
    for (const cell of macroCells()) {
      const rect = paintedRect(cell)
      expect(rect.left).toBeGreaterThanOrEqual(box.left - 0.5)
      expect(rect.right).toBeLessThanOrEqual(box.right + 0.5)
    }
    // La página entera tampoco: un scroll horizontal en un teléfono es un fallo.
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  })

  it('un nombre largo no empuja la cifra fuera de su fila', async () => {
    await mountComida()
    const row = [...document.querySelectorAll('.food-entry')].find((el) =>
      el.textContent.includes('Pan de centeno'),
    )
    const rowBox = paintedRect(row)
    const kcal = row.querySelector('.food-entry-kcal')
    expect(paintedRect(kcal).right).toBeLessThanOrEqual(rowBox.right + 0.5)
  })

  it('abrir «Añadir alimento» trae el buscador a la pantalla', async () => {
    await mountComida()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Añadir alimento' }))
    await settle()

    // El panel se abre al pie de una lista que ya pasa de la línea de
    // flotación. Sin traerlo a la vista, pulsar el botón no mueve la pantalla —
    // y un control que no responde se lee como roto, no como "hay más abajo".
    const field = await screen.findByLabelText('Buscar alimento')
    const rect = paintedRect(field)
    expect(rect, 'el buscador no se está pintando').not.toBeNull()
    expect(rect.top).toBeGreaterThanOrEqual(0)
    expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight)

    // Y no debajo de la barra de pestañas, que es fija y va por delante.
    const nav = document.querySelector('nav.bottom-nav')
    expect(overlap(paintedRect(nav), rect), 'la barra tapa el buscador').toBeNull()

    // El cursor ya está dentro: lo siguiente que ibas a hacer era escribir.
    expect(document.activeElement).toBe(field)
  })

  it('el panel abierto no deja ni un control bajo la barra', async () => {
    await mountComida()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Añadir alimento' }))
    await user.type(screen.getByLabelText('Buscar alimento'), 'pan')
    // El desplegado con resultados es el panel en su tamaño máximo, que es el
    // único que hace falta medir: si cabe éste, caben todos.
    //
    // Se espera a `.food-result`, no a un botón por su nombre: ese alimento
    // está también en la lista del día, así que buscarlo por nombre lo
    // encuentra en el diario y sigue adelante con el panel todavía vacío —
    // midiendo un panel 75 px más corto que el que el usuario ve.
    await vi.waitFor(() => expect(document.querySelector('.food-result')).not.toBeNull(), {
      timeout: 5000,
    })
    await settle()

    // Medido **tal y como queda al abrirlo**, sin ayudarle con un scroll que el
    // usuario no sabe que tiene que hacer. La primera versión de esta prueba
    // barría hasta el fondo antes de medir y por eso pasaba en verde con
    // «Crear …» y «Cancelar» 24 px debajo de la barra: alcanzables, sí, pero
    // invisibles en el momento en que se necesitan.
    const nav = paintedRect(document.querySelector('nav.bottom-nav'))
    const controls = [...document.querySelectorAll('.food-search button, .food-search input')]
    expect(controls.length, 'el panel no trae resultados').toBeGreaterThan(3)
    for (const control of controls) {
      const rect = paintedRect(control)
      const hit = overlap(nav, rect)
      expect(
        hit,
        `la barra (top ${nav.top}) tapa «${control.textContent || control.id}» ` +
          `(${rect.top.toFixed(1)}–${rect.bottom.toFixed(1)}) en ${hit?.height.toFixed(1)}px`,
      ).toBeNull()
    }
  })

  it('la CTA de añadir es alcanzable, no queda bajo la barra de pestañas', async () => {
    await mountComida()
    const cta = document.querySelector('.food-cta')
    const nav = document.querySelector('nav.bottom-nav')
    cta.scrollIntoView({ block: 'center' })
    await settle()
    // `overlap` devuelve el rectángulo común, o `null` cuando no se tocan —
    // que es lo que tiene que pasar aquí.
    expect(overlap(paintedRect(nav), paintedRect(cta)), 'la barra fija tapa la CTA').toBeNull()
    // Y es un objetivo de dedo: 44 px es el suelo que usa el resto de la app.
    expect(paintedRect(cta).height).toBeGreaterThanOrEqual(44)
  })
})

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

// El total del día pasó de tarjeta hero a tira fina: mismos cuatro valores,
// misma regla de la raya, otra caja.
const macroCells = () => [...document.querySelectorAll('.food-strip-macro')]

describe('Comida', () => {
  it('llega con el día pintado', async () => {
    await mountComida()
    expect(document.querySelector('.food-strip')).not.toBeNull()
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

    // El sello «Hoy» va dentro del renglón, no lo estira: su borde y su relleno
    // son más altos que el texto que rodean, y sin corregir la línea base la
    // fila crecía por un adorno de 11 px.
    const hoy = paintedRect(document.querySelector('.food-today'))
    const fecha = paintedRect(document.querySelector('.food-daystamp-date'))
    expect(middle(hoy)).toBeCloseTo(middle(fecha), 0)
    expect(paintedRect(nav).height).toBeLessThanOrEqual(48)
  })

  it('la raya de un dato desconocido se pinta como una cifra, no como un hueco', async () => {
    await mountComida()
    const values = macroCells().map((cell) => cell.querySelector('.food-strip-value'))
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

  it('el pie explica la raya, se lee y ahora se toca', async () => {
    await mountComida()
    const note = document.querySelector('.food-unknown-chip')
    expect(note.textContent).toBe('— no es cero: 1 entrada sin fibra.')
    expect(note.tagName).toBe('BUTTON')
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
    const card = document.querySelector('.food-strip')
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

  it('abrir la CTA trae el buscador a la pantalla', async () => {
    await mountComida()
    const user = userEvent.setup()
    // Por el `+` del último raíl, que es el caso peor: el panel se abre lo más
    // abajo que puede abrirse.
    await user.click(screen.getByRole('button', { name: 'Añadir a snack' }))
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

  it('el panel puede taparle la barra al pulgar, pero nunca al revés', async () => {
    await mountComida()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Añadir a snack' }))
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

    // Ahora el panel es una hoja fija por encima de todo (`z-index` más alto
    // que el de la barra), no contenido en el flujo del documento por debajo
    // de ella: puede llegar hasta donde vive la barra sin que eso sea el
    // defecto que esta prueba nació para cazar —una hoja modal tapando la
    // navegación mientras está abierta es lo normal, en cualquier app—. Lo
    // que sigue siendo un defecto es que la barra, con menos `z-index`,
    // *gane* esa carrera y se coma un control: por eso la prueba no se
    // conforma con leer el CSS, comprueba con `elementFromPoint` qué hay de
    // verdad en el punto donde ambas cajas se cruzan.
    const nav = paintedRect(document.querySelector('nav.bottom-nav'))
    const controls = [...document.querySelectorAll('.food-search button, .food-search input')]
    expect(controls.length, 'el panel no trae resultados').toBeGreaterThan(3)
    for (const control of controls) {
      const rect = paintedRect(control)
      const hit = overlap(nav, rect)
      if (!hit) continue
      const atPoint = document.elementFromPoint((hit.left + hit.right) / 2, (hit.top + hit.bottom) / 2)
      expect(
        control === atPoint || control.contains(atPoint),
        `la barra (top ${nav.top}) gana sobre «${control.textContent || control.id}» ` +
          `(${rect.top.toFixed(1)}–${rect.bottom.toFixed(1)}) en vez de quedar detrás`,
      ).toBe(true)
    }
  })

  it('la tira de «lo de siempre» se desplaza en horizontal y se puede tocar', async () => {
    await mountComida()
    const tiles = [...document.querySelectorAll('.food-repeat')]
    expect(tiles.length, 'la tira no se está pintando').toBeGreaterThanOrEqual(4)

    const nav = paintedRect(document.querySelector('nav.bottom-nav'))
    const tops = []
    for (const tile of tiles) {
      // La tira desplaza en horizontal: un azulejo que no está en la parte
      // visible no está «pintado» —`paintedRect` lo recorta a nada—, así que
      // hay que traerlo antes de medirlo, igual que con cualquier otra lista.
      // Y se mide en el mismo paso: traer el siguiente azulejo puede volver a
      // sacar de la vista al anterior.
      tile.scrollIntoView({ block: 'nearest', inline: 'center' })
      await settle()
      const rect = paintedRect(tile)
      // Objetivo de dedo, como todo lo que se pulsa en esta app.
      expect(rect.height, tile.textContent).toBeGreaterThanOrEqual(44)
      expect(overlap(nav, rect), 'la barra tapa un azulejo').toBeNull()
      tops.push(rect.top)
    }
    // Una tira, no una rejilla: todos los azulejos a la misma altura, y la
    // página en sí nunca desborda en horizontal aunque la tira sí lo haga —
    // es ella la que se desplaza, no el viewport entero.
    for (const top of tops) expect(top).toBeCloseTo(tops[0], 0)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    const strip = document.querySelector('.food-siempre-strip')
    expect(strip.scrollWidth, 'con cuatro azulejos la tira debería desbordar').toBeGreaterThan(
      strip.clientWidth,
    )
  })

  it('el + de cada raíl es un objetivo de dedo y no queda bajo la barra', async () => {
    await mountComida()
    const nav = document.querySelector('nav.bottom-nav')
    const adds = [...document.querySelectorAll('.food-rail-add')]
    // Cuatro: uno por comida. El montón sin asignar no lleva, a propósito.
    expect(adds).toHaveLength(4)
    for (const add of adds) {
      add.scrollIntoView({ block: 'center' })
      await settle()
      const rect = paintedRect(add)
      // 44 px es el suelo que usa el resto de la app, y este control se pulsa
      // cuatro veces al día.
      expect(rect.height, add.getAttribute('aria-label')).toBeGreaterThanOrEqual(44)
      expect(rect.width, add.getAttribute('aria-label')).toBeGreaterThanOrEqual(44)
      expect(overlap(paintedRect(nav), rect), 'la barra fija tapa un +').toBeNull()
    }
  })

  it('un raíl vacío no lleva subtotal', async () => {
    await mountComida()
    // Snack es el único raíl sin entradas en el fixture: su cabecera con el
    // `+` ya dice que está vacío, así que no imprime ni una raya.
    const rails = [...document.querySelectorAll('.food-rail')]
    const snack = rails.find((r) => r.querySelector('.food-rail-name')?.textContent === 'Snack')
    expect(snack.querySelector('.food-rail-kcal')).toBeNull()
  })

  it('un raíl con algo dentro, pero de total desconocido, sigue llevando una raya con tinta de cifra', async () => {
    await mountComida()
    const kcal = [...document.querySelectorAll('.food-rail-kcal')]
    const raya = kcal.find((e) => e.textContent.startsWith('—'))
    const cifra = kcal.find((e) => !e.textContent.startsWith('—'))
    expect(raya, 'ningún raíl con total desconocido en el fixture').toBeDefined()
    // Misma razón que en el total del día: en `--muted` la raya se leería como
    // «aquí no hay nada», y lo que dice es «este total no cuadra todavía».
    expect(getComputedStyle(raya).color).toBe(getComputedStyle(cifra).color)
    expect(paintedRect(raya).height).toBeCloseTo(paintedRect(cifra).height, 0)
  })

  it('la CTA fija no tapa la barra de pestañas, y el hueco al pie basta para el último raíl', async () => {
    await mountComida()
    const cta = document.querySelector('.food-cta')
    const nav = paintedRect(document.querySelector('nav.bottom-nav'))
    expect(overlap(nav, paintedRect(cta)), 'la barra de pestañas tapa la CTA').toBeNull()

    // Al final de verdad del scroll —no `scrollIntoView({block:'end'})`, que
    // alinea el raíl con el borde del viewport ignorando el hueco que
    // `.comida` deja para la CTA a propósito—: `document.scrollingElement` a
    // su `scrollHeight` es donde el usuario llega al tirar hasta el fondo.
    const scroller = document.scrollingElement
    scroller.scrollTop = scroller.scrollHeight
    await settle()
    const rails = [...document.querySelectorAll('.food-rail')]
    const last = rails[rails.length - 1]
    expect(
      overlap(paintedRect(cta), paintedRect(last)),
      'la CTA tapa el último raíl al llegar al fondo de verdad',
    ).toBeNull()
  })
})

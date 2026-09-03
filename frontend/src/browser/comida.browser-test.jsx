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

  it('el panel abierto no deja ni un control bajo la barra', async () => {
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

  it('la rejilla de «lo de siempre» va en dos columnas y se puede tocar', async () => {
    await mountComida()
    const tiles = [...document.querySelectorAll('.food-repeat')]
    expect(tiles.length, 'la rejilla no se está pintando').toBeGreaterThanOrEqual(4)

    const nav = paintedRect(document.querySelector('nav.bottom-nav'))
    const card = paintedRect(document.querySelector('.food-siempre'))
    for (const tile of tiles) {
      tile.scrollIntoView({ block: 'center' })
      await settle()
      const rect = paintedRect(tile)
      // Objetivo de dedo, como todo lo que se pulsa en esta app.
      expect(rect.height, tile.textContent).toBeGreaterThanOrEqual(44)
      // Y dentro de la columna, con un nombre de CIQUAL de dos líneas dentro:
      // lo que se sale de 430 px no se lee, se adivina.
      expect(rect.right).toBeLessThanOrEqual(card.right + 0.5)
      expect(overlap(nav, paintedRect(tile)), 'la barra tapa un azulejo').toBeNull()
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)

    // Dos columnas de verdad: los dos primeros a la misma altura, el tercero
    // debajo. Una sola columna de seis filas empujaría la CTA fuera.
    const [a, b, c] = tiles.map(paintedRect)
    expect(a.top).toBeCloseTo(b.top, 0)
    expect(c.top).toBeGreaterThan(a.bottom - 1)
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

  it('el subtotal de un raíl vacío es una raya con la tinta de una cifra', async () => {
    await mountComida()
    const kcal = [...document.querySelectorAll('.food-rail-kcal')]
    const raya = kcal.find((e) => e.textContent.startsWith('—'))
    const cifra = kcal.find((e) => !e.textContent.startsWith('—'))
    expect(raya, 'ningún raíl vacío en el fixture').toBeDefined()
    // Misma razón que en el total del día: en `--muted` la raya se leería como
    // «aquí no hay nada», y lo que dice es «aquí no has comido todavía».
    expect(getComputedStyle(raya).color).toBe(getComputedStyle(cifra).color)
    expect(paintedRect(raya).height).toBeCloseTo(paintedRect(cifra).height, 0)
  })

  // El alta manual creció a siete campos —Marca entró con el lector de
  // etiquetas— y «Guardar alimento» se fue por debajo del borde: quedaba a 918
  // px en una pantalla de 932, o sea fuera, y había que arrastrar para llegar a
  // él después de rellenar. Eso no se ve en jsdom, donde toda caja mide cero.
  describe('el alta de alimento', () => {
    async function abrirAlta() {
      const user = userEvent.setup()
      await mountComida()
      await user.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
      await user.type(await screen.findByLabelText('Buscar alimento'), 'piquillos')
      await user.click(await screen.findByRole('button', { name: /^Crear /, timeout: 5000 }))
      await screen.findByLabelText('Nombre')
      await settle()
      return user
    }

    const guardar = () =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Guardar alimento')

    it('«Guardar alimento» se ve sin arrastrar', async () => {
      await abrirAlta()
      const rect = paintedRect(guardar())
      expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight)
      expect(rect.height).toBeGreaterThanOrEqual(44)
    })

    it('y se puede pulsar: no hay nada por encima suyo', async () => {
      await abrirAlta()
      const boton = guardar()
      const rect = paintedRect(boton)
      // `elementFromPoint` y no sólo la caja: un elemento puede estar dentro de
      // la pantalla y aun así tener la barra de pestañas por delante, que es el
      // defecto que esta suite existe para cazar.
      const encima = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
      expect(boton.contains(encima) || encima === boton).toBe(true)
    })

    it('la barra de pestañas no lo tapa', async () => {
      await abrirAlta()
      const nav = document.querySelector('.bottom-nav')
      expect(overlap(paintedRect(nav), paintedRect(guardar()))).toBeNull()
    })

    // Y por la puerta de la cámara, que es la que lo rompía: `AddFood` se
    // desplaza al abrirse, pero al pasar de la búsqueda al formulario no vuelve
    // a hacerlo — y el formulario que sale de una foto es el largo, con las
    // cinco cifras puestas. Medido antes del arreglo: el botón arrancaba a 918
    // px en una pantalla de 932, o sea fuera.
    function conFoto(input) {
      const dt = new DataTransfer()
      dt.items.add(new File([new Uint8Array([255, 216, 255])], 'e.jpg', { type: 'image/jpeg' }))
      input.files = dt.files
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }

    async function fotografiar() {
      const user = userEvent.setup()
      await mountComida()
      await user.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
      conFoto(document.getElementById('food-photo'))
      await screen.findByLabelText('Nombre')
      await settle()
    }

    it('tras leer una etiqueta, «Guardar alimento» también se ve', async () => {
      await fotografiar()
      expect(document.getElementById('food-name').value).toBe('Yogur natural')
      const rect = paintedRect(guardar())
      expect(rect.bottom).toBeLessThanOrEqual(window.innerHeight)
    })

    it('y se sigue viendo la segunda vez que abres el panel', async () => {
      // La primera vuelta salía bien y las siguientes no, que es la forma más
      // cara de tener un fallo: al probarlo una vez parece correcto. `AddFood`
      // se desplazaba en su primer montaje y nunca más, así que en la segunda
      // vuelta el scroll volvía a 0 y el botón nacía a 1047 px de una pantalla
      // de 932. Tres vueltas, porque con una no se distingue.
      const user = userEvent.setup()
      await mountComida()
      for (let vuelta = 1; vuelta <= 3; vuelta++) {
        await user.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
        conFoto(document.getElementById('food-photo'))
        await screen.findByLabelText('Nombre')
        await settle()
        const rect = paintedRect(guardar())
        expect(rect.bottom, `vuelta ${vuelta}`).toBeLessThanOrEqual(window.innerHeight)
        await user.click(
          [...document.querySelectorAll('button')].find((b) => b.textContent === 'Cancelar'),
        )
        await settle()
      }
    })

    it('y lo primero que se ve es qué se leyó, no el final del formulario', async () => {
      await fotografiar()
      // La línea que dice de qué columna salieron las cifras es la que convierte
      // «confirmar» en algo distinto de «firmar en blanco». Si nace fuera de la
      // pantalla, no la lee nadie.
      const nota = paintedRect(document.querySelector('.food-label-read'))
      expect(nota.top).toBeGreaterThanOrEqual(0)
      expect(nota.bottom).toBeLessThanOrEqual(window.innerHeight)
    })
  })
})

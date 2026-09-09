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

// Los macros de la cabecera: proteína, hidratos y grasa, cada uno con su fila y
// su barra. La fibra no está — no tiene objetivo, y una barra sin meta no mide
// nada.
const macroRows = () => [...document.querySelectorAll('.food-macro')]
// Las cabeceras de comida con su subtotal. Un hueco no lleva ninguna.
const slotMetas = () => [...document.querySelectorAll('.food-slot-meta')]

// Lo que devuelve de verdad una búsqueda de «huevo» contra el catálogo CIQUAL:
// treinta filas, que es el tope del servidor (`SEARCH_LIMIT`). El tamaño es el
// dato — con una sola fila la hoja cabe en cualquier pantalla y no hay nada
// que medir.
const HUEVOS = Array.from({ length: 30 }, (_, i) => ({
  id: 700 + i,
  name: `Huevo de gallina, ${['entero', 'clara', 'yema'][i % 3]}, variedad ${i + 1}`,
  brand: null,
  source: 'ciqual',
  kcal_100g: 130 + i,
  protein_100g: 12,
  fat_100g: 9,
  carbs_100g: 0.7,
  fiber_100g: 0,
  portions: [],
  is_mine: false,
}))

describe('Comida', () => {
  it('llega con el día pintado', async () => {
    await mountComida()
    expect(document.querySelector('.food-macros')).not.toBeNull()
    expect(macroRows()).toHaveLength(3)
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
    // La columna de cifras de la pantalla es ahora la proteína de cada entrada,
    // por el borde derecho. Ahí es donde una raya tiene que seguir leyéndose
    // como un valor: hay un dato y no lo sabemos, que no es lo mismo que un
    // hueco. El fixture trae una entrada sin proteína a propósito.
    const values = [...document.querySelectorAll('.food-entry-protein')]
    const dash = values.find((el) => el.textContent.startsWith('—'))
    const number = values.find((el) => !el.textContent.startsWith('—'))
    expect(dash, 'ninguna entrada sin proteína en el fixture').toBeDefined()

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
    expect(note.textContent).toBe('— no es cero: 1 entrada sin proteína, 1 sin fibra.')
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

  it('la cabecera de macros cabe en 430 px sin desbordar', async () => {
    await mountComida()
    const card = document.querySelector('.food-macros')
    expect(card.scrollWidth).toBeLessThanOrEqual(card.clientWidth)
    // Y ninguna fila se sale de la tarjeta que las contiene.
    const box = paintedRect(card)
    for (const cell of macroRows()) {
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
    const protein = row.querySelector('.food-entry-protein')
    expect(paintedRect(protein).right).toBeLessThanOrEqual(rowBox.right + 0.5)
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

  it('la puerta de cada comida es un objetivo de dedo y no queda bajo la barra', async () => {
    await mountComida()
    const nav = document.querySelector('nav.bottom-nav')
    // Una por comida, venga en una tarjeta con contenido o en un hueco `dashed`:
    // es el mismo control, cambia sólo qué tarjeta lo aloja. El montón sin
    // asignar no lleva, a propósito.
    const adds = screen.getAllByRole('button', { name: /^Añadir a / })
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

  it('una comida vacía es un hueco en dashed, sin subtotal', async () => {
    await mountComida()
    // Snack es la única comida sin entradas en el fixture: se pinta como hueco,
    // no como tarjeta, y no imprime ni una raya. Un hueco no suma nada.
    const blanks = [...document.querySelectorAll('.food-blank')]
    expect(blanks).toHaveLength(1)
    expect(blanks[0]).toHaveTextContent('Snack')
    expect(blanks[0].querySelector('.food-slot-meta')).toBeNull()
    // Y el borde es de verdad discontinuo, que es lo que lo separa de una
    // tarjeta con contenido sin gastar un color.
    expect(getComputedStyle(blanks[0]).borderTopStyle).toBe('dashed')
    expect(getComputedStyle(blanks[0]).boxShadow).toBe('none')
  })

  it('una comida con algo dentro, pero de total desconocido, sigue llevando su raya', async () => {
    await mountComida()
    const metas = slotMetas()
    const raya = metas.find((e) => e.textContent.includes('— kcal'))
    expect(raya, 'ninguna comida con total desconocido en el fixture').toBeDefined()
    // Cena tiene una entrada dentro y aun así no puede sumar: la raya dice
    // «este total no cuadra todavía», que es distinto de una comida vacía.
    expect(raya.textContent).toBe('— P · — kcal')
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

    // Y en su borde de abajo, que es por donde lo alcanza el pulgar y por donde
    // pasa la barra de pestañas.
    //
    // La comprobación es `elementFromPoint` y no un solapamiento de cajas: la
    // hoja es un modal en `z-40` y la barra vive en `z-10` debajo de su velo,
    // así que cruzarse con ella en la geometría no significa nada. Lo que
    // significa algo es quién recibe el toque.
    it('y también por el borde de abajo, donde pasa la barra de pestañas', async () => {
      await abrirAlta()
      const boton = guardar()
      const rect = paintedRect(boton)
      const abajo = document.elementFromPoint(rect.left + rect.width / 2, rect.bottom - 2)
      expect(boton.contains(abajo) || abajo === boton).toBe(true)
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

  // El pie de la hoja: tres cosas distintas que se pintaban iguales.
  //
  // Los cuatro controles eran `.link-btn` —transparente, sin borde, tinta
  // plena, 600— y encima `inline-flex`, así que fluían en la misma línea y
  // rompían por donde cupieran. Es un defecto que jsdom no puede ver: sin motor
  // de maquetación no hay línea que compartir ni ancho que desbordar, y las 68
  // pruebas de `Comida.test.jsx` pasaban con el pie hecho un acordeón.
  describe('el pie de la hoja de alta', () => {
    async function abrirBuscando() {
      // Las dos cámaras en pantalla, que es el caso que se mide: sin
      // `BarcodeDetector` sólo se pinta una y no hay pareja que comparar.
      window.BarcodeDetector = class {
        detect() {
          return Promise.resolve([])
        }
      }
      const user = userEvent.setup()
      await mountComida()
      await user.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
      await settle()
      // Con texto escrito, para que «Crear …» esté puesto: es el control que
      // compartía renglón con una cámara.
      await user.type(document.getElementById('food-q'), 'pollo')
      await vi.waitFor(() => expect(document.querySelector('.food-create')).not.toBeNull())
      await settle()
      return user
    }

    afterEach(() => {
      delete window.BarcodeDetector
    })

    const cams = () => [...document.querySelectorAll('.food-camera')]

    it('las dos cámaras van hombro con hombro y caben en 430 px', async () => {
      await abrirBuscando()
      const [izq, der] = cams().map((el) => el.getBoundingClientRect())
      expect(cams()).toHaveLength(2)
      // Misma línea: es lo que dice que son hermanas.
      expect(Math.round(izq.top)).toBe(Math.round(der.top))
      expect(izq.right).toBeLessThanOrEqual(der.left)
      // Y ninguna se sale, ni empuja la página a lo ancho.
      expect(der.right).toBeLessThanOrEqual(window.innerWidth)
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
      // 44px es el suelo de DESIGN.md para todo lo que se toca.
      expect(izq.height).toBeGreaterThanOrEqual(44)
      expect(der.height).toBeGreaterThanOrEqual(44)
    })

    it('«Crear …» y «Cancelar» ya no comparten renglón con una cámara', async () => {
      await abrirBuscando()
      const crear = document.querySelector('.food-create').getBoundingClientRect()
      const cancelar = document.querySelector('.food-cancel').getBoundingClientRect()
      for (const cam of cams().map((el) => el.getBoundingClientRect())) {
        // Cada uno en su banda vertical: o entero encima, o entero debajo.
        expect(crear.bottom, 'crear').toBeLessThanOrEqual(cam.top)
        expect(cancelar.top, 'cancelar').toBeGreaterThanOrEqual(cam.bottom)
      }
      // Y los tres arrancan en la misma vertical: el `margin-left` que sangraba
      // «Cancelar» 15 px respecto de todo lo demás ya no está.
      expect(Math.round(cancelar.left)).toBe(Math.round(crear.left))
      expect(Math.round(cancelar.left)).toBe(Math.round(cams()[0].getBoundingClientRect().left))
    })

    it('mientras una lee, la otra se ve apagada de verdad', async () => {
      const user = await abrirBuscando()
      const real = window.fetch
      // La lectura se queda colgada a propósito: es el estado que dura hasta
      // veintiséis segundos (dos intentos de doce más la espera de en medio,
      // `backend/app/gemini.py`) y el único en el que se puede mirar.
      window.fetch = (url, opts) =>
        String(url).includes('/foods/label') ? new Promise(() => {}) : real(url, opts)
      try {
        await user.upload(
          document.getElementById('food-photo'),
          new File([new Uint8Array([255, 216, 255])], 'e.jpg', { type: 'image/jpeg' }),
        )
        await settle()
        const [codigo, etiqueta] = cams()
        // Apagada quiere decir apagada: pintada a menos tinta y sin recoger el
        // toque. El `disabled` vivía sólo en el `input`, que no se ve.
        expect(getComputedStyle(codigo).opacity).toBe('0.4')
        expect(getComputedStyle(codigo).pointerEvents).toBe('none')
        // Y la que trabaja no se apaga; se marca. Ámbar es el único color que
        // esta hoja gasta, y lo gasta en decir cuál de las dos es la tuya.
        expect(getComputedStyle(etiqueta).opacity).toBe('1')
        // El token, resuelto por el navegador: leerlo de `--accent` a pelo
        // devuelve la cadena sin normalizar y no se puede comparar con un rgb.
        const sonda = document.createElement('span')
        sonda.style.color = 'var(--accent)'
        document.body.append(sonda)
        const ambar = getComputedStyle(sonda).color
        sonda.remove()
        expect(getComputedStyle(etiqueta).borderTopColor).toBe(ambar)
        expect(getComputedStyle(codigo).borderTopColor).not.toBe(ambar)
        // El punto que late es el mismo de una serie encolada, no uno nuevo.
        expect(etiqueta.querySelector('.pending-dot')).not.toBeNull()
      } finally {
        window.fetch = real
      }
    })
  })

  // ── El contrato de color, medido sobre el color realmente pintado ────────
  //
  // Aquí es donde el contrato se puede afirmar de verdad: en jsdom no hay motor
  // de maquetación y `getComputedStyle` no resuelve `color-mix`, así que la
  // suite de siempre sólo puede decir qué pieza lleva cada papel. Esto lee el
  // color que sale por el píxel, en los dos esquemas.
  describe('el contrato de color', () => {
    // El valor de un token, resuelto por el propio navegador.
    //
    // `getPropertyValue('--accent')` devuelve la cadena tal cual está escrita
    // —`#e4571b`, o un `color-mix(...)` sin evaluar—, que no se puede comparar
    // con un `backgroundColor` ya calculado. Pintarlo en un elemento de mentira
    // y leerlo de vuelta lo normaliza, que es la única forma de comparar un
    // token con un píxel sin reimplementar `color-mix` aquí.
    const token = (name) => {
      const probe = document.createElement('span')
      probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(name)
      document.body.appendChild(probe)
      const value = parseColor(getComputedStyle(probe).color)
      probe.remove()
      return value
    }
    const rgb = ([r, g, b]) => [r, g, b].map((n) => Math.round(n))
    // Cuánto color tiene un color: la distancia entre su canal más alto y su más
    // bajo. Un gris da 0. Es la forma de medir «desaturado» sin salir de sRGB.
    const chroma = ([r, g, b]) => Math.max(r, g, b) - Math.min(r, g, b)
    const bg = (el) => parseColor(getComputedStyle(el).backgroundColor)

    it('lo cumplido se desatura y el cromo se queda en lo que falta', async () => {
      await mountComida()
      const lead = document.querySelector('.food-macro.is-lead')
      for (const theme of ['light', 'dark']) {
        forceTheme(theme)
        await settle()
        const done = bg(lead.querySelector('.food-macro-done'))
        const left = bg(lead.querySelector('.food-macro-left'))
        const accent = token('--accent')
        // Lo que falta va en el acento entero: es la regla 2 del contrato.
        expect(rgb(left), theme).toEqual(rgb(accent))
        // Y lo cumplido, más apagado que él. «Desaturar» se mide como distancia
        // al gris: el tramo consumido tiene que tener menos color que el acento,
        // o el contrato dice una cosa y la pantalla pinta otra.
        expect(
          chroma(done),
          `${theme}: cumplido ${chroma(done).toFixed(0)} vs acento ${chroma(accent).toFixed(0)}`,
        ).toBeLessThan(chroma(accent))
      }
    })

    it('sin cerrar el objetivo, --pr no aparece en ninguna barra', async () => {
      await mountComida()
      for (const theme of ['light', 'dark']) {
        forceTheme(theme)
        await settle()
        const pr = rgb(token('--pr'))
        // El tono profundo es el momento ganado. Con los 160 g de proteína
        // enteros por comer no hay momento ganado: `--pr` no puede aparecer.
        for (const part of document.querySelectorAll(
          '.food-macro-bar, .food-macro-done, .food-macro-left',
        )) {
          expect(rgb(bg(part)), `${theme}: ${part.className}`).not.toEqual(pr)
        }
      }
    })

    it('la jerarquía se dice con altura, no con un tono nuevo', async () => {
      await mountComida()
      const [lead, ...rest] = macroRows()
      // Proteína manda: 10px. Hidratos y grasa acompañan: 6px. Un color por
      // macro sería redundante con la posición y con la cifra.
      expect(lead).toHaveClass('is-lead')
      const height = (row) => paintedRect(row.querySelector('.food-macro-bar')).height
      expect(height(lead)).toBeCloseTo(10, 0)
      for (const row of rest) expect(height(row)).toBeCloseTo(6, 0)
    })

    it('el número héroe se lee sobre el fondo en los dos esquemas', async () => {
      await mountComida()
      const hero = document.querySelector('.food-macros-number')
      expect(hero.textContent).toBe('160')
      for (const theme of ['light', 'dark']) {
        forceTheme(theme)
        await settle()
        const ratio = contrastRatio(parseColor(getComputedStyle(hero).color), backdropOf(hero))
        // 3.0 es el suelo de AA para texto grande (2,6rem lo es de sobra). El
        // acento sobre papel no llega a 4.5 y no tiene por qué: es un número de
        // 42 px, no prosa.
        expect(ratio, `${theme}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3)
      }
    })
  })

  it('al llegar al fondo, la última comida no queda bajo la barra de pestañas', async () => {
    await mountComida()
    const nav = paintedRect(document.querySelector('nav.bottom-nav'))
    const scroller = document.scrollingElement
    scroller.scrollTop = scroller.scrollHeight
    await settle()
    // La línea de cierre es lo último de la pantalla: si ella se ve, todo lo de
    // encima se ve. Antes había una CTA fija ocupando este hueco; ahora el
    // hueco es sólo hueco, y sigue teniendo que bastar.
    const close = document.querySelector('.food-close')
    expect(overlap(nav, paintedRect(close)), 'la barra tapa la línea de cierre').toBeNull()
  })

  // ── La hoja del buscador con una búsqueda de verdad ─────────────────────
  //
  // «huevo» no devuelve un alimento: devuelve los treinta que cabe devolver
  // (`SEARCH_LIMIT`). Treinta filas de ~44 px son ~1.300 px de lista dentro de
  // una hoja anclada abajo en un teléfono de 932 px. Lo que pasaba entonces es
  // que la hoja crecía **hacia arriba**, fuera del `.sheet-scrim` fijo, y como
  // nada de eso tenía scroll propio no había forma de volver: el campo de
  // búsqueda y las primeras coincidencias quedaban por encima del borde
  // superior de la pantalla, y lo único visible era el pie —«Crear «huevo»» y
  // «Cancelar»—, que es exactamente lo que se lee como «no está en el
  // catálogo».
  it('treinta resultados no empujan el buscador fuera de la pantalla', async () => {
    await mountComida({ catalogue: HUEVOS })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
    await user.type(screen.getByLabelText('Buscar alimento'), 'huevo')
    await vi.waitFor(
      () => expect(document.querySelectorAll('.food-result').length).toBe(HUEVOS.length),
      { timeout: 5000 },
    )
    await settle()

    const field = paintedRect(screen.getByLabelText('Buscar alimento'))
    expect(field.top, 'el campo de búsqueda se ha ido por encima del borde').toBeGreaterThanOrEqual(0)
    expect(field.bottom).toBeLessThanOrEqual(window.innerHeight)

    // Y la salida sigue estando dentro, que es lo otro que se pierde cuando la
    // hoja desborda por los dos lados.
    const cancel = paintedRect(screen.getByRole('button', { name: 'Cancelar' }))
    expect(cancel.bottom, 'Cancelar cae fuera de la pantalla').toBeLessThanOrEqual(
      window.innerHeight + 0.5,
    )
  })

  it('la lista de resultados tiene su propio recorrido', async () => {
    await mountComida({ catalogue: HUEVOS })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
    await user.type(screen.getByLabelText('Buscar alimento'), 'huevo')
    await vi.waitFor(
      () => expect(document.querySelectorAll('.food-result').length).toBe(HUEVOS.length),
      { timeout: 5000 },
    )
    await settle()

    // Treinta filas no caben: el desbordamiento tiene que ser *scroll*, no
    // recorte. Sin esto la mitad del catálogo es inalcanzable.
    const list = document.querySelector('.food-results')
    expect(list.scrollHeight, 'la lista cabe entera, la prueba no mide nada').toBeGreaterThan(
      list.clientHeight,
    )

    list.scrollTop = list.scrollHeight
    await settle()
    expect(list.scrollTop, 'la lista no se desplaza').toBeGreaterThan(0)

    // Y al llegar abajo, el último resultado se ve de verdad.
    const rows = [...document.querySelectorAll('.food-result')]
    const last = paintedRect(rows[rows.length - 1])
    expect(last.bottom).toBeLessThanOrEqual(window.innerHeight + 0.5)
    expect(last.top).toBeGreaterThanOrEqual(0)
  })
})

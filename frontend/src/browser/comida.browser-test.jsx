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

import { page } from '@vitest/browser/context'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { mountComida } from './screen.jsx'
import { foodDayIso } from '../food.js'
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

// Los macros en barra de la cabecera: hidratos y grasa. La proteína y las kcal
// van en los anillos. La fibra no está — no tiene objetivo, y una barra sin
// meta no mide nada.
const macroRows = () => [...document.querySelectorAll('.food-macro')]
// Las cabeceras de comida con su subtotal. Un hueco no lleva ninguna.
const slotMetas = () => [...document.querySelectorAll('.hoy-fila-cifras')]

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
    expect(document.querySelector('.food-ring')).not.toBeNull()
    expect(macroRows()).toHaveLength(2)
  })

  it('los siete puntos caben en una fila, y cada día es un objetivo de dedo', async () => {
    await mountComida()
    const fila = document.querySelector('.hoy-puntos-fila')
    const dias = [...fila.children].map(paintedRect)
    // Siete en un renglón, no apilados: todos comparten la misma línea media.
    expect(dias).toHaveLength(7)
    const middle = (box) => box.top + box.height / 2
    for (const box of dias) expect(middle(box)).toBeCloseTo(middle(dias[0]), 0)
    // A 430 px los siete caben sin bajar de 44: se pulsan con el pulgar.
    for (const dia of fila.children) {
      const box = paintedRect(dia)
      expect(box.width, dia.getAttribute('aria-label')).toBeGreaterThanOrEqual(44)
      expect(box.height, dia.getAttribute('aria-label')).toBeGreaterThanOrEqual(44)
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
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
    for (const cell of [...macroRows(), document.querySelector('.food-ring-legend')]) {
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

  // Comida simple: los frecuentes son filas (nombre, cantidad, «+»).
  it('los frecuentes son filas que se tocan, y no desbordan la pantalla', async () => {
    // Se mudaron de Comida a Añadir: la pregunta «¿qué registro?» sólo te la
    // haces cuando ya has decidido registrar algo. Y de tira horizontal pasaron
    // a chips que envuelven, porque aquí no compiten con el objetivo del día —
    // lo que antes obligaba a caber en una sola fila.
    const user = userEvent.setup()
    await mountComida()
    await user.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
    await settle()
    const filas = [...document.querySelectorAll('.add-fila')]
    expect(filas.length, 'los frecuentes no se están pintando').toBeGreaterThanOrEqual(4)
    for (const fila of filas) {
      fila.scrollIntoView({ block: 'center' })
      await settle()
      // Objetivo de dedo, como todo lo que se pulsa en esta app. Los nombres de
      // CIQUAL son largos: la fila crece hacia abajo, no hacia fuera.
      for (const boton of fila.querySelectorAll('button')) {
        const rect = paintedRect(boton)
        expect(rect.height, boton.getAttribute('aria-label')).toBeGreaterThanOrEqual(36)
        expect(rect.right, boton.getAttribute('aria-label')).toBeLessThanOrEqual(window.innerWidth + 0.5)
      }
      expect(paintedRect(fila.querySelector('.add-fila-mas')).height).toBeGreaterThanOrEqual(44)
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
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

  it('una comida vacía lo dice con palabras, y no lleva subtotal', async () => {
    await mountComida()
    // Snack es la única comida sin entradas en el fixture. Un hueco no suma: ni
    // cifra ni raya, sólo que no hay nada.
    const vacias = [...document.querySelectorAll('.food-slot.is-empty')]
    expect(vacias).toHaveLength(1)
    expect(vacias[0]).toHaveTextContent('Snack')
    expect(vacias[0]).toHaveTextContent('Nada todavía')
    expect(vacias[0].querySelector('.hoy-fila-cifras')).toBeNull()
  })

  it('dentro de una tarjeta de comida hay un solo borde izquierdo', async () => {
    await mountComida()
    // La fila de un alimento heredaba el `padding: .55rem .2rem` de `.link-row`,
    // de cuando las filas vivían sueltas sobre la página. Dentro de una tarjeta
    // eso dejaba tres sangrías en el mismo bloque —cabecera y «+ Añadir» a 1rem
    // del canto, el nombre del alimento a 0,2rem— y la que se quedaba fuera era
    // justo la columna que se barre. En jsdom no se ve: toda caja mide cero.
    const card = [...document.querySelectorAll('.food-slot')].find((c) =>
      c.querySelector('.food-entry-name'),
    )
    card.scrollIntoView({ block: 'center' })
    await settle()

    const izquierda = paintedRect(card.querySelector('.hoy-fila-nombre')).left
    for (const name of card.querySelectorAll('.food-entry-name')) {
      expect(paintedRect(name).left, name.textContent).toBeCloseTo(izquierda, 0)
    }

    // Y la derecha: el contenido de cada fila acaba a 1rem del canto, el mismo
    // margen que la cabecera deja a su izquierda. Se mide la caja de la fila y
    // no la cifra, porque después de la cifra va el `›` de `.link-row::after`.
    const canto = paintedRect(card).right
    for (const row of card.querySelectorAll('.food-entry')) {
      const fin = paintedRect(row).right - parseFloat(getComputedStyle(row).paddingRight)
      expect(canto - fin, row.textContent).toBeCloseTo(izquierda - paintedRect(card).left, 0)
    }
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

    // La acción de la pantalla. Cambia de nombre según de dónde venga el
    // formulario —«Guardar alimento» a mano, «Dar de alta y continuar» tras una
    // lectura— porque no es lo mismo rellenar que revisar. Lo que estas pruebas
    // miden es dónde cae, que es lo mismo en los dos casos.
    const guardar = () =>
      [...document.querySelectorAll('button')].find((b) =>
        ['Guardar alimento', 'Dar de alta y continuar'].includes(b.textContent),
      )

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
      // El bloque que dice de qué columna salieron las cifras y cuántas
      // sobrevivieron es el que convierte «confirmar» en algo distinto de
      // «firmar en blanco». Si nace fuera de la pantalla, no lo lee nadie —y
      // entonces la revisión es un trámite, que es exactamente lo que no puede
      // ser.
      const bloque = paintedRect(document.querySelector('.food-origin'))
      expect(bloque.top).toBeGreaterThanOrEqual(0)
      expect(bloque.bottom).toBeLessThanOrEqual(window.innerHeight)
      // Y entero: con la mitad de arriba fuera se lee «de 5 cifras» sin saber
      // cuántas.
      expect(paintedRect(document.querySelector('.food-origin-count')).top).toBeGreaterThanOrEqual(0)
    })
  })

  // ── La pantalla Añadir, medida a 430×932 ────────────────────────────────
  //
  // Sustituye a las pruebas del pie de la hoja, que medían una pareja de
  // cámaras que ya no existe: los dos disparadores eran `.link-btn` sueltos
  // —transparentes, sin borde, tinta plena— que fluían en la misma línea que
  // «Crear …» y «Cancelar» y rompían por donde cupieran. Con una sola cámara en
  // su propia tarjeta y «Crear …» dentro de la lista, ese renglón no existe.
  //
  // Lo que queda por medir es lo de siempre: que se toque, que quepa, y que
  // nada quede debajo de nada.
  describe('la pantalla de añadir', () => {
    async function abrirBuscando(termino = 'pollo') {
      const user = userEvent.setup()
      await mountComida()
      await user.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
      await settle()
      await user.type(document.getElementById('food-q'), termino)
      await vi.waitFor(() => expect(document.querySelector('.food-create')).not.toBeNull(), {
        timeout: 5000,
      })
      await settle()
      return user
    }

    // El viewport vuelve a su sitio pase lo que pase. En el cuerpo de la prueba
    // se lo salta cualquier fallo, y entonces las tres siguientes se miden
    // contra un teléfono de 600 px de alto y fallan por un motivo que no es el
    // suyo — la misma fuga que ya costó media hora con `BarcodeDetector`.
    afterEach(async () => {
      await page.viewport(430, 932)
    })

    // ── Con el teclado subido ────────────────────────────────────────────
    //
    // `interactive-widget=resizes-content` (en `index.html`) hace que el teclado
    // de Android **encoja el viewport de maquetación** en vez de dibujarse
    // encima. Emularlo es exactamente eso: 430×932 pasa a 430×600 con un IME de
    // ~330 px. Y es el estado normal de esta pantalla, no un caso raro — se abre
    // con el foco en el buscador, así que el teclado sube solo.
    //
    // La hoja de antes se rompía justo aquí: tenía techo (88dvh), crecía hacia
    // arriba y con el teclado se comía su propia cabecera; la lista quedaba
    // cortada a media fila y los disparadores apelotonados contra el pie.
    it('con el teclado subido, el buscador sigue arriba y todo se alcanza', async () => {
      const user = await abrirBuscando('pan')
      await page.viewport(430, 600)
      await settle()

      // El campo, entero y dentro: es donde está el cursor y lo que se está
      // escribiendo. Si nace por encima del borde, no hay scroll que lo
      // devuelva —era el defecto de la hoja— y la búsqueda se lee como vacía.
      const campo = paintedRect(screen.getByLabelText('Buscar alimento'))
      expect(campo.top, 'el buscador se ha ido por encima del borde').toBeGreaterThanOrEqual(0)
      expect(campo.bottom).toBeLessThanOrEqual(window.innerHeight)
      expect(campo.height).toBeGreaterThanOrEqual(44)

      // Lo que no cabe rueda, y rueda **la columna**, no la página: un scroll
      // horizontal en un teléfono es un fallo por sí solo.
      const body = document.querySelector('.food-screen-body')
      expect(body.scrollHeight, 'no hay nada que rodar, la prueba no mide nada').toBeGreaterThan(
        body.clientHeight,
      )
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)

      // La cámara va dentro del buscador (comida simple): con el teclado
      // subido sigue a la vista, a su lado.
      const shoot = paintedRect(document.querySelector('.food-search-camara'))
      expect(shoot.top).toBeGreaterThanOrEqual(0)
      expect(shoot.bottom).toBeLessThanOrEqual(window.innerHeight)
      expect(shoot.height).toBeGreaterThanOrEqual(44)
      // Y al fondo del recorrido se llega a lo último de la columna.
      body.scrollTop = body.scrollHeight
      await settle()
      const ultimo = paintedRect(body.lastElementChild)
      expect(ultimo.top, 'lo último no se alcanza con el teclado subido').toBeLessThanOrEqual(window.innerHeight)
      await user.click(screen.getByRole('button', { name: 'Cancelar' }))
    })

    it('la cámara es una, va en el buscador, se toca y cabe', async () => {
      await abrirBuscando()
      const shoot = document.querySelector('.food-search-camara')
      expect(document.querySelectorAll('.food-search-camara, .food-camera-shoot')).toHaveLength(1)
      expect(document.querySelector('.food-search-field').contains(shoot)).toBe(true)
      const box = paintedRect(shoot)
      // 44px es el suelo de DESIGN.md para todo lo que se toca.
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.right).toBeLessThanOrEqual(window.innerWidth)
      expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    })

    it('«Crear …» vive dentro de la lista, no como hermano de la cámara', async () => {
      await abrirBuscando()
      const crear = document.querySelector('.food-create')
      // Dentro de la tarjeta de resultados: es el desenlace de esta búsqueda,
      // no una alternativa a la foto. Como hermano del disparador se leería
      // como «o haces una foto, o lo tecleas», que es justo la elección de
      // tecnología que este rediseño quita de en medio.
      expect(document.querySelector('.food-results-card').contains(crear)).toBe(true)
      expect(document.querySelector('.food-search-field').contains(crear)).toBe(false)
    })

    it('la pantalla tapa la barra de pestañas, y no al revés', async () => {
      await abrirBuscando()
      const nav = paintedRect(document.querySelector('nav.bottom-nav'))
      // Añadir es modal y ocupa la pantalla: que cubra la navegación mientras
      // está abierta es lo normal. Lo que sería un defecto es que la barra, con
      // menos `z-index`, gane la carrera y se coma un control — por eso esto no
      // lee el CSS, pregunta con `elementFromPoint` qué hay de verdad ahí.
      const controls = [...document.querySelectorAll('.food-screen button, .food-screen input')]
      expect(controls.length, 'la pantalla no trae controles').toBeGreaterThan(3)
      for (const control of controls) {
        const rect = paintedRect(control)
        const hit = overlap(nav, rect)
        if (!hit) continue
        const atPoint = document.elementFromPoint(
          (hit.left + hit.right) / 2,
          (hit.top + hit.bottom) / 2,
        )
        expect(
          control === atPoint || control.contains(atPoint) || control.parentElement === atPoint,
          `la barra se come «${control.textContent || control.id}»`,
        ).toBe(true)
      }
    })

    it('mientras lee, el disparador se ve apagado de verdad', async () => {
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
        const shoot = document.querySelector('.food-search-camara')
        // Apagado quiere decir apagado, no sólo `disabled` en un input que no
        // se ve: menos tinta, y el cursor deja de prometer que se puede pulsar.
        expect(Number(getComputedStyle(shoot).opacity)).toBeLessThan(1)
        expect(getComputedStyle(shoot).cursor).toBe('default')
        // El punto que late es el mismo de una serie encolada, no uno nuevo; va
        // en la línea «Leyendo…» bajo el buscador.
        expect(document.querySelector('.food-search-note .pending-dot')).not.toBeNull()
      } finally {
        window.fetch = real
      }
    })

    it('el peldaño de en medio pone sus dos salidas hombro con hombro', async () => {
      window.BarcodeDetector = class {
        detect() {
          return Promise.resolve([{ rawValue: '8410128750121' }])
        }
      }
      window.createImageBitmap = () => Promise.resolve({})
      // El código lo contesta el arnés (`/foods/barcode/` → `refusal: unknown`).
      // Envolver `window.fetch` aquí no serviría: `mountComida` instala el suyo
      // encima al montar, y el envoltorio se pierde sin decir nada.
      try {
        const user = userEvent.setup()
        await mountComida()
        await user.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
        await settle()
        await user.upload(
          document.getElementById('food-photo'),
          new File([new Uint8Array([255, 216, 255])], 'c.jpg', { type: 'image/jpeg' }),
        )
        await vi.waitFor(
          () => expect(document.querySelector('.food-escalada-actions')).not.toBeNull(),
          { timeout: 5000 },
        )
        await settle()
        const [foto, teclear] = [...document.querySelectorAll('.food-escalada-actions > *')].map(
          paintedRect,
        )
        // Las dos son salidas válidas, así que pesan lo mismo y van a la par:
        // «Teclearlo» no es rendirse — para un guiso de casa es la vía normal.
        expect(Math.round(foto.top)).toBe(Math.round(teclear.top))
        expect(Math.round(foto.height)).toBe(Math.round(teclear.height))
        expect(foto.height).toBeGreaterThanOrEqual(44)
        expect(foto.right).toBeLessThanOrEqual(teclear.left + 0.5)
        expect(Math.abs(foto.width - teclear.width)).toBeLessThanOrEqual(1)
        expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
      } finally {
        delete window.BarcodeDetector
        delete window.createImageBitmap
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

    // La barra se llena al comer (2026-10-02). La regla anterior pintaba en
    // cromo lo que faltaba, y a primera hora, sin nada apuntado, la barra salía
    // entera en ámbar: se leía «completo» justo cuando no había nada.
    // El fixture trae 0 g de proteína y 985 kcal: el anillo de proteína no
    // tiene arco (un arco de 0 sería un punto) y el de kcal sí.
    it('lo comido se pinta y lo que falta es el carril', async () => {
      await mountComida()
      const stroke = (el) => parseColor(getComputedStyle(el).stroke)
      for (const theme of ['light', 'dark']) {
        forceTheme(theme)
        await settle()
        expect(document.querySelector('.food-ring-arc.is-protein'), theme).toBeNull()
        const kcal = document.querySelector('.food-ring-arc.is-kcal')
        // Las kcal, en tinta: tan poco croma como la tinta misma, como las
        // barras que acompañan. El Hueso de Marcador es un blanco cálido (11).
        expect(chroma(rgb(stroke(kcal))), theme).toBeLessThanOrEqual(chroma(rgb(token('--text'))) + 2)
        const track = document.querySelector('.food-ring-track.is-protein')
        expect(rgb(stroke(track)), theme).toEqual(rgb(token('--border')))
        // Y las barras: lo que falta no lleva pintura propia.
        for (const row of macroRows()) {
          expect(
            getComputedStyle(row.querySelector('.food-macro-left')).backgroundColor,
            theme,
          ).toBe('rgba(0, 0, 0, 0)')
        }
      }
    })

    it('sin cerrar el objetivo, --pr no aparece ni en anillos ni en barras', async () => {
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
        for (const part of document.querySelectorAll('.food-ring circle')) {
          const color = rgb(parseColor(getComputedStyle(part).stroke))
          expect(color, `${theme}: ${part.getAttribute('class')}`).not.toEqual(pr)
        }
      }
    })

    // ── Las comidas no llevan color (Marcador, 2026-10-18) ────────────────
    //
    // El nombre y el orden del día ya las distinguen; con color, Desayuno se
    // confundía con Hombro. El color es de los músculos, y así significa algo.
    const tarjeta = (nombre) =>
      [...document.querySelectorAll('.food-slot, .food-blank')].find(
        (el) => el.querySelector('.hoy-fila-nombre').textContent === nombre,
      )

    it('ninguna comida tiñe su cabecera ni lleva punto de color', async () => {
      await mountComida()
      for (const theme of ['light', 'dark']) {
        forceTheme(theme)
        await settle()
        for (const nombre of ['Desayuno', 'Comida', 'Cena', 'Sin asignar']) {
          const t = tarjeta(nombre)
          const banda = backdropOf(t.querySelector('.hoy-fila-head'))
          const superficie = backdropOf(t.querySelector('.food-entry'))
          expect(contrastRatio(banda, superficie), `${nombre} · ${theme}`).toBeLessThan(1.02)
          const punto = getComputedStyle(t.querySelector('.hoy-fila-nombre'), '::before')
          expect(['none', 'normal', ''], `${nombre} · ${theme}`).toContain(punto.content)
        }
      }
    })

    // ── Marcador en Comida (2026-10-19) ───────────────────────────────────
    //
    // El titular de pantalla en Bricolage 800 a 54 px, las comidas como
    // titulares de fila, y un solo sitio en mandarina: el «Comido» de lo que
    // toca (comida simple).
    // El día de comida, no el de calendario: de 00:00 a 04:00 aún es ayer.
    const hoyIso = () => foodDayIso()
    const conPlan = () => [
      [
        /\/plans\/\d{4}-\d{2}-\d{2}$/,
        {
          id: 1,
          week_start: hoyIso(),
          entries: [
            {
              id: 50,
              log_date: hoyIso(),
              slot: 'snack',
              dish_id: 70,
              dish_name: 'Skyr con fresas',
              items: [],
              kcal: 250,
              protein: 25,
              carbs: 30,
              fat: 3,
              carbs_shift: null,
              status: null,
              log_entry_id: null,
            },
          ],
        },
      ],
    ]

    it('el día se titula en Bricolage 800 a 54 px, con la fecha al lado', async () => {
      await mountComida()
      const titulo = document.querySelector('.food-title')
      const estilo = getComputedStyle(titulo)
      expect(estilo.fontSize).toBe('54px')
      expect(estilo.fontWeight).toBe('800')
      expect(estilo.fontFamily).toContain('Bricolage Grotesque')
      // La fecha, en la misma línea que el titular y a su derecha.
      const fecha = document.querySelector('.food-daystamp-date').getBoundingClientRect()
      const t = titulo.getBoundingClientRect()
      expect(fecha.left).toBeGreaterThan(t.right)
      expect(fecha.bottom).toBeGreaterThan(t.top)
    })

    it('cada comida es un titular de fila en Bricolage 800', async () => {
      await mountComida()
      for (const nombre of document.querySelectorAll('.hoy-fila-nombre')) {
        const estilo = getComputedStyle(nombre)
        expect(estilo.fontWeight, nombre.textContent).toBe('800')
        expect(parseFloat(estilo.fontSize), nombre.textContent).toBeCloseTo(18.4, 1)
      }
    })

    // Comida simple: la comida que toca es el protagonista, y su «Comido» es
    // el único relleno mandarina de la pantalla.
    it('el único mandarina es el «Comido» de lo que toca', async () => {
      await mountComida({ routes: conPlan() })
      const ahora = await vi.waitFor(
        () => {
          const el = document.querySelector('.hoy-ahora')
          expect(el).not.toBeNull()
          return el
        },
        { timeout: 5000 },
      )
      for (const theme of ['light', 'dark']) {
        forceTheme(theme)
        await settle()
        // El fondo de un botón tarda 150 ms en cambiar de tema.
        await new Promise((r) => setTimeout(r, 250))
        const ambar = rgb(token('--accent'))
        const rellenos = [...document.querySelectorAll('.comida button')].filter(
          (b) => b.getClientRects().length > 0 && String(rgb(bg(b))) === String(ambar),
        )
        expect(rellenos.map((b) => b.textContent.trim()), theme).toEqual(['Comido'])
        expect(ahora.contains(rellenos[0]), theme).toBe(true)
      }
    })

    it('lo que toca va sin caja: ni borde ni fondo', async () => {
      await mountComida({ routes: conPlan() })
      const ahora = await vi.waitFor(() => {
        const el = document.querySelector('.hoy-ahora')
        expect(el).not.toBeNull()
        return el
      })
      const estilo = getComputedStyle(ahora)
      expect(estilo.borderTopStyle).toBe('none')
      expect(estilo.backgroundColor).toBe('rgba(0, 0, 0, 0)')
      const plato = getComputedStyle(ahora.querySelector('.hoy-ahora-plato'))
      expect(plato.fontFamily).toContain('Bricolage Grotesque')
      expect(plato.fontWeight).toBe('800')
    })

    it('la jerarquía se dice con grosor, no con un tono nuevo', async () => {
      await mountComida()
      // Proteína manda: anillo de 12. Kcal: 7. Hidratos y grasa: barra de 6.
      const trazo = (sel) =>
        parseFloat(getComputedStyle(document.querySelector(sel)).strokeWidth)
      expect(trazo('.food-ring-track.is-protein')).toBe(12)
      expect(trazo('.food-ring-track.is-kcal')).toBe(7)
      const height = (row) => paintedRect(row.querySelector('.food-macro-bar')).height
      for (const row of macroRows()) expect(height(row)).toBeCloseTo(6, 0)
    })

    it('el número héroe se lee sobre el fondo en los dos esquemas', async () => {
      await mountComida()
      const hero = document.querySelector('.food-macros-number')
      expect(hero.textContent).toBe('160')
      for (const theme of ['light', 'dark']) {
        forceTheme(theme)
        await settle()
        const ratio = contrastRatio(parseColor(getComputedStyle(hero).color), backdropOf(hero))
        // 3.0 es el suelo de AA para texto grande (2,6rem lo es de sobra).
        expect(ratio, `${theme}: ${ratio.toFixed(2)}`).toBeGreaterThanOrEqual(3)
        // Pero pasar el suelo no era la regla: el ámbar como *texto* va en
        // `--accent-ink`, que en papel baja a #C2440F. La barra de al lado sigue
        // en `--accent` — relleno y tinta se separan igual que en el resto de la app.
        expect(rgb(parseColor(getComputedStyle(hero).color)), theme).toEqual(
          rgb(token('--accent-ink')),
        )
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
      () =>
        expect(document.querySelectorAll('.food-result:not(.food-create)').length).toBe(
          HUEVOS.length,
        ),
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

  it('la pantalla rueda entera, y el último de treinta resultados se alcanza', async () => {
    await mountComida({ catalogue: HUEVOS })
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Añadir a desayuno' }))
    await user.type(screen.getByLabelText('Buscar alimento'), 'huevo')
    await vi.waitFor(
      () =>
        expect(document.querySelectorAll('.food-result:not(.food-create)').length).toBe(
          HUEVOS.length,
        ),
      { timeout: 5000 },
    )
    await settle()

    // Treinta filas no caben: el desbordamiento tiene que ser *scroll*, no
    // recorte. Sin esto la mitad del catálogo es inalcanzable.
    //
    // Lo que rueda ya no es la lista sino la columna entera. Con la hoja hacía
    // falta que la lista tuviera su propio recorrido, porque el campo de
    // búsqueda y los botones del pie estaban clavados dentro de un techo de
    // 88dvh; sin techo, la pantalla se comporta como una pantalla y buscar un
    // segundo término se resuelve subiendo, como en cualquier lista.
    const body = document.querySelector('.food-screen-body')
    expect(body.scrollHeight, 'la columna cabe entera, la prueba no mide nada').toBeGreaterThan(
      body.clientHeight,
    )

    body.scrollTop = body.scrollHeight
    await settle()
    expect(body.scrollTop, 'la columna no se desplaza').toBeGreaterThan(0)

    // Y al llegar abajo, el último resultado se ve de verdad.
    const rows = [...document.querySelectorAll('.food-result:not(.food-create)')]
    const last = paintedRect(rows[rows.length - 1])
    expect(last.bottom).toBeLessThanOrEqual(window.innerHeight + 0.5)
    expect(last.top).toBeGreaterThanOrEqual(0)
  })
})

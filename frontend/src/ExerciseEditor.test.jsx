import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ExerciseEditor } from './ExerciseEditor.jsx'

// El cuerpo mínimo que las dos pantallas pasan ahora: nada más que el nombre.
// El grupo, la nota y el borrado van por `more`, que es el segundo paso.
const editor = (props = {}) =>
  render(
    <ExerciseEditor
      name="Press banca"
      open
      onClose={() => {}}
      nameDraft="Press banca"
      onNameDraftChange={() => {}}
      onSubmitName={(e) => e.preventDefault()}
      {...props}
    />,
  )

describe('ExerciseEditor', () => {
  it('no pinta nada mientras está cerrado', () => {
    const { container } = editor({ open: false })
    expect(container).toBeEmptyDOMElement()
  })

  // No es modal y no lo finge. La caja rival —una hoja con velo— declaraba
  // `aria-modal="true"` sin nada que lo respaldase: ni `inert`, ni trampa de
  // foco. 29 de 35 controles seguían en el orden de tabulación detrás del velo.
  // Prometer modalidad y no cumplirla es peor que no prometerla.
  it('abierto, es un diálogo no modal colgado de un hueco sin flujo', () => {
    const { container } = editor()
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveClass('editor-inplace')
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(container.querySelector('.sheet-scrim')).toBeNull()
    expect(container.querySelector('.editor-inplace-slot')).toContainElement(dialog)
  })

  // El cambio de esta vuelta, y el que cierra la aritmética: el nombre se
  // imprimía dos veces —de titular en un `h2` y otra vez dentro del campo que
  // lo edita— y el titular costaba una fila de 53 px que el panel no tiene.
  // El título *es* el campo.
  it('el título del panel es el propio campo del nombre, no un rótulo aparte', () => {
    editor()
    const field = screen.getByLabelText('Nombre de Press banca')
    expect(field).toHaveValue('Press banca')
    expect(screen.queryByRole('heading', { name: 'Press banca' })).toBeNull()
    expect(screen.queryByText('Nombre')).toBeNull()
  })

  it('al abrir, el cursor cae al final del nombre sin seleccionarlo', () => {
    editor()
    const field = screen.getByLabelText('Nombre de Press banca')
    expect(document.activeElement).toBe(field)
    expect(field.selectionStart).toBe('Press banca'.length)
    expect(field.selectionEnd).toBe('Press banca'.length)
  })

  it('confirma el nombre con su botón y con Enter', async () => {
    const onSubmitName = vi.fn((e) => e.preventDefault())
    editor({ onSubmitName })
    await userEvent.click(screen.getByRole('button', { name: /guardar nombre/i }))
    expect(onSubmitName).toHaveBeenCalledTimes(1)
    await userEvent.type(screen.getByLabelText('Nombre de Press banca'), '{Enter}')
    expect(onSubmitName).toHaveBeenCalledTimes(2)
  })

  it('se cierra por el aspa y con Escape', async () => {
    const onClose = vi.fn()
    editor({ onClose })
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  // La queja del nombre repetido y la oferta de fusión no son un segundo paso:
  // son la respuesta a lo que acabas de intentar, así que viven pegadas al
  // campo, en el primer panel.
  it('la queja del nombre y la fusión salen junto al campo, sin abrir nada', () => {
    editor({
      nameError: 'Ya existe Press de banca',
      nameExtra: <button type="button">Fusionar con Press de banca</button>,
      more: <p>ajustes</p>,
    })
    const form = screen.getByLabelText('Nombre de Press banca').closest('form')
    expect(within(form).getByRole('alert')).toHaveTextContent('Ya existe Press de banca')
    expect(within(form).getByRole('button', { name: /fusionar/i })).toBeInTheDocument()
    expect(screen.queryByText('ajustes')).toBeNull()
  })
})

// ── El segundo paso ───────────────────────────────────────────────────────
// El panel medía 294 px en una tarjeta que sólo puede darle 137, y era así
// porque llevaba cuatro trabajos sin relación en la caja que abres para
// corregir una errata. El grupo muscular y el borrado no son lo que vienes a
// hacer; siguen estando, un toque más lejos y con su nombre escrito en la
// puerta.
describe('ExerciseEditor: Más ajustes', () => {
  const withMore = (props = {}) =>
    editor({
      more: (
        <>
          <label htmlFor="g">Grupo</label>
          <select id="g" defaultValue="Pecho">
            <option>Pecho</option>
          </select>
          <button type="button">Eliminar ejercicio</button>
        </>
      ),
      ...props,
    })

  it('empieza cerrado: el panel abierto es sólo el nombre y su confirmación', () => {
    withMore()
    expect(screen.queryByLabelText('Grupo')).toBeNull()
    expect(screen.queryByRole('button', { name: /eliminar ejercicio/i })).toBeNull()
    expect(screen.getByRole('button', { name: /^Más ajustes/ })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
  })

  it('un toque lo abre, otro lo cierra', async () => {
    withMore()
    const more = screen.getByRole('button', { name: /^Más ajustes/ })
    await userEvent.click(more)
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByLabelText('Grupo')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /eliminar ejercicio/i })).toBeInTheDocument()
    await userEvent.click(more)
    expect(screen.queryByLabelText('Grupo')).toBeNull()
  })

  // El nombre accesible empieza por la etiqueta visible entera —el control por
  // voz necesita acertar con «pulsa Más ajustes»— y lleva el ejercicio detrás
  // porque en un superset hay varias tarjetas abiertas a la vez.
  it('lo dice entero para quien no lo ve', () => {
    withMore()
    expect(screen.getByRole('button', { name: 'Más ajustes de Press banca' })).toBeInTheDocument()
  })

  it('sin nada detrás, no hay puerta que abrir', () => {
    editor()
    expect(screen.queryByRole('button', { name: /más ajustes/i })).toBeNull()
  })

  // Cerrar y volver a abrir es empezar de nuevo: si el segundo panel se
  // quedase abierto, el editor volvería a nacer con 294 px la segunda vez.
  it('cerrar el editor lo deja recogido para la próxima', async () => {
    function Harness() {
      const [open, setOpen] = React.useState(true)
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Editar ejercicio Press banca
          </button>
          <ExerciseEditor
            name="Press banca"
            open={open}
            onClose={() => setOpen(false)}
            nameDraft="Press banca"
            onNameDraftChange={() => {}}
            onSubmitName={(e) => e.preventDefault()}
            more={<p>ajustes del ejercicio</p>}
          />
        </>
      )
    }
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /^Más ajustes/ }))
    expect(screen.getByText('ajustes del ejercicio')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
    expect(screen.queryByText('ajustes del ejercicio')).toBeNull()
  })
})

// ── Volver de donde viniste ───────────────────────────────────────────────
// Al cerrar, el foco tiene que volver al botón que abrió esto. Si se queda en
// `body`, quien navega con teclado o con lector vuelve al principio de la
// página cada vez que corrige una letra.
describe('ExerciseEditor: el foco al cerrar', () => {
  function Harness() {
    const [open, setOpen] = React.useState(false)
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          Editar ejercicio Press banca
        </button>
        <ExerciseEditor
          name="Press banca"
          open={open}
          onClose={() => setOpen(false)}
          nameDraft="Press banca"
          onNameDraftChange={() => {}}
          onSubmitName={(e) => e.preventDefault()}
        />
      </>
    )
  }

  it('vuelve al disparador que lo abrió', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: /editar ejercicio/i })
    await userEvent.click(trigger)
    expect(document.activeElement).toBe(screen.getByLabelText('Nombre de Press banca'))
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(document.activeElement).toBe(trigger)
  })

  // El gesto de atrás de Android. Sin esto, «atrás» con el editor abierto se
  // lleva por delante la sesión entera: sales del entreno para cerrar un
  // cuadro de diálogo.
  it('el gesto de atrás lo cierra en vez de salirse del entreno', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate'))
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})

// ── Que el panel quepa, sin mover nada y sin tapar lo que no es suyo ──────
// Todo esto se midió en el navegador, no en jsdom, y por eso va aquí con la
// maquetación fingida a mano: jsdom no tiene cajas, así que se le dan.
describe('ExerciseEditor: dónde cae el panel', () => {
  const rect = (t, b) => ({
    top: t,
    bottom: b,
    left: 36,
    right: 394,
    width: 358,
    height: b - t,
    x: 36,
    y: t,
    toJSON() {},
  })

  function fakeLayout({
    slotTop,
    panelHeight,
    navTop,
    triggerTop = slotTop - 56,
    cardTop = 100,
    cardBottom = navTop + 500,
  }) {
    const state = { panelHeight }
    const origRect = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function fake() {
      const cl = this.classList
      if (cl?.contains('editor-inplace-slot')) return rect(slotTop, slotTop)
      if (cl?.contains('editor-inplace')) {
        const top = slotTop + (parseFloat(this.style.top) || 0)
        return rect(top, top + state.panelHeight)
      }
      if (cl?.contains('exercise-edit')) return rect(triggerTop, triggerTop + 44)
      if (cl?.contains('card')) return rect(cardTop, cardBottom)
      if (cl?.contains('bottom-nav')) return rect(navTop, navTop + 57)
      if (cl?.contains('under-panel')) return rect(slotTop + 10, slotTop + 54)
      if (cl?.contains('far-below')) return rect(navTop - 20, navTop)
      return origRect.call(this)
    }
    const origHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return this.classList?.contains('editor-inplace') ? state.panelHeight : 0
      },
    })
    const teardown = () => {
      Element.prototype.getBoundingClientRect = origRect
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', origHeight)
    }
    // Para las pruebas en las que el panel crece por dentro sin que su caja se
    // entere, que es justo el caso que el `ResizeObserver` no ve.
    teardown.grow = (h) => {
      state.panelHeight = h
    }
    return teardown
  }

  let restore = () => {}
  let nav = null
  beforeEach(() => {
    window.innerHeight = 932
    nav = document.createElement('div')
    nav.className = 'bottom-nav'
    document.body.appendChild(nav)
  })
  afterEach(() => {
    restore()
    nav?.remove()
    nav = null
  })

  function Card({ open = true, onClose = () => {} }) {
    return (
      <div className="card">
        <button type="button" className="exercise-edit">
          Editar ejercicio Press banca
        </button>
        <ExerciseEditor
          name="Press banca"
          open={open}
          onClose={onClose}
          nameDraft="Press banca"
          onNameDraftChange={() => {}}
          onSubmitName={(e) => e.preventDefault()}
        />
        <button type="button" className="under-panel">
          Registrar serie
        </button>
        <button type="button" className="far-below">
          Editar serie 1
        </button>
      </div>
    )
  }

  const open = (props) => {
    render(<Card {...props} />)
    return {
      slot: document.querySelector('.editor-inplace-slot'),
      panel: document.querySelector('.editor-inplace'),
    }
  }

  it('el hueco nunca toma altura: la columna de contenido no se mueve', () => {
    restore = fakeLayout({ slotTop: 765, panelHeight: 123, navTop: 875 })
    const { slot } = open()
    expect(slot.style.height).toBe('0px')
  })

  it('si cabe, no sube nada', () => {
    // 875 − 765 = 110 px de sitio. Un panel de 110 cabe justo.
    restore = fakeLayout({ slotTop: 765, panelHeight: 110, navTop: 875 })
    const { panel } = open()
    expect(panel.style.top).toBe('0px')
  })

  // El defecto que el crítico llamó cosmético y que no lo es: tapar a medias el
  // botón que acabas de pulsar. Medido en Entreno, el panel subía 21 px y se
  // comía los 9 últimos de un objetivo de 44 — un control cortado por una
  // superficie opaca no se lee como tapado, se lee como roto. Si con no tocarlo
  // basta, no se le toca.
  it('no cruza el borde inferior del disparador si no hace falta', () => {
    // Disparador en 709–753, hueco en 765: 12 px de margen. Al panel le faltan
    // 8 para caber sobre la barra, y 8 caben en 12.
    restore = fakeLayout({
      slotTop: 765,
      panelHeight: 118,
      navTop: 875,
      triggerTop: 709,
      cardBottom: 1400,
    })
    const { panel } = open()
    expect(panel.style.top).toBe('-8px')
  })

  // Y la otra mitad de la misma regla: cuando 12 px no bastan, no se sube 20
  // —eso deja el disparador partido por la mitad— sino los 56 que lo tapan
  // entero. O la puerta sigue ahí, o la puerta es la habitación.
  it('nunca deja el disparador tapado a medias', () => {
    restore = fakeLayout({
      slotTop: 765,
      panelHeight: 130,
      navTop: 875,
      triggerTop: 709,
      cardBottom: 1400,
    })
    const { panel } = open()
    expect(panel.style.top).toBe('-56px')
  })

  // El teclado, que es donde el tope duro de la versión anterior se rompió.
  // Medido en Entreno con el viewport a 430×602 (un IME de ~330 px): hueco en
  // 549, disparador en 493–537 y la barra de pestañas subida a 545. Parando en
  // el canto del disparador el panel se quedaba con 8 px de alto y
  // `Guardar nombre` caía en y606, fuera de la pantalla. Sube 134.
  it('con el teclado delante sube lo que haga falta, no lo que cabe', () => {
    window.innerHeight = 602
    restore = fakeLayout({
      slotTop: 549,
      panelHeight: 130,
      navTop: 545,
      triggerTop: 493,
      cardTop: 367,
      cardBottom: 943,
    })
    const { panel } = open()
    expect(panel.style.top).toBe('-134px')
    expect(panel.style.maxHeight).toBe('130px')
  })

  // Y la excepción, que es aritmética y no opinión: en Progreso el disparador
  // es el último hijo de la tarjeta (acaba en 784) y `Exportar CSV` —de otra
  // tarjeta— empieza en 800. Un panel de 130 px no cabe ni en los 62 px que
  // hay sobre el disparador ni en los 47 de debajo, así que o cruza la puerta
  // por la que entró o entierra un control ajeno. Cruza la puerta.
  it('sí lo cruza cuando quedarse ahí sacaría el panel de su tarjeta', () => {
    restore = fakeLayout({
      slotTop: 765,
      panelHeight: 130,
      navTop: 875,
      triggerTop: 709,
      cardTop: 258,
      cardBottom: 784,
    })
    const { panel } = open()
    // 784 − 765 = 19 px dentro de la tarjeta para 130 de panel: sube 111 y
    // acaba clavado en el pie de la tarjeta.
    expect(panel.style.top).toBe('-111px')
    expect(panel.style.maxHeight).toBe('130px')
  })

  // El recorte que sólo se ve en pantalla. Si la tarjeta ya obliga a cruzar el
  // disparador, quedarse a medio camino no salva la puerta —ya está cruzada— y
  // encima corta el panel. Medido en Progreso con la página a 735: el hueco cae
  // en 887, la tarjeta acaba en 906 y la barra de pestañas empieza en 875, así
  // que subiendo 111 el panel acababa en 875 con 31 px fuera y los 11 últimos
  // de `Guardar nombre` cortados contra la barra. Hay que subir 142.
  it('sube del todo cuando de todas formas va a cruzar el disparador', () => {
    restore = fakeLayout({
      slotTop: 887,
      panelHeight: 130,
      navTop: 875,
      triggerTop: 831,
      cardTop: 300,
      cardBottom: 906,
    })
    const { panel } = open()
    expect(panel.style.top).toBe('-142px')
    expect(panel.style.maxHeight).toBe('130px')
  })

  // El otro extremo del mismo cálculo. Si la tarjeta entera está fuera de
  // pantalla —la página se ha movido debajo de un editor ya abierto, o algo ha
  // redimensionado— no hay nada que mantener a la vista, y medir contra el
  // borde útil de todas formas arranca el panel de su tarjeta: sale flotando en
  // mitad del viewport, encima de contenido que no es suyo, o con 0 px de alto.
  // Fuera de pantalla manda la tarjeta y sólo la tarjeta.
  it('con la tarjeta fuera de pantalla el panel no se despega de ella', () => {
    restore = fakeLayout({
      slotTop: 1622,
      panelHeight: 130,
      navTop: 875,
      triggerTop: 1566,
      cardTop: 1115,
      cardBottom: 1641,
    })
    const { panel } = open()
    expect(panel.style.top).toBe('-111px')
    expect(panel.style.maxHeight).toBe('130px')
  })

  it('sube lo justo para no quedarse debajo de la barra de pestañas', () => {
    restore = fakeLayout({
      slotTop: 600,
      panelHeight: 200,
      navTop: 700,
      triggerTop: 400,
      cardBottom: 1200,
    })
    const { panel } = open()
    // 700 − 600 = 100 px de sitio para 200 de panel: le faltan 100, y el
    // disparador (444) le deja subir 156, así que sube los 100 enteros.
    expect(panel.style.top).toBe('-100px')
  })

  // El aviso de nombre repetido y la oferta de fusión aparecen *dentro* del
  // panel después de abrirlo. Medido en Progreso: 103 px de contenido nuevo en
  // un panel que ya lleva puesto un tope de altura — y con el tope puesto su
  // caja no cambia de tamaño, así que un `ResizeObserver` colgado del panel no
  // se entera de nada y el aviso se queda debajo del corte, invisible. Hay que
  // vigilar el cuerpo, no la caja.
  it('un aviso que crece dentro del panel lo vuelve a colocar', () => {
    const observed = new Set()
    let notify = null
    class FakeResizeObserver {
      constructor(fn) {
        notify = fn
      }
      observe(el) {
        observed.add(el)
      }
      disconnect() {
        observed.clear()
      }
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
    try {
      restore = fakeLayout({
        slotTop: 765,
        panelHeight: 130,
        navTop: 875,
        triggerTop: 709,
        cardTop: 258,
        cardBottom: 784,
      })
      const { panel } = open()
      expect(panel.style.top).toBe('-111px')
      expect(observed.has(panel.querySelector('form'))).toBe(true)
      restore.grow(233)
      act(() => notify([]))
      expect(panel.style.top).toBe('-214px')
      expect(panel.style.maxHeight).toBe('233px')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // Lo que el panel tapa deja de existir para el foco. No es modalidad —el
  // resto de la pantalla sigue viva— sino la regla mínima: no se puede tabular
  // hasta un botón que no se ve y no se puede pulsar.
  it('lo que tapa sale del orden de tabulación, y vuelve al cerrar', () => {
    restore = fakeLayout({ slotTop: 765, panelHeight: 60, navTop: 875 })
    open()
    expect(document.querySelector('.under-panel')).toHaveAttribute('inert')
    expect(document.querySelector('.far-below')).not.toHaveAttribute('inert')
  })

  it('al cerrarse devuelve al orden de tabulación lo que había tapado', async () => {
    restore = fakeLayout({ slotTop: 765, panelHeight: 60, navTop: 875 })
    function Harness() {
      const [isOpen, setOpen] = React.useState(true)
      return <Card open={isOpen} onClose={() => setOpen(false)} />
    }
    render(<Harness />)
    expect(document.querySelector('.under-panel')).toHaveAttribute('inert')
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(document.querySelector('.under-panel')).not.toHaveAttribute('inert')
  })
})

import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ExerciseEditor } from './ExerciseEditor.jsx'

// El cuerpo mínimo que las dos pantallas pasan ahora: nada más que el nombre.
// El grupo, la nota y el borrado van por `more`, que es el segundo paso.
const base = {
  name: 'Press banca',
  open: true,
  onClose: () => {},
  nameDraft: 'Press banca',
  onNameDraftChange: () => {},
  onSubmitName: (e) => e.preventDefault(),
}
const editor = (props = {}) => render(<ExerciseEditor {...base} {...props} />)

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

  // Aquí no hay botón de guardar. Ni uno: el campo se manda con Intro, que es
  // la tecla que el propio teclado del móvil está ofreciendo, y por las salidas
  // del panel. Un botón cuya etiqueta tiene que cambiar para no mentir —el
  // `Guardar`/`Borrar` de la nota— es la confesión de que el control no
  // representaba un acto, sino «manda el campo».
  it('no hay ningún botón de guardar, y el nombre se confirma con Enter', async () => {
    const onSubmitName = vi.fn((e) => e.preventDefault())
    editor({ onSubmitName })
    expect(screen.queryByRole('button', { name: /guardar/i })).toBeNull()
    await userEvent.type(screen.getByLabelText('Nombre de Press banca'), '{Enter}')
    expect(onSubmitName).toHaveBeenCalledTimes(1)
  })

  // Las cuatro puertas valen lo mismo: guardan y cierran. Si tocar fuera
  // descartase y el aspa guardase, el resultado de un gesto dependería de dónde
  // aterrizó el pulgar — y sin botón que pulsar no queda ninguna forma de decir
  // «he escrito esto pero no cuenta».
  it('se cierra por el aspa y con Escape, y las dos guardan antes', async () => {
    const onClose = vi.fn()
    const onCommit = vi.fn()
    editor({ onClose, onCommit })
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onCommit).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  // Cambiar de paso retira de la pantalla el campo que estabas mirando, así que
  // cuenta como dejar de mirarlo. Sin esto, la única forma de perder un
  // renombrado escrito sería la que más se parece a seguir dentro del editor.
  it('guarda al entrar en el cajón y al volver', async () => {
    const onCommit = vi.fn()
    editor({ onCommit, more: <p>ajustes</p>, moreLabel: 'Grupo y nota' })
    await userEvent.click(screen.getByRole('button', { name: /^Grupo y nota/ }))
    expect(onCommit).toHaveBeenCalledTimes(1)
    await userEvent.click(screen.getByRole('button', { name: /volver al nombre/i }))
    expect(onCommit).toHaveBeenCalledTimes(2)
  })

  // La queja del nombre vivía aquí dentro, pegada al campo. Ya no: el
  // renombrado se manda también al salir, así que en las cuatro salidas la
  // respuesta llega cuando este componente ya no está montado y el aviso no
  // llegaba a decir nada. Sube a la tarjeta, que sobrevive. Ver
  // `EditTrouble.jsx`.
  it('no se queda con ninguna superficie donde decir que algo falló', () => {
    editor({ more: <p>ajustes</p> })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  // ── La quinta salida ─────────────────────────────────────────────────────
  // Bloquear la pantalla o cambiar de app es, en un móvil, la forma más normal
  // de dejar el editor a medias — y era la única que no guardaba. Recargar
  // tampoco. `beforeunload` no vale: no se dispara cuando el sistema descarta
  // una pestaña, que es justo el caso.
  it('manda lo escrito cuando el móvil se va a otra cosa', () => {
    const onCommit = vi.fn()
    editor({ onCommit })

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'hidden',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onCommit).toHaveBeenCalledTimes(1)

    // Y volver no manda nada: sólo irse cuenta como dejar de mirar el campo.
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => 'visible',
    })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(onCommit).toHaveBeenCalledTimes(1)
  })

  it('manda lo escrito cuando la página se descarga', () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()
    editor({ onCommit, onClose })

    window.dispatchEvent(new Event('pagehide'))

    expect(onCommit).toHaveBeenCalledTimes(1)
    // No cierra: si vuelves, vuelves a lo que estabas mirando.
    expect(onClose).not.toHaveBeenCalled()
  })

  // Pero el aviso se pinta *fuera* del panel, y el panel se cierra al tocar
  // fuera. Un toque en `Fusionar` no es irse a otra cosa: es la respuesta a lo
  // que este panel acaba de mandar.
  it('no se cierra al tocar la respuesta a lo que acaba de mandar', async () => {
    const onClose = vi.fn()
    const onCommit = vi.fn()
    render(
      <>
        <div data-editor-answer>
          <button type="button">Fusionar</button>
        </div>
        <ExerciseEditor {...base} onClose={onClose} onCommit={onCommit} />
      </>,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Fusionar' }))

    expect(onClose).not.toHaveBeenCalled()
    expect(onCommit).not.toHaveBeenCalled()
  })
})

// ── El segundo paso ───────────────────────────────────────────────────────
// El panel medía 294 px en una tarjeta que sólo puede darle 137, y era así
// porque llevaba cuatro trabajos sin relación en la caja que abres para
// corregir una errata. El grupo muscular y el borrado no son lo que vienes a
// hacer; siguen estando, un toque más lejos y con su nombre escrito en la
// puerta.
describe('ExerciseEditor: el segundo paso', () => {
  const withMore = (props = {}) =>
    editor({
      more: (
        <>
          <label htmlFor="g">Grupo muscular</label>
          <select id="g" defaultValue="Pecho">
            <option>Pecho</option>
          </select>
          <button type="button">Eliminar ejercicio</button>
        </>
      ),
      moreLabel: 'Grupo y eliminar',
      ...props,
    })

  it('empieza cerrado: el panel abierto es sólo el nombre y su confirmación', () => {
    withMore()
    expect(screen.queryByLabelText('Grupo muscular')).toBeNull()
    expect(screen.queryByRole('button', { name: /eliminar ejercicio/i })).toBeNull()
    // Sin `aria-expanded`: la puerta ya no despliega nada debajo, cambia el
    // panel de paso — y anunciarse «desplegada» mientras ni siquiera está en
    // pantalla es la clase de mentira que este panel lleva tres vueltas
    // quitando.
    expect(screen.getByRole('button', { name: /^Grupo y eliminar/ })).not.toHaveAttribute(
      'aria-expanded',
    )
  })

  // El cambio de esta vuelta. El segundo paso era un pliegue que se abría
  // *debajo* del primero: medido en Entreno, el panel pasaba de 130 a 314 px
  // (+141 %) y tapaba enteros los nueve controles del aparato de la serie; en
  // Progreso, el 100 % de la gráfica. Un cajón de acciones raras no crece 184
  // px sobre los controles de la serie que estás entre medias de registrar
  // (DESIGN.md: «gana la de la serie, siempre»). Ahora sustituye.
  it('el segundo paso sustituye al primero en vez de crecer debajo', async () => {
    withMore()
    expect(screen.getByLabelText('Nombre de Press banca')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^Grupo y eliminar/ }))
    expect(screen.getByLabelText('Grupo muscular')).toBeInTheDocument()
    // Ni el campo del nombre, ni su confirmación, ni la propia puerta: el panel
    // entero es el segundo paso mientras dura.
    expect(screen.queryByLabelText('Nombre de Press banca')).toBeNull()
    expect(screen.queryByRole('button', { name: /guardar nombre/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /^Grupo y eliminar/ })).toBeNull()
  })

  // La vuelta lleva el nombre escrito porque el campo que lo decía no está a la
  // vista: alguien tiene que decir en qué ejercicio estás.
  it('la vuelta devuelve al nombre y dice de quién es', async () => {
    withMore()
    await userEvent.click(screen.getByRole('button', { name: /^Grupo y eliminar/ }))
    const back = screen.getByRole('button', { name: 'Volver al nombre de Press banca' })
    expect(back).toHaveTextContent('Press banca')
    // Navegar sin llevarse el foco deja el cursor en un control desmontado.
    expect(document.activeElement).toBe(back)
    await userEvent.click(back)
    expect(screen.getByLabelText('Nombre de Press banca')).toBeInTheDocument()
    expect(screen.queryByLabelText('Grupo muscular')).toBeNull()
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: /^Grupo y eliminar/ }),
    )
  })

  // El aspa está en los dos pasos: el pulgar la buscó una vez en el primero y
  // no puede desaparecer al entrar en el segundo.
  it('el aspa cierra también desde el segundo paso', async () => {
    const onClose = vi.fn()
    withMore({ onClose })
    await userEvent.click(screen.getByRole('button', { name: /^Grupo y eliminar/ }))
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalled()
  })

  // El nombre accesible empieza por la etiqueta visible entera —el control por
  // voz necesita acertar con «pulsa Grupo y eliminar»— y lleva el ejercicio detrás
  // porque en un superset hay varias tarjetas abiertas a la vez.
  it('lo dice entero para quien no lo ve', () => {
    withMore()
    expect(screen.getByRole('button', { name: 'Grupo y eliminar de Press banca' })).toBeInTheDocument()
  })

  it('sin nada detrás, no hay puerta que abrir', () => {
    editor()
    expect(screen.queryByRole('button', { name: /grupo y/i })).toBeNull()
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
            moreLabel="Grupo y nota"
          />
        </>
      )
    }
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: /^Grupo y nota/ }))
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

  // ── Las cuatro puertas devuelven el foco al mismo sitio ──────────────────
  // Las cuatro salidas guardan igual, y por la misma razón tienen que aterrizar
  // igual: si el aspa devolviera el foco al disparador y Escape lo dejara en
  // `body`, el resultado de un gesto dependería de con qué lo hiciste. Estaba
  // probado sólo por el aspa, que es la única de las cuatro que ya lo tenía
  // encima.
  const EXITS = {
    aspa: async () => userEvent.click(screen.getByRole('button', { name: /cerrar/i })),
    Escape: async () => userEvent.keyboard('{Escape}'),
    atrás: async () => {
      await act(async () => {
        window.dispatchEvent(new PopStateEvent('popstate'))
      })
    },
    fuera: async () => {
      await act(async () => {
        // jsdom no trae `PointerEvent`; el listener sólo lee `target`.
        document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      })
    },
  }

  for (const [route, leave] of Object.entries(EXITS)) {
    it(`vuelve al disparador que lo abrió · por ${route}`, async () => {
      render(<Harness />)
      const trigger = screen.getByRole('button', { name: /editar ejercicio/i })
      await userEvent.click(trigger)
      expect(document.activeElement).toBe(screen.getByLabelText('Nombre de Press banca'))

      await leave()

      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
      expect(document.activeElement).toBe(trigger)
    })
  }

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
    // El alto de verdad del panel, con decimales. Por defecto el mismo que
    // `offsetHeight`, porque casi todas estas pruebas no van de eso; las que sí
    // lo separan reproducen el medio píxel que `offsetHeight` se come.
    panelRectHeight = panelHeight,
    triggerTop = slotTop - 56,
    cardTop = 100,
    cardBottom = navTop + 500,
    underTop = slotTop + 10,
    underHeight = 44,
    sliverTop = null,
    sliverHeight = 10,
    titleTop = 0,
    // Lo que el panel no puede tapar, marcado por quien llama: en Entreno el
    // formulario de registro y la lista de series, en Progreso la gráfica.
    protectTop = null,
    protectHeight = 100,
    farBelowTop = navTop - 20,
  }) {
    // `shift` finge el desplazamiento de la página: todo lo que vive en el
    // documento baja, y la barra fija se queda donde está. Es la única
    // diferencia que produce un scroll, y es la que el panel tiene que ver.
    const state = { panelHeight, panelRectHeight, shift: 0 }
    const origRect = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function fake() {
      const cl = this.classList
      const d = state.shift
      if (cl?.contains('editor-inplace-slot')) return rect(slotTop + d, slotTop + d)
      if (cl?.contains('editor-inplace')) {
        const top = slotTop + d + (parseFloat(this.style.top) || 0)
        return rect(top, top + state.panelRectHeight)
      }
      if (cl?.contains('exercise-edit')) return rect(triggerTop + d, triggerTop + d + 44)
      if (cl?.contains('card')) return rect(cardTop + d, cardBottom + d)
      if (cl?.contains('bottom-nav')) return rect(navTop, navTop + 57)
      if (cl?.contains('under-panel')) return rect(underTop + d, underTop + d + underHeight)
      if (cl?.contains('sliver')) {
        return sliverTop === null
          ? rect(-999, -999)
          : rect(sliverTop + d, sliverTop + d + sliverHeight)
      }
      if (cl?.contains('protect-zone')) {
        return protectTop === null
          ? rect(-999, -999)
          : rect(protectTop + d, protectTop + d + protectHeight)
      }
      if (cl?.contains('far-below')) {
        return farBelowTop <= -999
          ? rect(-999, -999)
          : rect(farBelowTop + d, farBelowTop + d + 20)
      }
      if (cl?.contains('exercise-title')) return rect(titleTop + d, titleTop + d + 44)
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
      state.panelRectHeight = h
    }
    // Y para las que mueven la página debajo de un editor abierto.
    teardown.scrollTo = (d) => {
      state.shift = d
      window.dispatchEvent(new Event('scroll'))
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
        <h2 className="exercise-title">Press banca</h2>
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
        <button type="button" className="sliver">
          Pecho
        </button>
        <div className="protect-zone" data-editor-protect />
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

  // ── Y la misma regla para todo lo demás que el canto cruza ───────────────
  // La regla del disparador («o no se toca, o se tapa entero») valía sólo para
  // el hermano de justo antes del hueco, y el defecto gordo de esta vuelta
  // estaba en el otro canto. Medido en Entreno a 430×932 con la página a 200:
  // el hueco cae en 348,8, el panel mide 130 y su canto de abajo aterriza en
  // 478,8 — dentro de la fila de peso y reps, que va de 464,3 a 516,3. Seis
  // controles vivos partidos a 14,5 de 52 (el 27 %), con los rótulos
  // `Peso · kg` y `Reps` comidos, y sin que el usuario haya hecho nada: es lo
  // que hace abrir el editor, por defecto, en la pantalla que usas entre
  // series.
  it('el canto de abajo no parte la fila de peso y reps', () => {
    restore = fakeLayout({
      slotTop: 349,
      panelHeight: 130,
      navTop: 875,
      triggerTop: 293,
      cardTop: 167,
      cardBottom: 743,
      underTop: 464,
      underHeight: 52,
    })
    const { panel } = open()
    // Sin subir, el canto cae en 479 y parte la fila. Subiendo los 15 que la
    // libran, el canto de *arriba* cae en 334 y parte el disparador (293–337),
    // así que se sube hasta taparlo entero: 56. El canto de abajo acaba en
    // 423, en el aire que hay entre el registro y la fila.
    expect(panel.style.top).toBe('-56px')
    expect(document.querySelector('.under-panel')).not.toHaveAttribute('inert')
  })

  it('si el canto de abajo cae en el aire, no sube nada', () => {
    restore = fakeLayout({
      slotTop: 349,
      panelHeight: 100,
      navTop: 875,
      triggerTop: 293,
      cardTop: 167,
      cardBottom: 743,
      underTop: 464,
      underHeight: 52,
    })
    const { panel } = open()
    expect(panel.style.top).toBe('0px')
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
    // 784 − 765 = 19 px dentro de la tarjeta para 130 de panel: hacen falta
    // 111 para que el panel entero esté a la vista. Pero con 111 el canto de
    // abajo cae en 784 y `Registrar serie` empieza en 775, así que lo partiría
    // por la mitad: 9 px más y el canto para justo en su techo.
    expect(panel.style.top).toBe('-120px')
    expect(panel.style.maxHeight).toBe('139px')
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

  // El otro extremo del mismo cálculo. Si la tarjeta entera se ha ido por
  // debajo del borde útil —la página se ha movido debajo de un editor ya
  // abierto— el panel se va con ella: no sube nada. Quedarse pegado arriba lo
  // dejaría flotando a media pantalla sobre contenido que no es suyo, sin
  // tarjeta debajo que explique de qué es.
  it('con la tarjeta fuera de pantalla el panel se va con ella', () => {
    restore = fakeLayout({
      slotTop: 1622,
      panelHeight: 130,
      navTop: 875,
      triggerTop: 1566,
      cardTop: 1115,
      cardBottom: 1641,
    })
    const { panel } = open()
    expect(panel.style.top).toBe('0px')
  })

  // ── El defecto medido de esta vuelta ────────────────────────────────────
  // El borde útil se caía de la cuenta en cuanto el *disparador* se metía
  // detrás de la barra de pestañas, y entonces el pie del panel se medía sólo
  // contra la tarjeta, que baja más. Medido en Progreso a 430×932: abriendo con
  // la página en 735 el panel acababa en 874,9 contra una barra en 875 —0,1 px
  // de holgura, calculada a propósito— y **subiendo 60 px la página**, un
  // gesto, acababa en 965,5: 90 px suyos detrás de una barra que está a
  // `z-index: 10` contra su 3, que no es `inert` y que navega a Días. El
  // `select` del grupo quedaba con 11,9 de sus 44 px debajo; tocar ahí no era
  // tocar en el vacío, era tirar el renombrado sin guardar. Pérdida de datos,
  // no defecto visual.
  //
  // Mientras quede tarjeta a la vista, el borde útil no se negocia.
  it('el pie del panel no se mete debajo de la barra al desplazar la página', async () => {
    restore = fakeLayout({
      slotTop: 874.9,
      panelHeight: 130,
      panelRectHeight: 130,
      navTop: 875,
      triggerTop: 830.9,
      cardTop: 500,
      cardBottom: 890.9,
      farBelowTop: -999,
    })
    const { panel } = open()
    expect(panel.style.top).toBe('-130px')

    // La página sube 60 px: todo lo del documento baja, la barra no.
    await act(async () => {
      restore.scrollTo(60)
    })
    // 934,9 − 875 = 59,9 de hueco por debajo del borde útil, más los 130 del
    // panel: 190 de subida para volver a acabar clavado en la barra.
    await waitFor(() => expect(panel.style.top).toBe('-190px'))
    expect(panel.style.maxHeight).toBe('130px')
  })

  // ── Lo protegido no se tapa, no sólo no se parte ────────────────────────
  // Hasta ahora el panel sólo se prohibía *partir* controles, y partir no era
  // lo que hacía daño: con el segundo paso abierto en Entreno el canto de abajo
  // aterrizaba limpiamente en el hueco entre dos series y el panel se comía
  // enteros —sin cortar ninguno— los seis controles de peso y reps, `Registrar
  // serie`, `Repetir serie` y `Editar serie 1`.
  it('no se posa sobre lo que quien llama ha marcado como intocable', () => {
    restore = fakeLayout({
      slotTop: 400,
      panelHeight: 164,
      navTop: 875,
      triggerTop: 344,
      cardTop: 200,
      cardBottom: 800,
      underTop: -999,
      farBelowTop: -999,
      protectTop: 500,
      protectHeight: 200,
    })
    const { panel } = open()
    // El panel colgado del hueco acabaría en 564, o sea 64 px dentro del
    // aparato de la serie sin partir nada porque nada empieza ahí. Sube los 64.
    expect(panel.style.top).toBe('-64px')
    expect(panel.style.maxHeight).toBe('164px')
  })

  // Y por el otro lado: la gráfica de Progreso está *encima* del disparador, así
  // que ahí no se esquiva bajando el pie sino no subiendo tanto.
  it('tampoco sube por encima de lo protegido, si cabe debajo', () => {
    restore = fakeLayout({
      slotTop: 874.9,
      panelHeight: 200,
      navTop: 875,
      triggerTop: 830.9,
      cardTop: 400,
      cardBottom: 890.9,
      underTop: -999,
      farBelowTop: -999,
      protectTop: 447,
      protectHeight: 200,
    })
    const { panel } = open()
    // Entre el pie de la gráfica (647) y la barra (875) hay 227,9 px y el panel
    // pide 200: cabe, así que sube los 200 justos y se queda a 27,9 de la
    // gráfica sin tocarla.
    expect(panel.style.top).toBe('-200px')
    expect(panel.style.maxHeight).toBe('200px')
  })

  // Cuando entre el pie de lo protegido y la barra no cabe el panel, la salida
  // no es posarse encima: es ponerse **por encima del bloque entero**. Es la
  // tercera posición, y faltaba. Medido en Progreso a 430×932 con el cajón
  // abierto, la regla anterior —soltar los dos topes y dejar caer el panel
  // donde cupiera— tapaba la gráfica al 100 % en un tramo de 25 px de scroll,
  // por encima del 90 % en 50 y por encima del 50 % en 145.
  //
  // Y ahí la gráfica no es decoración: la tercera fila de ese cajón es
  // `Eliminar ejercicio` y, con el campo del nombre tapado por el propio
  // panel, la gráfica es lo único en pantalla que dice **qué ejercicio** vas a
  // borrar. Cuando el panel ya ha abandonado su hueco —el disparador está
  // detrás de la barra de pestañas— da igual por qué lado del bloque flote, y
  // por arriba no tapa nada.
  it('cuando no cabe debajo de lo protegido, se va entero por encima', () => {
    restore = fakeLayout({
      slotTop: 874.9,
      panelHeight: 300,
      navTop: 875,
      triggerTop: 830.9,
      cardTop: 400,
      cardBottom: 890.9,
      underTop: -999,
      farBelowTop: -999,
      protectTop: 447,
      protectHeight: 200,
    })
    const { panel } = open()
    // 300 no caben en los 227,9 que hay entre el pie de la gráfica (647) y la
    // barra (875). Encima sí: del aire de arriba (8) al techo de la gráfica
    // (447) hay 439. El pie del panel se posa en 447 y la gráfica queda
    // limpia: 874,9 − 447 + 300 = 727,9 de subida.
    expect(panel.style.top).toBe('-728px')
    expect(panel.style.maxHeight).toBe('300px')
  })

  // Y el límite de esa tercera posición, que es lo que la hace honesta: sólo
  // se toma si el panel entero cabe encima. Si el bloque protegido ya asoma
  // por el canto de arriba no hay sitio, y entonces manda la cuenta de siempre
  // —subir lo mínimo para verse entero— y se posan encima los que sobren. Un
  // control que no se ve sigue siendo peor defecto que unos píxeles de gráfica
  // tapados.
  it('si tampoco cabe encima, sube lo mínimo y se posa lo que sobre', () => {
    restore = fakeLayout({
      slotTop: 874.9,
      panelHeight: 300,
      navTop: 875,
      triggerTop: 830.9,
      cardTop: 400,
      cardBottom: 890.9,
      underTop: -999,
      farBelowTop: -999,
      // La gráfica empieza en 100: encima sólo quedan 92 px para un panel de
      // 300.
      protectTop: 100,
      protectHeight: 200,
    })
    const { panel } = open()
    expect(panel.style.top).toBe('-300px')
    expect(panel.style.maxHeight).toBe('300px')
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
      expect(panel.style.top).toBe('-120px')
      expect(observed.has(panel.querySelector('form'))).toBe(true)
      restore.grow(233)
      act(() => notify([]))
      // 214 para que quepan los 233, y 9 más por lo mismo de siempre: el canto
      // de abajo no puede quedarse dentro de `Registrar serie`.
      expect(panel.style.top).toBe('-223px')
      expect(panel.style.maxHeight).toBe('242px')
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

  // El caso de Progreso, y la otra mitad del mismo defecto. Medido a 430×932
  // con la página a 735, el nombre chocado y el segundo paso abierto: el panel
  // arrancaba en 524,9 y la fila de chips de músculo va de 524 a 560, así que
  // los tapaba 35,1 de 36 y dejaba una astilla viva de 0,9 px. Con el criterio
  // del centro, tres chips salían del orden de tabulación y el cuarto no.
  // Ahora el canto sube esos 0,9 y los tapa enteros: uno solo, y todos igual.
  it('el canto de arriba no deja astillas de una fila de chips', () => {
    restore = fakeLayout({
      slotTop: 553,
      panelHeight: 350,
      navTop: 875,
      triggerTop: 497,
      cardTop: 47,
      cardBottom: 572,
      sliverTop: 191,
      sliverHeight: 36,
    })
    const { panel } = open()
    // 331 para que quepan los 350 dentro de la tarjeta; con 331 el canto de
    // arriba cae en 222, dentro de los chips (191–227). Sube los 31 que faltan.
    expect(panel.style.top).toBe('-362px')
    expect(document.querySelector('.sliver')).toHaveAttribute('inert')
  })

  // Y cuando subir más no es una opción —porque el panel se saldría de la
  // pantalla por arriba— el panel se queda rozando algo. Entonces el criterio
  // de qué sale del orden de tabulación tiene que ser el solapamiento y no el
  // centro: un control tapado en su mitad de abajo tiene el centro fuera del
  // panel y aun así no se puede pulsar por donde importa.
  it('lo que sólo roza también sale del orden de tabulación', () => {
    restore = fakeLayout({
      slotTop: 28,
      panelHeight: 30,
      navTop: 700,
      triggerTop: -28,
      cardTop: -200,
      cardBottom: 700,
      underTop: 38,
      underHeight: 44,
      sliverTop: 2,
      sliverHeight: 10,
    })
    open()
    // El panel se queda en 8 (los 8 px de aire de arriba) y roza 4 px de un
    // control de 10 cuyo centro está en 7, o sea por encima del panel.
    expect(document.querySelector('.sliver')).toHaveAttribute('inert')
  })

  // ── El medio píxel que dejaba un control partido ────────────────────────
  // `offsetHeight` devuelve un entero, y el panel de verdad no mide un entero.
  // Medido en Progreso a 430×932 con la página en 735 y el segundo panel
  // abierto: la cuenta creía que el canto de abajo aterrizaba en 874,9 —el pie
  // exacto del disparador, o sea rozándolo sin tocarlo— mientras que el panel
  // acababa en 874,5 y le partía 43,6 px de 44. Con el nombre en colisión el
  // mismo error dejaba además una astilla de 0,2 px *viva*, porque el
  // solapamiento que decide quién sale del orden de tabulación se medía con el
  // mismo entero de más. Medio píxel no es un detalle cuando lo que decide es
  // si un canto cae dentro o fuera de un control.
  it('el canto de abajo se mide con el alto de verdad, no con el entero', () => {
    restore = fakeLayout({
      slotTop: 886.9,
      panelHeight: 261,
      panelRectHeight: 260.6,
      // La barra, lejos: aquí quien acota es el pie de la tarjeta, y así el
      // único canto en juego es el del disparador.
      navTop: 1400,
      triggerTop: 830.9,
      cardTop: 100,
      cardBottom: 875,
      underTop: 2000,
    })
    const { panel } = open()
    // Con 261 la cuenta sube 273 y se queda «rozando» el pie del disparador.
    // Con 260,6 el canto cae en 874,5, dentro de él, y sube los 43,6 que hacen
    // falta para dejarlo entero por debajo: 317.
    expect(panel.style.top).toBe('-317px')
    expect(document.querySelector('.exercise-edit')).not.toHaveAttribute('inert')
  })

  // ── La página se mueve; la barra de pestañas, no ─────────────────────────
  // Todo lo que el panel puede partir cuelga del documento y se desplaza con
  // él, y por eso los cantos aguantaban un scroll sin recalcular nada. El
  // borde útil no: la barra fija y el teclado están clavados al viewport.
  // Medido en Progreso abriendo con la página en 857 y subiendo a 735 sin
  // tocar el editor: el panel conservaba la subida de antes, su pie acababa en
  // 905,5 con el canto de la barra en 875, y `Eliminar ejercicio` —44 px, el
  // control más grave del editor— quedaba partido 13,5 px por una superficie
  // opaca. El mismo defecto que esta vuelta viene a quitar, sólo que producido
  // por el dedo en vez de por el primer pintado.
  it('mover la página debajo del panel lo vuelve a colocar', async () => {
    restore = fakeLayout({
      slotTop: 765,
      panelHeight: 260,
      navTop: 875,
      triggerTop: 709,
      cardTop: 100,
      cardBottom: 1400,
      underTop: 2000,
    })
    const { panel } = open()
    // 875 − 765 = 110 de sitio para 260: sube 150 y el pie queda clavado en la
    // barra.
    expect(panel.style.top).toBe('-150px')
    await act(async () => {
      restore.scrollTo(100)
    })
    // La tarjeta ha bajado 100, la barra sigue en 875: hacen falta 100 más.
    // El panel no se mueve ni un píxel en pantalla — lo que cambia es su
    // distancia a una tarjeta que sí se ha movido.
    await waitFor(() => expect(panel.style.top).toBe('-250px'))
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

// ── Tocar fuera cierra ────────────────────────────────────────────────────
// Medido por el crítico: tocando el campo de otra tarjeta el foco se iba allí
// y el editor se quedaba abierto detrás, con un renombrado sin confirmar
// dentro. Un panel que no es modal y tampoco se va cuando dejas de mirarlo no
// es ninguna de las dos cosas. DESIGN.md ya lo dice del único modal que hay
// («tocar el velo es cancelar: la salida tiene que ser tan fácil como la
// entrada»), y aquí el resto de la pantalla *es* el velo.
describe('ExerciseEditor: tocar fuera', () => {
  function Harness({ onClose }) {
    return (
      <div>
        <button type="button" className="exercise-edit">
          Editar ejercicio Press banca
        </button>
        <ExerciseEditor
          name="Press banca"
          open
          onClose={onClose}
          nameDraft="Press banca"
          onNameDraftChange={() => {}}
          onSubmitName={(e) => e.preventDefault()}
        />
        <button type="button">Registrar serie</button>
        <div role="dialog" aria-label="Eliminar Press banca">
          <button type="button">Sí, eliminar</button>
        </div>
      </div>
    )
  }

  it('un toque en cualquier otro sitio de la pantalla lo cierra', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Registrar serie' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('tocar dentro del panel no lo cierra', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByLabelText('Nombre de Press banca'))
    expect(onClose).not.toHaveBeenCalled()
  })

  // El disparador se apaña solo: su `onClick` alterna, y si además lo cerrase
  // esto, un toque valdría por dos y el panel volvería a abrirse.
  it('tocar el disparador no lo cierra por aquí', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: /editar ejercicio/i }))
    expect(onClose).not.toHaveBeenCalled()
  })

  // Los diálogos que este panel abre —confirmar el reetiquetado, confirmar el
  // borrado— se pintan fuera de él. Cerrar el editor al tocarlos dejaría al
  // usuario confirmando algo cuyo origen acaba de desaparecer.
  it('tocar un diálogo que el propio panel abrió no lo cierra', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Sí, eliminar' }))
    expect(onClose).not.toHaveBeenCalled()
  })
})

// ── La puerta dice lo que hay detrás ──────────────────────────────────────
// `Más ajustes` nombra un cajón, no su contenido, y encima el cajón no lleva
// lo mismo en las dos pantallas: en Entreno hay grupo y nota, en Progreso
// grupo y borrado. Lo nombra quien lo llena.
describe('ExerciseEditor: el rótulo del segundo paso', () => {
  it('lo pone quien pasa el contenido, y va también en la etiqueta hablada', () => {
    editor({ more: <p>ajustes</p>, moreLabel: 'Grupo y nota' })
    expect(screen.getByRole('button', { name: 'Grupo y nota de Press banca' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^Grupo y nota/ })).toHaveTextContent('Grupo y nota')
    expect(screen.queryByText('Más ajustes')).toBeNull()
  })
})

// ── Cuando el panel se lleva por delante el título ────────────────────────
// Medido en Entreno con el teclado arriba: el panel tapa `Press militar`
// entero y la nota del ejercicio entera, y en ese momento no queda nada en
// pantalla que diga qué estás editando — porque lo único que se lee es tu
// propio borrador a medio escribir, que en cuanto diverge del nombre guardado
// ya no lo dice. El panel se pone el nombre encima sólo entonces: si el título
// se ve, repetirlo dentro es el rótulo redundante que este panel quitó.
describe('ExerciseEditor: quién nombra el ejercicio', () => {
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

  function mount({ titleTop }) {
    const origRect = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function fake() {
      const cl = this.classList
      if (cl?.contains('editor-inplace-slot')) return rect(400, 400)
      if (cl?.contains('editor-inplace')) {
        const top = 400 + (parseFloat(this.style.top) || 0)
        return rect(top, top + 130)
      }
      if (cl?.contains('exercise-edit')) return rect(344, 388)
      // La tarjeta acaba justo debajo del hueco, así que el panel sube 110 y
      // se pone donde estaba la cabecera: es la forma corta de reproducir lo
      // que en el móvil hace el teclado.
      if (cl?.contains('card')) return rect(100, 420)
      if (cl?.contains('exercise-title')) return rect(titleTop, titleTop + 44)
      return origRect.call(this)
    }
    const origHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return this.classList?.contains('editor-inplace') ? 130 : 0
      },
    })
    render(
      <div className="card">
        <h2 className="exercise-title">Press militar</h2>
        <button type="button" className="exercise-edit">
          Editar ejercicio Press militar
        </button>
        <ExerciseEditor
          name="Press militar"
          open
          onClose={() => {}}
          nameDraft="Press milita"
          onNameDraftChange={() => {}}
          onSubmitName={(e) => e.preventDefault()}
        />
      </div>,
    )
    return () => {
      Element.prototype.getBoundingClientRect = origRect
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', origHeight)
    }
  }

  let restore = () => {}
  beforeEach(() => {
    window.innerHeight = 932
  })
  afterEach(() => restore())

  it('con el título a la vista no repite el nombre dentro', () => {
    restore = mount({ titleTop: 200 })
    expect(screen.queryByText(/Editando/)).toBeNull()
  })

  it('con el título tapado, el panel dice qué ejercicio es', () => {
    restore = mount({ titleTop: 350 })
    expect(screen.getByText('Editando · Press militar')).toBeInTheDocument()
  })

  // «A la vista» no es «tiene un píxel dentro de la pantalla», pero tampoco es
  // «no le falta ni uno». El nombre es una línea de texto: cortarle dos
  // píxeles por arriba no le quita nada que se leyera. Medido en Entreno con
  // la página en 419, `SPAN.card-name` cae en −2,2..25,5 —el 92 % en pantalla,
  // perfectamente legible— y la regla anterior, que descartaba cualquier caja
  // con `top` negativo, daba el título por perdido y metía dentro del panel un
  // `Editando · Press militar` con el nombre a la vista justo encima. Es el
  // rótulo redundante que este panel quitó, devuelto por la puerta de atrás.
  it('un título rozado por el canto de la pantalla sigue nombrando el ejercicio', () => {
    restore = mount({ titleTop: -2 })
    expect(screen.queryByText(/Editando/)).toBeNull()
  })

  // Y el otro lado de la misma regla: cuando lo que queda es una tira, ya no
  // nombra nada. Media caja es el corte, porque una línea de texto partida por
  // la mitad deja de leerse como palabra.
  it('un título casi entero fuera de pantalla ya no lo nombra', () => {
    restore = mount({ titleTop: -40 })
    expect(screen.getByText('Editando · Press militar')).toBeInTheDocument()
  })
})

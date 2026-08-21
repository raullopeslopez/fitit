import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ExerciseEditor, resolveEditorContainer } from './ExerciseEditor.jsx'

describe('ExerciseEditor', () => {
  it('no pinta nada mientras está cerrado', () => {
    const { container } = render(
      <ExerciseEditor name="Press banca" open={false} onClose={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('abierto, es un diálogo que nombra el ejercicio', () => {
    render(<ExerciseEditor name="Press banca" open onClose={() => {}} />)
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('heading', { name: 'Press banca' })).toBeInTheDocument()
  })

  it('sin cuerpo todavía, dice que lo está', () => {
    render(<ExerciseEditor name="Press banca" open onClose={() => {}} />)
    expect(screen.getByText(/aquí irán/i)).toBeInTheDocument()
  })

  it('con cuerpo, el marcador de posición desaparece', () => {
    render(
      <ExerciseEditor name="Press banca" open onClose={() => {}}>
        <p>Nombre</p>
      </ExerciseEditor>,
    )
    expect(screen.getByText('Nombre')).toBeInTheDocument()
    expect(screen.queryByText(/aquí irán/i)).not.toBeInTheDocument()
  })

  it('se cierra por el botón, por el velo y con Escape', async () => {
    const onClose = vi.fn()
    const { container } = render(
      <ExerciseEditor name="Press banca" open onClose={onClose} />,
    )

    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)

    await userEvent.click(container.querySelector('.sheet-scrim'))
    expect(onClose).toHaveBeenCalledTimes(2)

    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('un toque dentro de la hoja no la cierra', async () => {
    const onClose = vi.fn()
    render(
      <ExerciseEditor name="Press banca" open onClose={onClose}>
        <p>Nombre</p>
      </ExerciseEditor>,
    )
    await userEvent.click(screen.getByText('Nombre'))
    expect(onClose).not.toHaveBeenCalled()
  })
})

describe('ExerciseEditor: el foco', () => {
  // El botón dice «Editar ejercicio». Si al abrirse la hoja el cursor sigue en
  // el botón, el toque no ha empezado a editar nada: hace falta un segundo
  // toque para poner el cursor en el nombre, y entonces la puerta miente sobre
  // lo que hace. Abrir *es* empezar a editar.
  it('al abrir, el cursor entra en el nombre', async () => {
    render(
      <ExerciseEditor name="Press banca" open onClose={() => {}}>
        <label htmlFor="n">Nombre</label>
        <input id="n" defaultValue="Press banca" />
      </ExerciseEditor>,
    )
    expect(document.activeElement).toBe(screen.getByLabelText('Nombre'))
  })

  // Al final, no seleccionado entero: el caso normal es arreglar una errata en
  // un nombre que quieres conservar, no escribir otro encima. Un select-all
  // convierte la primera tecla en un borrado de todo lo que había.
  it('el cursor cae al final de lo que ya había, sin seleccionarlo', () => {
    render(
      <ExerciseEditor name="Press banca" open onClose={() => {}}>
        <label htmlFor="n">Nombre</label>
        <input id="n" defaultValue="Press banca" />
      </ExerciseEditor>,
    )
    const input = screen.getByLabelText('Nombre')
    expect(input.selectionStart).toBe('Press banca'.length)
    expect(input.selectionEnd).toBe('Press banca'.length)
  })

  // El cuerpo puede no traer ningún campo de texto (y hoy, sin `children`, no
  // trae ninguno). Enfocar entonces no debe reventar ni robarle el foco a nada.
  it('sin campo de texto que enfocar, no hace nada', () => {
    expect(() =>
      render(<ExerciseEditor name="Press banca" open onClose={() => {}} />),
    ).not.toThrow()
  })
})

// ── Qué caja es esto ──────────────────────────────────────────────────────
// Dos críticos independientes dijeron lo mismo sin hablarse: la hoja es la
// caja equivocada para corregir una errata. Así que aquí conviven las dos
// cajas y se elige por la barra de direcciones, para poder ponerlas una al
// lado de la otra sin recompilar nada.
describe('ExerciseEditor: qué caja', () => {
  it('por defecto, la hoja', () => {
    expect(resolveEditorContainer('')).toBe('sheet')
    expect(resolveEditorContainer('?foo=bar')).toBe('sheet')
  })

  it('`?editor=inline` pide la edición en sitio', () => {
    expect(resolveEditorContainer('?editor=inline')).toBe('inline')
    expect(resolveEditorContainer('?harness=dias&editor=inline')).toBe('inline')
  })

  it('un valor que no conocemos no rompe nada: se queda en la hoja', () => {
    expect(resolveEditorContainer('?editor=carrusel')).toBe('sheet')
  })
})

describe('ExerciseEditor en sitio', () => {
  const inPlace = (props = {}) =>
    render(
      <ExerciseEditor
        name="Press banca"
        open
        onClose={() => {}}
        container="inline"
        {...props}
      >
        <label htmlFor="n">Nombre</label>
        <input id="n" defaultValue="Press banca" />
      </ExerciseEditor>,
    )

  // Lo que separa esta caja de la otra: no hay velo. Nada de la pantalla se
  // apaga, porque no hay nada que decidir aquí que justifique apagar el resto.
  it('no dibuja velo ni se declara modal', () => {
    const { container } = inPlace()
    expect(container.querySelector('.sheet-scrim')).toBeNull()
    expect(container.querySelector('.sheet')).toBeNull()
    const dialog = screen.getByRole('dialog')
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(dialog).toHaveClass('editor-inplace')
  })

  // La queja concreta de los dos críticos: la hoja tapa el registro que estás
  // corrigiendo. Aquí el panel vive dentro de la tarjeta, colgado de un hueco
  // que no ocupa flujo, así que la columna no se mueve ni un píxel.
  it('cuelga de un hueco sin flujo, dentro de la tarjeta', () => {
    const { container } = inPlace()
    const slot = container.querySelector('.editor-inplace-slot')
    expect(slot).not.toBeNull()
    expect(slot.querySelector('.editor-inplace')).not.toBeNull()
  })

  it('se cierra por el aspa y con Escape', async () => {
    const onClose = vi.fn()
    inPlace({ onClose })
    await userEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(onClose).toHaveBeenCalledTimes(1)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('el cursor entra en el nombre igual que en la hoja', () => {
    inPlace()
    expect(document.activeElement).toBe(screen.getByLabelText('Nombre'))
  })
})

// ── Volver de donde viniste ───────────────────────────────────────────────
// Al cerrar, el foco tiene que volver al botón que abrió esto. Si se queda en
// `body`, quien navega con teclado o con lector vuelve al principio de la
// página cada vez que corrige una letra.
describe.each(['sheet', 'inline'])('ExerciseEditor (%s): el foco al cerrar', (container) => {
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
          container={container}
        >
          <label htmlFor="n">Nombre</label>
          <input id="n" defaultValue="Press banca" />
        </ExerciseEditor>
      </>
    )
  }

  it('vuelve al disparador que lo abrió', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: /editar ejercicio/i })
    await userEvent.click(trigger)
    expect(document.activeElement).toBe(screen.getByLabelText('Nombre'))
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

// ── Que el panel en sitio quepa, sin mover la página ──────────────────────
// Dos defectos medidos en el navegador, no en jsdom, y por eso van aquí con
// la maquetación fingida a mano: jsdom no tiene cajas, así que se le dan.
//
// 1. La barra de pestañas es `fixed` a 875–932 con `z-index: 10`, y el panel
//    vive a 3. Medido en Entreno: el panel acababa en 896 y `Guardar nota` en
//    840–879, o sea con la cola debajo de la barra. Es exactamente el mismo
//    fallo que el teclado —el botón que confirma, enterrado bajo algo fijo—
//    y se arregla igual: contando lo que tapa.
// 2. En Progreso el panel se hacía sitio alargando el documento (1789 → 2064)
//    y desplazando la página 119 px. Eso es justo lo que la hoja vino a
//    arreglar, sólo que más pequeño: la columna de contenido tiene que quedarse
//    quieta. El panel sube; la página no se mueve.
describe('ExerciseEditor en sitio: cabe sin empujar', () => {
  const rect = (t, b) => ({
    top: t,
    bottom: b,
    left: 0,
    right: 430,
    width: 430,
    height: b - t,
    x: 0,
    y: t,
    toJSON() {},
  })

  function fakeLayout({ slotTop, panelHeight, navTop }) {
    const origRect = Element.prototype.getBoundingClientRect
    Element.prototype.getBoundingClientRect = function fake() {
      if (this.classList?.contains('editor-inplace-slot')) return rect(slotTop, slotTop)
      if (this.classList?.contains('editor-inplace')) return rect(slotTop, slotTop + panelHeight)
      if (this.classList?.contains('bottom-nav')) return rect(navTop, navTop + 57)
      return origRect.call(this)
    }
    const origHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
    Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
      configurable: true,
      get() {
        return this.classList?.contains('editor-inplace') ? panelHeight : 0
      },
    })
    return () => {
      Element.prototype.getBoundingClientRect = origRect
      Object.defineProperty(HTMLElement.prototype, 'offsetHeight', origHeight)
    }
  }

  let restore = () => {}
  let nav = null
  beforeEach(() => {
    window.innerHeight = 932
  })
  afterEach(() => {
    restore()
    nav?.remove()
    nav = null
  })

  const openInPlace = () => {
    render(
      <ExerciseEditor name="Press banca" open onClose={() => {}} container="inline">
        <label htmlFor="n">Nombre</label>
        <input id="n" defaultValue="Press banca" />
      </ExerciseEditor>,
    )
    return {
      slot: document.querySelector('.editor-inplace-slot'),
      panel: document.querySelector('.editor-inplace'),
    }
  }

  it('el hueco nunca toma altura: la columna de contenido no se mueve', () => {
    restore = fakeLayout({ slotTop: 765, panelHeight: 294, navTop: 875 })
    const { slot } = openInPlace()
    expect(slot.style.height).toBe('0px')
  })

  it('no desplaza la página para hacerse sitio', () => {
    restore = fakeLayout({ slotTop: 765, panelHeight: 294, navTop: 875 })
    const scrollBy = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
    openInPlace()
    expect(scrollBy).not.toHaveBeenCalled()
    scrollBy.mockRestore()
  })

  it('sube lo justo para no quedarse debajo de la barra de pestañas', () => {
    nav = document.createElement('div')
    nav.className = 'bottom-nav'
    document.body.appendChild(nav)
    restore = fakeLayout({ slotTop: 765, panelHeight: 294, navTop: 875 })
    const { panel } = openInPlace()
    // 875 − 765 = 110 px de sitio para 294 px de panel: sube 184.
    expect(panel.style.top).toBe('-184px')
    expect(panel.style.maxHeight).toBe('294px')
  })

  it('si cabe entero, no sube nada', () => {
    nav = document.createElement('div')
    nav.className = 'bottom-nav'
    document.body.appendChild(nav)
    restore = fakeLayout({ slotTop: 400, panelHeight: 300, navTop: 875 })
    const { panel } = openInPlace()
    expect(panel.style.top).toBe('0px')
  })

  it('nunca sube tanto como para salirse por arriba', () => {
    nav = document.createElement('div')
    nav.className = 'bottom-nav'
    document.body.appendChild(nav)
    // Un panel más alto que toda la pantalla: sube hasta 8 px del borde y ahí
    // se para; lo que sobre se desplaza dentro del propio panel.
    restore = fakeLayout({ slotTop: 300, panelHeight: 1200, navTop: 875 })
    const { panel } = openInPlace()
    expect(panel.style.top).toBe('-292px')
    expect(panel.style.maxHeight).toBe('867px')
  })
})

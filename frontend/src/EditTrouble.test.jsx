import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditTrouble, NoteUndo, editTroubleText } from './EditTrouble.jsx'

const clash = (exercise, extra = {}) => ({
  kind: 'clash',
  from: 'Press de banca',
  draft: 'Press banca',
  myKind: 'strength',
  // Lo que se pierde, contado fresco en el momento del choque. Sin esto la
  // frase sólo sabe tasar el superviviente.
  mine: { set_count: 6, muscle_group: 'Pecho' },
  exercise,
  ...extra,
})

const dest = (over = {}) => ({
  id: 1,
  name: 'Press banca',
  kind: 'strength',
  set_count: 48,
  muscle_group: 'Pecho',
  ...over,
})

describe('lo que dice un nombre cogido', () => {
  // Las dos cifras, no una. 48 es el tamaño de lo que te quedas —lo que *no*
  // arriesgas— y una etiqueta de precio colgada de lo que conservas no es un
  // precio. La que decide es la de este ejercicio: sus series, sus récords.
  it('prices both sides of the merge, not just the survivor', () => {
    expect(editTroubleText(clash(dest()))).toBe(
      'Ya tienes «Press banca», con 48 series. ' +
        'Fusionar mueve ahí las 6 series de «Press de banca», con sus récords, y lo borra. ' +
        'No se puede deshacer.',
    )
  })

  it('says 1 serie in the singular on both sides', () => {
    const text = editTroubleText(
      clash(dest({ set_count: 1 }), { mine: { set_count: 1, muscle_group: 'Pecho' } }),
    )
    expect(text).toContain('con 1 serie.')
    expect(text).toContain('la serie de «Press de banca»')
  })

  // «Fusionar mueve 0 series» suena a que la fusión no hace nada, cuando lo que
  // pasa es lo contrario: uno de los dos está vacío, y eso es justo lo que
  // inclina la decisión. Se dice con palabras en los dos lados.
  it('does not print a count of zero on either side', () => {
    const text = editTroubleText(
      clash(dest({ set_count: 0 }), { mine: { set_count: 0, muscle_group: 'Pecho' } }),
    )
    expect(text).toContain('Ya tienes «Press banca», todavía sin series.')
    expect(text).toContain('Fusionar borra «Press de banca», que no tiene ninguna serie.')
    expect(text).not.toMatch(/0 series/)
  })

  // El número fresco es el que vale, pero si no se pudo ir a por él la frase no
  // se inventa uno: dice lo que se lleva sin contarlo.
  it('names what is lost even when the count could not be refreshed', () => {
    const text = editTroubleText(clash(dest(), { mine: null }))
    expect(text).toContain('las series de «Press de banca», con sus récords, y lo borra')
    expect(text).toContain('No se puede deshacer.')
  })

  // Una fusión entre grupos distintos reetiqueta el registro entero, y la copia
  // se lo callaba: Espalda plegada dentro de un ejercicio de Pecho sin una
  // palabra.
  it('admits that a cross-muscle merge changes the tag', () => {
    const text = editTroubleText(
      clash(dest(), { mine: { set_count: 6, muscle_group: 'Espalda' } }),
    )
    expect(text).toContain('Quedará todo en Pecho, el grupo de «Press banca».')
  })

  it('says it the other way when the survivor has no group', () => {
    const text = editTroubleText(
      clash(dest({ muscle_group: null }), { mine: { set_count: 6, muscle_group: 'Espalda' } }),
    )
    expect(text).toContain('Quedará todo sin grupo, como «Press banca».')
  })

  // Y se calla cuando no hay nada que decir: mismo grupo, misma etiqueta.
  it('stays quiet about the tag when both sides already agree', () => {
    expect(editTroubleText(clash(dest()))).not.toContain('Quedará todo')
  })

  // Una fusión entre kinds distintos la rechaza el servidor con otro 409.
  // Ofrecerla es prometer un botón que no puede funcionar.
  it('refuses to offer a merge across kinds, and says why', () => {
    expect(
      editTroubleText(clash({ id: 9, name: 'Cinta', kind: 'cardio', set_count: 12 })),
    ).toBe(
      'Ya tienes «Cinta», pero es de cardio y «Press de banca» es de fuerza. ' +
        'No se pueden fusionar: ponle otro nombre.',
    )
  })

  it('says the same thing the other way round', () => {
    expect(
      editTroubleText({
        kind: 'clash',
        from: 'Cinta',
        draft: 'Press banca',
        myKind: 'cardio',
        exercise: dest(),
      }),
    ).toBe(
      'Ya tienes «Press banca», pero es de fuerza y «Cinta» es de cardio. ' +
        'No se pueden fusionar: ponle otro nombre.',
    )
  })

  it('says the plain thing when the rename never left the phone', () => {
    expect(editTroubleText({ kind: 'network', from: 'Press de banca', draft: 'Press banca' })).toBe(
      'No se pudo cambiar el nombre.',
    )
  })
})

describe('lo que se ofrece', () => {
  it('offers both ways out of a collision', async () => {
    const onMerge = vi.fn()
    const onRename = vi.fn()
    render(
      <EditTrouble
        trouble={clash(dest())}
        onMerge={onMerge}
        onRename={onRename}
        onRetry={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Sí, fusionar' }))
    expect(onMerge).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Escribir otro nombre' }))
    expect(onRename).toHaveBeenCalled()
  })

  // El ámbar significa «esto es lo que vienes a hacer», y lo llevaba la salida
  // que no rompe nada mientras la irreversible iba de fantasma con borde. El
  // rojo de la casa es para lo destructivo, y esto lo es.
  it('dresses the irreversible half as destructive and the way out as quiet', () => {
    render(
      <EditTrouble
        trouble={clash(dest())}
        onMerge={vi.fn()}
        onRename={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Sí, fusionar' })).toHaveClass('edit-trouble-merge')
    expect(screen.getByRole('button', { name: 'Escribir otro nombre' })).toHaveClass('secondary')
  })

  it('drops the merge when the kinds do not match', () => {
    render(
      <EditTrouble
        trouble={clash({ id: 9, name: 'Cinta', kind: 'cardio', set_count: 12 })}
        onMerge={vi.fn()}
        onRename={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Sí, fusionar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Escribir otro nombre' })).toBeInTheDocument()
  })

  // Un fallo de red no es una respuesta: la misma salida vuelve a preguntar.
  it('offers a retry when the rename never left', async () => {
    const onRetry = vi.fn()
    render(
      <EditTrouble
        trouble={{ kind: 'network', from: 'Press de banca', draft: 'Press banca' }}
        onMerge={vi.fn()}
        onRename={vi.fn()}
        onRetry={onRetry}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(onRetry).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Sí, fusionar' })).not.toBeInTheDocument()
  })

  it('renders nothing at all when there is nothing wrong', () => {
    const { container } = render(<EditTrouble trouble={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

// Vaciar la nota mandaba `{"note": null}` y una nota guardada desaparecía sin
// confirmación y sin vuelta atrás. El confirm no vale aquí —cuelga de la
// salida, y las cuatro salidas tienen que valer lo mismo—, así que la forma es
// la del reetiquetado: una fila que dice qué se llevó y ofrece devolverlo.
describe('la nota que se borró', () => {
  it('quotes the note it just lost and offers it back', async () => {
    const onUndo = vi.fn()
    render(<NoteUndo note="sin rebote" onUndo={onUndo} />)

    expect(screen.getByText('Se borró la nota: «sin rebote».')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Deshacer' }))
    expect(onUndo).toHaveBeenCalled()
  })

  it('renders nothing when no note was lost', () => {
    const { container } = render(<NoteUndo note={null} onUndo={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })
})

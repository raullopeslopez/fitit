import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditTrouble, editTroubleText } from './EditTrouble.jsx'

const clash = (exercise, myKind = 'strength') => ({
  kind: 'clash',
  from: 'Press de banca',
  draft: 'Press banca',
  myKind,
  exercise,
})

describe('lo que dice un nombre cogido', () => {
  // La cifra es la razón por la que el backend cambió el 409: sin ella la
  // elección es a ciegas — no sabes si «Press banca» es el ejercicio de verdad
  // con meses detrás o una fila suelta que creaste hace un minuto.
  it('names the collision from the response and prices the merge', () => {
    expect(
      editTroubleText(clash({ id: 1, name: 'Press banca', kind: 'strength', set_count: 48 })),
    ).toBe(
      'Ya tienes «Press banca», con 48 series. Fusionar mueve ahí las series de ' +
        '«Press de banca» y deja un solo ejercicio.',
    )
  })

  it('says 1 serie in the singular', () => {
    expect(
      editTroubleText(clash({ id: 1, name: 'Press banca', kind: 'strength', set_count: 1 })),
    ).toContain('con 1 serie.')
  })

  // «Fusionar mueve 0 series» es una frase que no debe imprimirse: dicha así
  // suena a que la fusión no hace nada, cuando lo que pasa es que el ejercicio
  // con el que chocaste está vacío — que es justo lo que inclina la decisión.
  it('does not print a count of zero', () => {
    const text = editTroubleText(
      clash({ id: 1, name: 'Press banca', kind: 'strength', set_count: 0 }),
    )
    expect(text).toContain('Ya tienes «Press banca», todavía sin series.')
    expect(text).not.toMatch(/0 series/)
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
      editTroubleText(
        {
          kind: 'clash',
          from: 'Cinta',
          draft: 'Press banca',
          myKind: 'cardio',
          exercise: { id: 1, name: 'Press banca', kind: 'strength', set_count: 48 },
        },
      ),
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
        trouble={clash({ id: 1, name: 'Press banca', kind: 'strength', set_count: 48 })}
        onMerge={onMerge}
        onRename={onRename}
        onRetry={vi.fn()}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Fusionar' }))
    expect(onMerge).toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar el nombre' }))
    expect(onRename).toHaveBeenCalled()
  })

  it('drops Fusionar when the kinds do not match', () => {
    render(
      <EditTrouble
        trouble={clash({ id: 9, name: 'Cinta', kind: 'cardio', set_count: 12 })}
        onMerge={vi.fn()}
        onRename={vi.fn()}
        onRetry={vi.fn()}
      />,
    )

    expect(screen.queryByRole('button', { name: 'Fusionar' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cambiar el nombre' })).toBeInTheDocument()
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
    expect(screen.queryByRole('button', { name: 'Fusionar' })).not.toBeInTheDocument()
  })

  it('renders nothing at all when there is nothing wrong', () => {
    const { container } = render(<EditTrouble trouble={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

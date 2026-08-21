import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ExerciseEditor } from './ExerciseEditor.jsx'

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

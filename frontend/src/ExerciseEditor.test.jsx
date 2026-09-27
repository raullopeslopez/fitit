import React, { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ExerciseEditor, MusclePicker } from './ExerciseEditor.jsx'

const base = {
  name: 'Press banca',
  open: true,
  onClose: () => {},
  nameDraft: 'Press banca',
  onNameDraftChange: () => {},
  onSubmitName: (e) => e.preventDefault(),
}
const editor = (props = {}) => render(<ExerciseEditor {...base} {...props} />)

// Una pantalla mínima con su disparador, para las salidas que devuelven el foco
// y para ver que lo de detrás queda fuera de alcance.
function Screen({ onCommit = () => {} }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Editar ejercicio
      </button>
      <button type="button">Registrar serie</button>
      <ExerciseEditor
        {...base}
        open={open}
        onClose={() => setOpen(false)}
        onCommit={onCommit}
      />
    </>
  )
}

describe('ExerciseEditor: la hoja', () => {
  it('no pinta nada mientras está cerrada', () => {
    editor({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.querySelector('.sheet-scrim')).toBeNull()
  })

  // La hoja de la casa, fuera del árbol de la tarjeta: fija al pie, con su
  // fondo, y sin nada que medir ni recolocar — que es de donde venía el
  // parpadeo del selector del grupo en la APK.
  it('abierta, es la hoja modal de la casa, colgada de body', () => {
    const { container } = editor()
    const sheet = screen.getByRole('dialog', { name: 'Editar Press banca' })
    expect(sheet).toHaveClass('sheet')
    expect(sheet).toHaveAttribute('aria-modal', 'true')
    expect(container).not.toContainElement(sheet)
    expect(sheet.closest('.sheet-scrim').parentElement).toBe(document.body)
  })

  it('el título es el propio campo del nombre, no un rótulo aparte', () => {
    editor()
    expect(screen.getByLabelText('Nombre de Press banca')).toHaveValue('Press banca')
    expect(screen.queryByRole('heading', { name: 'Press banca' })).toBeNull()
  })

  // No levanta el teclado al abrir: el grupo y la nota viven en la misma hoja,
  // y un teclado arriba taparía lo que venías a tocar.
  it('el foco entra en la hoja, no en el campo', () => {
    editor()
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })

  it('lo de detrás queda inerte mientras la hoja está arriba, y vuelve al cerrarla', async () => {
    render(<Screen />)
    const behind = screen.getByRole('button', { name: 'Registrar serie' })
    await userEvent.click(screen.getByRole('button', { name: 'Editar ejercicio' }))
    expect(behind.closest('[inert]')).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(behind.closest('[inert]')).toBeNull()
    expect(document.body.style.overflow).toBe('')
  })

  it('pinta lo que le pasan debajo del nombre, sin segundo paso', () => {
    editor({ more: <button type="button">Eliminar</button> })
    expect(screen.getByRole('button', { name: 'Eliminar' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /grupo, nota/i })).toBeNull()
  })
})

// Salir es guardar, por cualquier puerta. Si una guardase y otra no, el
// resultado dependería de dónde aterrizó el pulgar.
describe('ExerciseEditor: las salidas', () => {
  const exits = {
    'el aspa': async () => userEvent.click(screen.getByRole('button', { name: 'Cerrar' })),
    Escape: async () => userEvent.keyboard('{Escape}'),
    'el fondo': async () => userEvent.click(document.querySelector('.sheet-scrim')),
    'el gesto de atrás': async () => fireEvent.popState(window),
  }

  for (const [exit, leave] of Object.entries(exits)) {
    it(`${exit} guarda, cierra y devuelve el foco al disparador`, async () => {
      const onCommit = vi.fn()
      render(<Screen onCommit={onCommit} />)
      const opener = screen.getByRole('button', { name: 'Editar ejercicio' })
      await userEvent.click(opener)

      await leave()

      expect(onCommit).toHaveBeenCalled()
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(opener).toHaveFocus()
    })
  }

  it('tocar dentro de la hoja no la cierra', async () => {
    const onClose = vi.fn()
    editor({ onClose, more: <p>Grupo</p> })
    await userEvent.click(screen.getByText('Grupo'))
    expect(onClose).not.toHaveBeenCalled()
  })

  // Intro es «Hecho» en el teclado de Android: manda el nombre y cierra.
  it('Intro manda el nombre y cierra', async () => {
    const onSubmitName = vi.fn((e) => e.preventDefault())
    const onClose = vi.fn()
    editor({ onSubmitName, onClose })
    await userEvent.type(screen.getByLabelText('Nombre de Press banca'), '{Enter}')
    expect(onSubmitName).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Arrastrar el asa hacia abajo, que es lo primero que prueba un pulgar.
  it('arrastrar el asa más de 80 px hacia abajo cierra, y menos no', () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()
    editor({ onCommit, onClose })
    const grab = document.querySelector('.editor-sheet-grab')

    fireEvent.pointerDown(grab, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(grab, { clientY: 150, pointerId: 1 })
    fireEvent.pointerUp(grab, { clientY: 150, pointerId: 1 })
    expect(onClose).not.toHaveBeenCalled()

    fireEvent.pointerDown(grab, { clientY: 100, pointerId: 1 })
    fireEvent.pointerMove(grab, { clientY: 220, pointerId: 1 })
    fireEvent.pointerUp(grab, { clientY: 220, pointerId: 1 })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  // Irse de la app guarda sin cerrar: si vuelves, vuelves a lo que mirabas.
  it('irse de la app guarda lo escrito sin cerrar la hoja', () => {
    const onCommit = vi.fn()
    const onClose = vi.fn()
    editor({ onCommit, onClose })
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
    fireEvent(document, new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })
})

// El grupo, en fichas. Era un `<select>`, y en la APK su selector nativo se
// quedaba parpadeando encima del panel.
describe('MusclePicker', () => {
  it('es una elección entre fichas que dice cuál está puesta', () => {
    render(<MusclePicker name="Press banca" value="Pecho" onChange={() => {}} />)
    const group = screen.getByRole('radiogroup', { name: 'Grupo muscular de Press banca' })
    expect(screen.getByRole('radio', { name: 'Pecho' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Espalda' })).not.toBeChecked()
    // Los nueve grupos y «Sin grupo», todos a la vista.
    expect(group.querySelectorAll('[role="radio"]')).toHaveLength(10)
    expect(document.querySelector('select')).toBeNull()
  })

  it('elegir otra ficha la manda; «Sin grupo» manda null', async () => {
    const onChange = vi.fn()
    render(<MusclePicker name="Press banca" value="Pecho" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Hombro' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Sin grupo' }))
    expect(onChange.mock.calls).toEqual([['Hombro'], [null]])
  })

  it('tocar la que ya está puesta no manda nada', async () => {
    const onChange = vi.fn()
    render(<MusclePicker name="Press banca" value="Pecho" onChange={onChange} />)
    await userEvent.click(screen.getByRole('radio', { name: 'Pecho' }))
    expect(onChange).not.toHaveBeenCalled()
  })
})

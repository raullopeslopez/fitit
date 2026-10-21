import { act, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'

import { useRepetir } from './repetir.js'

function Contador() {
  const [n, setN] = useState(0)
  const repetir = useRepetir()
  return (
    <button type="button" {...repetir(() => setN((v) => v + 1))}>
      {n}
    </button>
  )
}

// Lienzo «Movimiento → fichas que ruedan»: mantener pulsado repite cada
// 120 ms tras 400 ms; un toque suelto sigue siendo un paso.
describe('useRepetir', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('un toque es un paso', () => {
    render(<Contador />)
    const boton = screen.getByRole('button')
    fireEvent.pointerDown(boton)
    fireEvent.pointerUp(boton)
    fireEvent.click(boton)
    expect(boton).toHaveTextContent('1')
  })

  it('mantenido repite, y el click de soltar no suma otro', () => {
    render(<Contador />)
    const boton = screen.getByRole('button')
    fireEvent.pointerDown(boton)
    act(() => vi.advanceTimersByTime(400 + 120 * 3))
    fireEvent.pointerUp(boton)
    fireEvent.click(boton)
    expect(boton).toHaveTextContent('4')
    act(() => vi.advanceTimersByTime(1000))
    expect(boton).toHaveTextContent('4')
  })
})

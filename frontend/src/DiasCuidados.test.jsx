import { render, screen } from '@testing-library/react'

import { DiasCuidados, contarCuidados } from './DiasCuidados.jsx'

// Del 24 de ago al 18 de oct son las últimas 8 semanas con el 18 de oct (domingo) como hoy.
const DIAS = ['2026-06-03', '2026-08-23', '2026-08-24', '2026-09-30', '2026-10-01', '2026-10-17', '2026-10-18']

describe('contarCuidados', () => {
  it('cuenta los días de las últimas 8 semanas, hoy incluido', () => {
    expect(contarCuidados(DIAS, '2026-10-18').ventana).toBe(5)
  })

  it('reparte los días por mes, los cinco últimos', () => {
    expect(contarCuidados(DIAS, '2026-10-18').meses).toEqual([
      { mes: '2026-06', dias: 1 },
      { mes: '2026-07', dias: 0 },
      { mes: '2026-08', dias: 2 },
      { mes: '2026-09', dias: 1 },
      { mes: '2026-10', dias: 3 },
    ])
  })
})

describe('DiasCuidados', () => {
  it('dice cuántos días de 56 y pinta una barra por mes', () => {
    render(<DiasCuidados dias={DIAS} hoy="2026-10-18" />)
    expect(screen.getByText('5 de 56')).toBeInTheDocument()
    expect(screen.getByText('días cuidados en 8 semanas')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Días cuidados por mes: jun 1, jul 0, ago 2, sep 1, oct 3' })).toBeInTheDocument()
  })

  // Nunca una racha: ni «días seguidos» ni nada que se rompa.
  it('no habla de rachas', () => {
    const { container } = render(<DiasCuidados dias={DIAS} hoy="2026-10-18" />)
    expect(container).not.toHaveTextContent(/seguid|racha/i)
  })

  it('sin datos no se dibuja', () => {
    const { container } = render(<DiasCuidados dias={null} hoy="2026-10-18" />)
    expect(container).toBeEmptyDOMElement()
  })
})

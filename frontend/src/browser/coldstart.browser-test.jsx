// La espera del arranque en frío, medida en el alto de un móvil.
//
// Sin barra de pestañas y con una sola tarjeta, todo se apilaba arriba y la
// mitad de abajo de la pantalla quedaba vacía. La tarjeta va en el centro del
// hueco que deja la marca: lo que sobra arriba y lo que sobra abajo, iguales.
import { render } from '@testing-library/react'

import ColdStart from '../ColdStart.jsx'

const gaps = (top, bottom) => {
  const brand = document.querySelector('.cold-brand').getBoundingClientRect()
  const container = document.querySelector('.cold')
  const cs = getComputedStyle(container)
  const padBottom = parseFloat(cs.paddingBottom)
  // El `gap` de la columna separa la marca de la tarjeta, no es sobrante.
  const above = top.getBoundingClientRect().top - brand.bottom - parseFloat(cs.rowGap)
  const below = container.getBoundingClientRect().bottom - padBottom - bottom.getBoundingClientRect().bottom
  return { above, below }
}

describe('la espera del arranque', () => {
  it('ocupa la pantalla sin desbordarla', () => {
    render(<ColdStart phase="waiting" attempt={0} onRetry={() => {}} onLocal={() => {}} />)
    expect(document.documentElement.scrollHeight).toBeLessThanOrEqual(window.innerHeight)
  })

  it('centra la tarjeta en el hueco bajo la marca', () => {
    render(<ColdStart phase="waiting" attempt={0} onRetry={() => {}} onLocal={() => {}} />)
    const { above, below } = gaps(
      document.querySelector('.cold-card'),
      document.querySelector('.cold-dots'),
    )
    expect(above).toBeGreaterThan(100)
    expect(Math.abs(above - below)).toBeLessThan(2)
  })

  it('centra también el aviso de error', () => {
    render(<ColdStart phase="failed" attempt={1} onRetry={() => {}} onLocal={() => {}} />)
    const { above, below } = gaps(
      document.querySelector('.cold-fail-title'),
      document.querySelector('.cold > .hint:last-child'),
    )
    expect(above).toBeGreaterThan(100)
    expect(Math.abs(above - below)).toBeLessThan(2)
  })
})

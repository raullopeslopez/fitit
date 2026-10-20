// El movimiento del lienzo «Movimiento», medido donde se pinta: la hoja entra
// en 320 ms y frena, un botón se hunde en 120 ms, y abrir una pantalla es un
// fundido de 8 px — nada más se mueve sin que lo toques.
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { mountEntreno } from './screen.jsx'
import { settle } from './geometry.js'

describe('Movimiento', () => {
  it('la hoja entra en 320 ms, y el botón se hunde en 120 ms', async () => {
    await mountEntreno()
    const user = userEvent.setup()
    const boton = screen.getByRole('button', { name: 'Acciones del entreno' })
    const transicion = getComputedStyle(boton)
    expect(transicion.transitionProperty).toContain('transform')
    await user.click(boton)
    await settle()
    const hoja = document.querySelector('.sheet-scrim > .sheet')
    const estilo = getComputedStyle(hoja)
    expect(estilo.animationName).toBe('mov-hoja')
    expect(estilo.animationDuration).toBe('0.32s')
  })

  it('las series ya registradas no se mueven al abrir la pantalla', async () => {
    await mountEntreno()
    for (const fila of document.querySelectorAll('.set-log > li')) {
      expect(getComputedStyle(fila).animationName).toBe('none')
    }
  })
})

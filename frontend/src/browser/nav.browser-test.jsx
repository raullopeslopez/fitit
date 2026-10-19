// La barra de pestañas de Marcador, medida donde se pinta: una píldora que
// flota despegada del borde, la activa en mandarina con su nombre y las demás
// sólo icono — y nada fijado encima de ella queda debajo.
import { afterEach } from 'vitest'

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { mountApp } from './screen.jsx'
import { clearForcedTheme, forceTheme, parseColor, settle } from './geometry.js'

afterEach(() => clearForcedTheme())

const token = (name) => {
  const probe = document.createElement('span')
  probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(name)
  document.body.appendChild(probe)
  const value = parseColor(getComputedStyle(probe).color)
  probe.remove()
  return value
}
const rgb = ([r, g, b]) => [r, g, b].map((n) => Math.round(n))

async function mountNav() {
  await mountApp()
  await vi.waitFor(() => expect(document.querySelector('.bottom-nav .tab')).not.toBeNull(), {
    timeout: 5000,
  })
  await settle()
}

describe('Barra flotante', () => {
  it('flota: 18 px sobre el borde, 16 a cada lado, en píldora', async () => {
    await mountNav()
    const nav = document.querySelector('.bottom-nav').getBoundingClientRect()
    expect(window.innerHeight - nav.bottom).toBe(18)
    expect(nav.left).toBe(16)
    expect(window.innerWidth - nav.right).toBe(16)
    expect(nav.height).toBe(64)
    expect(getComputedStyle(document.querySelector('.bottom-nav')).borderTopLeftRadius).toBe('32px')
  })

  it('Hoy, Semana, Historial, Progreso y Tú; sólo la activa enseña su nombre', async () => {
    await mountNav()
    const tabs = [...document.querySelectorAll('.bottom-nav .tab')]
    expect(tabs.map((t) => t.textContent.trim())).toEqual(['Hoy', 'Semana', 'Historial', 'Progreso', 'Tú'])
    for (const theme of ['light', 'dark']) {
      forceTheme(theme)
      await settle()
      await new Promise((r) => setTimeout(r, 250))
      const activa = document.querySelector(".tab[aria-current='page']")
      expect(rgb(parseColor(getComputedStyle(activa).backgroundColor)), theme).toEqual(rgb(token('--accent')))
      expect(activa.querySelector('.tab-label').getBoundingClientRect().width, theme).toBeGreaterThan(10)
      for (const t of tabs.filter((t) => t !== activa)) {
        expect(t.querySelector('.tab-label').getBoundingClientRect().width, theme).toBeLessThanOrEqual(1)
      }
    }
  })

  it('cambiar de pestaña mueve la píldora', async () => {
    await mountNav()
    const user = userEvent.setup()
    await user.click(screen.getByRole('button', { name: 'Tú' }))
    await settle()
    expect(screen.getByRole('button', { name: 'Tú' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('button', { name: 'Historial' })).not.toHaveAttribute('aria-current')
  })
})

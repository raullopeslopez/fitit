// Perfil, medido donde se pinta. Marcador (DESIGN.md): titular de pantalla a
// 54, las secciones sin tarjeta y nombradas por un sello, los selectores en
// píldora con la opción elegida en tinta, y el peso como la única banda a
// sangre de la pantalla.
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
const bg = (el) => parseColor(getComputedStyle(el).backgroundColor)
const tema = async (theme) => {
  forceTheme(theme)
  await settle()
  await new Promise((r) => setTimeout(r, 250))
}

// `mountPerfil` del arnés espera una «Propuesta» que ya no sale así; aquí basta
// con que la pantalla y el peso estén pintados.
async function mountPerfil() {
  await mountApp()
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: /^Perfil$/ }, { timeout: 5000 }))
  await vi.waitFor(() => expect(document.querySelector('.perfil .weight-card')).not.toBeNull(), {
    timeout: 5000,
  })
  await settle()
}

describe('Perfil en Marcador', () => {
  it('«Perfil» es titular de pantalla en Bricolage 800 a 54 px', async () => {
    await mountPerfil()
    const titulo = document.querySelector('.perfil-title')
    expect(titulo.textContent).toBe('Perfil')
    const estilo = getComputedStyle(titulo)
    expect(estilo.fontSize).toBe('54px')
    expect(estilo.fontWeight).toBe('800')
    expect(estilo.fontFamily).toContain('Bricolage Grotesque')
  })

  it('las secciones no son tarjetas, y las nombra un sello', async () => {
    await mountPerfil()
    for (const card of document.querySelectorAll('.perfil-card')) {
      expect(bg(card)[3]).toBe(0)
      expect(getComputedStyle(card).borderTopLeftRadius).toBe('0px')
    }
    const sello = getComputedStyle(document.querySelector('.perfil-seccion > h2'))
    expect(sello.fontFamily).toContain('Geist Mono')
    expect(sello.textTransform).toBe('uppercase')
    expect(sello.fontSize).toBe('11.2px')
    expect(rgb(parseColor(sello.color))).toEqual(rgb(token('--muted')))
    // Sin caja, la fila empieza en la misma columna que su sello.
    const fila = document.querySelector('.perfil-card .ui-row-label').getBoundingClientRect()
    const h2 = document.querySelector('.perfil-seccion > h2').getBoundingClientRect()
    expect(fila.left).toBe(h2.left)
  })

  it('el peso es una banda a sangre: de canto a canto y sin esquinas', async () => {
    await mountPerfil()
    const banda = document.querySelector('.weight-card')
    const r = banda.getBoundingClientRect()
    expect(r.left).toBe(0)
    expect(r.right).toBe(window.innerWidth)
    expect(getComputedStyle(banda).borderTopLeftRadius).toBe('0px')
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  })

  it('en los selectores, la opción elegida va en tinta sobre una píldora', async () => {
    await mountPerfil()
    for (const theme of ['light', 'dark']) {
      await tema(theme)
      const grupo = document.querySelector('.perfil .unit-toggle')
      expect(getComputedStyle(grupo).borderTopWidth, theme).toBe('0px')
      expect(rgb(bg(grupo)), theme).toEqual(rgb(token('--surface')))
      const on = grupo.querySelector(".unit-option[aria-pressed='true']")
      expect(parseFloat(getComputedStyle(on).borderTopLeftRadius), theme).toBeGreaterThanOrEqual(18)
      expect(rgb(bg(on)), theme).toEqual(rgb(token('--text')))
      expect(rgb(parseColor(getComputedStyle(on).color)), theme).toEqual(rgb(token('--bg')))
    }
  })
})

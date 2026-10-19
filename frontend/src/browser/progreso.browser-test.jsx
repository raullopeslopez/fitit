// Progreso, medido donde se pinta. Marcador (DESIGN.md): titular de pantalla a
// 54, las tres vistas en una píldora con la elegida en tinta, y los músculos de
// Evolución como el lienzo los dibuja — contorno de su color sin elegir, relleno
// pastel con tinta negra elegido, en los dos temas.
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
const ink = (el) => parseColor(getComputedStyle(el).color)
// Los cambios de tema de un botón tardan 150 ms en pintarse.
const tema = async (theme) => {
  forceTheme(theme)
  await settle()
  await new Promise((r) => setTimeout(r, 250))
}

async function mountProgreso(user) {
  await mountApp()
  await user.click(await screen.findByRole('button', { name: /^Progreso$/ }, { timeout: 5000 }))
  await vi.waitFor(() => expect(document.querySelector('.prog-tabs')).not.toBeNull(), { timeout: 5000 })
  await settle()
}

describe('Progreso en Marcador', () => {
  it('«Progreso» es titular de pantalla en Bricolage 800 a 54 px', async () => {
    await mountProgreso(userEvent.setup())
    const titulo = document.querySelector('.prog-title')
    expect(titulo.textContent).toBe('Progreso')
    const estilo = getComputedStyle(titulo)
    expect(estilo.fontSize).toBe('54px')
    expect(estilo.fontWeight).toBe('800')
    expect(estilo.fontFamily).toContain('Bricolage Grotesque')
  })

  it('la vista elegida va en tinta', async () => {
    await mountProgreso(userEvent.setup())
    for (const theme of ['light', 'dark']) {
      await tema(theme)
      const on = document.querySelector('.prog-tab.is-active')
      expect(rgb(bg(on)), theme).toEqual(rgb(token('--text')))
      expect(rgb(ink(on)), theme).toEqual(rgb(token('--bg')))
    }
  })

  it('ninguna vista va en tarjeta, y nada se sale por el lado', async () => {
    const user = userEvent.setup()
    await mountProgreso(user)
    for (const nombre of ['Series', 'Ritmo', 'Evolución']) {
      await user.click(screen.getByRole('tab', { name: nombre }))
      await settle()
      const tarjetas = [...document.querySelectorAll("[role='tabpanel'] .card")]
      expect(tarjetas.length, nombre).toBeGreaterThan(0)
      for (const t of tarjetas) {
        expect(bg(t)[3], nombre).toBe(0)
        expect(getComputedStyle(t).borderLeftWidth, nombre).toBe('0px')
        expect(getComputedStyle(t).boxShadow, nombre).toBe('none')
      }
      expect(document.documentElement.scrollWidth, nombre).toBeLessThanOrEqual(window.innerWidth)
    }
  })

  it('un músculo es contorno de su color, y elegido, pastel con tinta negra', async () => {
    const user = userEvent.setup()
    await mountProgreso(user)
    await user.click(screen.getByRole('tab', { name: 'Evolución' }))
    const hombro = await screen.findByRole('button', { name: 'Hombro' }, { timeout: 5000 })
    for (const theme of ['light', 'dark']) {
      await tema(theme)
      const estilo = getComputedStyle(hombro)
      expect(bg(hombro)[3], theme).toBe(0)
      expect(parseFloat(estilo.borderTopWidth), theme).toBeGreaterThanOrEqual(1)
      expect(rgb(parseColor(estilo.borderTopColor)), theme).toEqual(rgb(token('--m-hombro')))
    }
    await user.click(hombro)
    for (const theme of ['light', 'dark']) {
      await tema(theme)
      // El pastel del lienzo en los dos temas: es relleno, y encima va negro.
      expect(rgb(bg(hombro)), theme).toEqual([255, 212, 92])
      expect(rgb(ink(hombro)), theme).toEqual([16, 17, 19])
    }
  })
})

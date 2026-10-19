// Entreno en Marcador (DESIGN.md), medido donde se pinta: el ejercicio de
// pantalla no es tarjeta y su nombre es titular; los de hoy, una tira de
// pestañas subrayada en mandarina; las fichas, la cifra sin caja con `−` en
// contorno y `+` relleno; y las series, filas separadas por una raya.
import { afterEach } from 'vitest'

import { mountEntreno } from './screen.jsx'
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

describe('Entreno en Marcador', () => {
  it('el ejercicio de pantalla no es tarjeta, y su nombre es titular', async () => {
    await mountEntreno()
    const hero = document.querySelector('.card-hero')
    const estilo = getComputedStyle(hero)
    expect(estilo.backgroundImage).toBe('none')
    expect(bg(hero)[3]).toBe(0)
    expect(estilo.borderLeftWidth).toBe('0px')
    expect(estilo.boxShadow).toBe('none')
    const nombre = getComputedStyle(hero.querySelector('.card-name'))
    expect(nombre.fontSize).toBe('41.6px')
    expect(nombre.fontWeight).toBe('800')
    expect(nombre.fontFamily).toContain('Bricolage Grotesque')
  })

  it('los de hoy son pestañas: la de pantalla, subrayada en mandarina', async () => {
    await mountEntreno()
    for (const theme of ['light', 'dark']) {
      await tema(theme)
      for (const chip of document.querySelectorAll('.strip-chip')) {
        expect(bg(chip)[3], theme).toBe(0)
        expect(getComputedStyle(chip).borderTopWidth, theme).toBe('0px')
      }
      const actual = getComputedStyle(document.querySelector(".strip-chip[aria-current='true']"))
      expect(actual.borderBottomWidth, theme).toBe('3px')
      expect(rgb(parseColor(actual.borderBottomColor)), theme).toEqual(rgb(token('--accent')))
    }
  })

  it('las fichas son la cifra sin caja, con − en contorno y + relleno', async () => {
    await mountEntreno()
    for (const theme of ['light', 'dark']) {
      await tema(theme)
      const ficha = document.querySelector('.log-form-tiles .stepper')
      expect(bg(ficha)[3], theme).toBe(0)
      expect(getComputedStyle(ficha).borderTopWidth, theme).toBe('0px')
      const [menos, mas] = ficha.querySelectorAll('.stepper-btn')
      expect(bg(menos)[3], theme).toBe(0)
      expect(parseFloat(getComputedStyle(menos).borderTopWidth), theme).toBeGreaterThanOrEqual(1)
      expect(parseFloat(getComputedStyle(menos).borderTopLeftRadius), theme).toBeGreaterThanOrEqual(22)
      expect(rgb(bg(mas)), theme).toEqual(rgb(token('--surface-raised')))
      expect(rgb(parseColor(getComputedStyle(mas).color)), theme).toEqual(rgb(token('--accent-ink')))
      expect(mas.getBoundingClientRect().height, theme).toBeGreaterThanOrEqual(44)
    }
  })

  it('las series son filas separadas por una raya, sin bandas alternas', async () => {
    await mountEntreno()
    const filas = [...document.querySelectorAll('.card-hero .set-log > li')]
    expect(filas.length).toBeGreaterThan(1)
    for (const fila of filas) expect(bg(fila)[3]).toBe(0)
    expect(parseFloat(getComputedStyle(filas[1]).borderTopWidth)).toBeGreaterThanOrEqual(1)
  })
})

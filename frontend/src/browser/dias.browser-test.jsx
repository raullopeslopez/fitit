// Días, medido donde se pinta. Marcador (DESIGN.md): titular de pantalla a 54,
// el nombre de cada entreno como titular de fila, y los músculos en la paleta
// del lienzo — pastel sobre Carbón, la versión honda sobre Tiza — con la celda
// vacía rellena de raya en vez de un contorno.
import { afterEach } from 'vitest'

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
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))

async function mountDias() {
  await mountApp()
  await vi.waitFor(() => expect(document.querySelector('.day-session-name')).not.toBeNull(), {
    timeout: 5000,
  })
  await settle()
}

// El lienzo, página Paleta: [token, pastel, honda].
const MUSCULOS = [
  ['pecho', '#FF9B7A', '#D9542B'],
  ['espalda', '#8FD3FF', '#1F7FC0'],
  ['hombro', '#FFD45C', '#B58700'],
  ['biceps', '#B9A7FF', '#6B52D9'],
  ['triceps', '#F7A8D8', '#C2438C'],
  ['cuadriceps', '#C6F36B', '#4F8F12'],
  ['femoral', '#9BE7C4', '#1E8F63'],
  ['gluteo', '#FFB86B', '#C46A12'],
  ['gemelo', '#7FE0E8', '#138E99'],
  ['core', '#E8E2D0', '#7D776A'],
]

describe('Días en Marcador', () => {
  it('«Historial» es titular de pantalla en Bricolage 800 a 54 px', async () => {
    await mountDias()
    const titulo = document.querySelector('.days-title')
    expect(titulo.textContent).toBe('Historial')
    const estilo = getComputedStyle(titulo)
    expect(estilo.fontSize).toBe('54px')
    expect(estilo.fontWeight).toBe('800')
    expect(estilo.fontFamily).toContain('Bricolage Grotesque')
  })

  it('el nombre del entreno es titular de fila', async () => {
    await mountDias()
    const estilo = getComputedStyle(document.querySelector('.day-session-name'))
    expect(estilo.fontSize).toBe('18.4px')
    expect(estilo.fontWeight).toBe('800')
    expect(estilo.fontFamily).toContain('Bricolage Grotesque')
  })

  it('los músculos van en pastel sobre Carbón y en su versión honda sobre Tiza', async () => {
    await mountDias()
    for (const [theme, col] of [
      ['dark', 1],
      ['light', 2],
    ]) {
      forceTheme(theme)
      await settle()
      for (const m of MUSCULOS) {
        expect(rgb(token(`--m-${m[0]}`)), `${theme} ${m[0]}`).toEqual(hex(m[col]))
      }
    }
  })

  it('una celda sin series es raya rellena, no un contorno', async () => {
    await mountDias()
    for (const theme of ['light', 'dark']) {
      forceTheme(theme)
      await settle()
      const vacia = document.querySelector('.day-cell.is-empty')
      const estilo = getComputedStyle(vacia)
      expect(estilo.boxShadow, theme).toBe('none')
      expect(rgb(parseColor(estilo.backgroundColor)), theme).toEqual(rgb(token('--border')))
    }
  })
})

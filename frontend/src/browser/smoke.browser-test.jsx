// Que el banco existe antes de creerse una sola medida suya.
//
// No comprueba el editor: comprueba que lo que hay debajo de las pruebas de
// geometría es un navegador de verdad y no otro mundo falso. Si esto se cae, lo
// verde de al lado no significa nada.
import { afterEach } from 'vitest'

import { mountEntreno, mountProgreso } from './screen.jsx'
import { clearForcedTheme, forceTheme } from './geometry.js'

afterEach(() => clearForcedTheme())

describe('el banco de navegador', () => {
  it('mide 430x932 y maqueta de verdad', async () => {
    await mountEntreno()
    expect(window.innerWidth).toBe(430)
    expect(window.innerHeight).toBe(932)
    // Lo que jsdom no puede dar: una caja con tamaño.
    const card = document.querySelector('.card')
    expect(card.getBoundingClientRect().height).toBeGreaterThan(0)
    // Y una página con recorrido, que es la condición de todo barrido.
    expect(document.documentElement.scrollHeight).toBeGreaterThan(window.innerHeight)
  })

  it('la barra de pestañas es fija, está delante y no es inert', async () => {
    await mountEntreno()
    const nav = document.querySelector('nav.bottom-nav')
    const cs = getComputedStyle(nav)
    expect(cs.position).toBe('fixed')
    expect(Number(cs.zIndex)).toBe(10)
    expect(nav.hasAttribute('inert')).toBe(false)
    // Pegada al pie del viewport: es contra este canto contra el que se mide
    // «debajo de la barra».
    expect(nav.getBoundingClientRect().bottom).toBeCloseTo(window.innerHeight, 0)
  })

  it('el tema se puede fijar en los dos sentidos, leyendo la hoja de verdad', async () => {
    await mountEntreno()
    const bg = () => getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    forceTheme('dark')
    expect(bg()).toBe('#0b0c0e')
    forceTheme('light')
    expect(bg()).toBe('#f4f2ee')
  })

  it('Progreso llega con la gráfica dibujada y su puerta al editor', async () => {
    await mountProgreso()
    expect(document.querySelector('svg.chart[data-editor-protect]')).not.toBeNull()
    expect(document.querySelector('button.unit-fix.exercise-edit')).not.toBeNull()
  })
})

// La cabecera del entreno, medida con el color realmente pintado.
//
// «← Días» era una píldora ámbar rellena (PR #25). Con eso la pantalla tenía
// tres rellenos ámbar a la vez —volver, «Añadir ejercicio», «Registrar serie»—
// y el de volver pesaba igual que el de registrar. DESIGN.md: cuando una acción
// rara y una por serie compiten, gana la por serie. Volver sigue siendo ámbar,
// pero en tinta: se reconoce sin disputarle el relleno a nadie.
import { expect, test } from 'vitest'

import { settle } from './geometry.js'
import { mountEntreno } from './screen.jsx'

const TRANSPARENT = 'rgba(0, 0, 0, 0)'

// El token resuelto por el propio navegador: pintado en una sonda y leído de vuelta.
const token = (name) => {
  const probe = document.createElement('span')
  probe.style.color = getComputedStyle(document.documentElement).getPropertyValue(name)
  document.body.appendChild(probe)
  const value = getComputedStyle(probe).color
  probe.remove()
  return value
}

test('«← Días» va en tinta ámbar, sin relleno, y sigue siendo tocable', async () => {
  const { container, restore } = await mountEntreno()
  try {
    await settle()
    const back = container.querySelector('.head-back')
    expect(back).toBeTruthy()
    const style = getComputedStyle(back)
    expect(style.backgroundColor).toBe(TRANSPARENT)
    expect(style.color).toBe(token('--accent-ink'))
    expect(back.getBoundingClientRect().height).toBeGreaterThanOrEqual(36)
  } finally {
    restore()
  }
})

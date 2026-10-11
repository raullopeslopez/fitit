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

// Descansando, el anillo ocupa el centro y las fichas se compactan. Lo que no
// puede pasar es que eso empuje «Registrar» debajo del pie: la serie siguiente
// pediría desplazar antes de poder tocarla, que es un toque de más por serie.
test('descansando, «Registrar» se ve entero por encima del pie, sin desplazar', async () => {
  const { container, restore } = await mountEntreno({ restSeconds: 80 })
  try {
    // El caso peor del pie: con la fila «↩ anterior», que aparece en cuanto has
    // ido a otro ejercicio y vuelto (un superset).
    container.querySelector('#exercise').focus()
    await settle()
    container.querySelector('.dock-today .set-row').click()
    await settle()
    container.querySelector('.dock-shortcut').click()
    await settle()
    expect(container.querySelector('.dock-shortcut')).toBeTruthy()
    window.scrollTo(0, 0)
    await settle()
    expect(container.querySelector('.rest-ring')).toBeTruthy()
    const log = container.querySelector('.btn-log').getBoundingClientRect()
    const dock = container.querySelector('.workout-dock').getBoundingClientRect()
    expect(log.bottom).toBeLessThanOrEqual(dock.top + 1)
  } finally {
    restore()
  }
})

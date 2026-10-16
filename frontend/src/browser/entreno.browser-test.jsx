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

// La serie abierta para corregir ocupa el ancho de la lista, igual que las filas
// cerradas: con `width: 100%` y márgenes negativos se quedaba corta por la
// derecha y dejaba un hueco que se leía como un error. Y «+ Nota» es una acción
// en tinta ámbar, como «← Días», no una etiqueta en gris.
test('la serie abierta llega a los dos bordes de la lista, y «+ Nota» va en ámbar', async () => {
  const { container, restore } = await mountEntreno()
  try {
    container.querySelector('.set-log button.set-row').click()
    await settle()
    const edit = container.querySelector('.set-edit')
    expect(edit).toBeTruthy()
    const list = container.querySelector('.set-log').getBoundingClientRect()
    const box = edit.getBoundingClientRect()
    expect(Math.abs(box.left - list.left)).toBeLessThanOrEqual(1)
    expect(Math.abs(box.right - list.right)).toBeLessThanOrEqual(1)
    const head = edit.querySelector('.set-row').getBoundingClientRect()
    expect(Math.abs(head.right - (box.right - 8))).toBeLessThanOrEqual(1)
    const note = [...edit.querySelectorAll('button')].find((b) => b.textContent === '+ Nota')
    expect(getComputedStyle(note).color).toBe(token('--accent-ink'))
  } finally {
    restore()
  }
})

// La tira: chips de 44 px, en una sola fila que se desliza de lado, sin sacar la
// página de su ancho. Tocar uno lleva a él.
test('la tira de los de hoy es una fila tocable que no ensancha la página', async () => {
  const { container, restore } = await mountEntreno()
  try {
    const chips = [...container.querySelectorAll('.workout-strip .strip-chip')]
    expect(chips.length).toBeGreaterThan(1)
    const tops = new Set(chips.map((c) => Math.round(c.getBoundingClientRect().top)))
    expect(tops.size).toBe(1)
    for (const c of chips) expect(c.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
    const other = chips.find((c) => !c.hasAttribute('aria-current'))
    const name = other.querySelector('.strip-name').textContent
    other.click()
    await settle()
    expect(container.querySelector('.card-toggle .card-name').textContent.trim()).toBe(name)
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
    // El caso peor: la tira de los de hoy arriba, que roba alto a todo lo
    // demás, y el pie con su atajo.
    expect(container.querySelectorAll('.workout-strip .strip-chip').length).toBeGreaterThan(1)
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

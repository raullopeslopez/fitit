// La cabecera del peso y su botón flotante, medidos donde jsdom no llega.
//
// Tres cosas de esta pantalla no se pueden comprobar sin motor de maquetación:
//
//   1. **Con qué tinta se pinta la cifra.** La regla de la casa dice que lo
//      desconocido se imprime con la misma tinta que un número y nunca en
//      `--muted`. En jsdom `getComputedStyle` devuelve el valor declarado, no
//      el resuelto: `var(--text)` y `var(--muted)` son dos cadenas distintas y
//      ninguna es un color, así que allí la comparación no dice nada.
//      El guion y la cifra comparten clase —`.weight-kg` no se bifurca—, de
//      modo que medir la tinta de la clase mide la del guion.
//   2. **Que quepa en un móvil de 430 px** y que el botón flotante llegue a los
//      44 px de área táctil que DESIGN.md exige a todo control.
//   3. **Que el botón flotante no tape `Salir`.** Flota sobre la lista, y lo
//      último de la columna tiene que poder subir por encima de él.
import { expect, test } from 'vitest'

import { settle } from './geometry.js'
import { mountPerfil } from './screen.jsx'

const rgb = (el) => getComputedStyle(el).color

test('la cifra del peso lleva la tinta de la pantalla, no la de una nota', async () => {
  const { container, restore } = await mountPerfil()
  try {
    await settle()
    const figura = container.querySelector('.weight-kg')
    // El título de una sección es la tinta de la pantalla, resuelta por el
    // navegador en el tema que esté puesto.
    const titulo = container.querySelector('.perfil-seccion h2')
    const sello = container.querySelector('.weight-stamp')

    expect(figura).toBeTruthy()
    expect(rgb(figura)).toBe(rgb(titulo))
    expect(rgb(figura)).not.toBe(rgb(sello))
  } finally {
    restore()
  }
})

test('la cabecera cabe en el móvil y el botón flotante se puede tocar', async () => {
  const { container, restore } = await mountPerfil()
  try {
    await settle()
    const card = container.querySelector('.weight-card')
    const fab = document.querySelector('.ui-fab')

    expect(card.getBoundingClientRect().width).toBeLessThanOrEqual(430)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(430)
    expect(fab.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    // La curva y la cifra comparten fila sin pisarse.
    const cifra = container.querySelector('.weight-figure').getBoundingClientRect()
    const curva = container.querySelector('.weight-spark').getBoundingClientRect()
    expect(cifra.right).toBeLessThanOrEqual(curva.left + 1)
  } finally {
    restore()
  }
})

test('al final de la pantalla, Salir queda por encima del botón flotante', async () => {
  const { container, restore } = await mountPerfil()
  try {
    await settle()
    window.scrollTo(0, document.documentElement.scrollHeight)
    await settle()
    const salir = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Salir')
    const fab = document.querySelector('.ui-fab').getBoundingClientRect()
    const rect = salir.getBoundingClientRect()

    expect(rect.bottom).toBeLessThanOrEqual(fab.top)
  } finally {
    restore()
  }
})

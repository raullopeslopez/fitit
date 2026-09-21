// El peso, medido donde jsdom no llega.
//
// Dos cosas de esta tarjeta no se pueden comprobar sin motor de maquetación:
//
//   1. **Con qué tinta se pinta la cifra.** La regla de la casa dice que lo
//      desconocido se imprime con la misma tinta que un número y nunca en
//      `--muted`. En jsdom `getComputedStyle` devuelve el valor declarado, no
//      el resuelto: `var(--text)` y `var(--muted)` son dos cadenas distintas y
//      ninguna es un color, así que allí la comparación no dice nada.
//      El guion y la cifra comparten clase —`.weight-kg` no se bifurca—, de
//      modo que medir la tinta de la clase mide la del guion.
//   2. **Que quepa en un móvil de 430 px** y que el botón llegue a los 44 px
//      de área táctil que DESIGN.md exige a todo control.
import { expect, test } from 'vitest'

import { settle } from './geometry.js'
import { mountProgreso } from './screen.jsx'

const rgb = (el) => getComputedStyle(el).color

test('la cifra del peso lleva la tinta de la pantalla, no la de una nota', async () => {
  const { container, restore } = await mountProgreso()
  try {
    await settle()
    const figura = container.querySelector('.weight-kg')
    const titulo = container.querySelector('.weight-card h2')
    const sello = container.querySelector('.weight-stamp')

    expect(figura).toBeTruthy()
    // Contra el título de su propia tarjeta: la tinta de la pantalla, resuelta
    // por el navegador en el tema que esté puesto.
    expect(rgb(figura)).toBe(rgb(titulo))
    expect(rgb(figura)).not.toBe(rgb(sello))
  } finally {
    restore()
  }
})

test('la tarjeta cabe en el móvil y el botón se puede tocar', async () => {
  const { container, restore } = await mountProgreso()
  try {
    await settle()
    const card = container.querySelector('.weight-card')
    const boton = container.querySelector('.weight-save')
    const input = container.querySelector('.weight-input')

    expect(card.getBoundingClientRect().width).toBeLessThanOrEqual(430)
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(430)
    expect(boton.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    // Comparten fila sin pisarse.
    expect(input.getBoundingClientRect().right).toBeLessThanOrEqual(
      boton.getBoundingClientRect().left + 1,
    )
  } finally {
    restore()
  }
})

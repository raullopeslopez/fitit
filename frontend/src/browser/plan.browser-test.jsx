// Plan, medido donde se pinta. Marcador (DESIGN.md): sin tarjetas — el titular
// de pantalla a 54, la semana se elige en una píldora con la opción en tinta, la
// tira y los días sin caja, y «Cómo va la semana» es un aviso en oro, no una
// tarjeta tonal. Todo eso es color y geometría: jsdom no lo ve.
import { afterEach } from 'vitest'

import { mountPlan } from './screen.jsx'
import { foodDayIso } from '../food.js'
import { lunesDe } from '../Plan.jsx'
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
// Transparente: sin caja que pintar.
const sinFondo = (el) => bg(el)[3] === 0

// Una semana con un plato hoy y la cena como el sitio donde se cae.
const conPlan = () => {
  const hoy = foodDayIso()
  return [
    [/\/plans\/\d{4}-\d{2}-\d{2}\/adherence$/, { weakest_slot: 'cena', days: 0, decided: 0, pending: 0 }],
    [
      /\/plans\/\d{4}-\d{2}-\d{2}$/,
      {
        id: 1,
        week_start: lunesDe(hoy),
        entries: [
          {
            id: 50,
            log_date: hoy,
            slot: 'cena',
            dish_id: 70,
            dish_name: 'Salmón al horno',
            items: [],
            kcal: 600,
            protein: 40,
            carbs: 30,
            fat: 25,
            carbs_shift: null,
            status: null,
            log_entry_id: null,
          },
        ],
      },
    ],
  ]
}

describe('Plan en Marcador', () => {
  it('«Plan» es titular de pantalla, con la semana en sello a su derecha', async () => {
    await mountPlan({ routes: conPlan() })
    const titulo = document.querySelector('.plan-title')
    const estilo = getComputedStyle(titulo)
    expect(estilo.fontSize).toBe('54px')
    expect(estilo.fontWeight).toBe('800')
    expect(estilo.fontFamily).toContain('Bricolage Grotesque')
    const sello = document.querySelector('.plan-head .card-eyebrow').getBoundingClientRect()
    const t = titulo.getBoundingClientRect()
    expect(sello.left).toBeGreaterThan(t.right)
    expect(sello.bottom).toBeGreaterThan(t.top)
  })

  it('la semana se elige en una píldora, y la elegida va en tinta', async () => {
    await mountPlan({ routes: conPlan() })
    for (const theme of ['light', 'dark']) {
      forceTheme(theme)
      await settle()
      await new Promise((r) => setTimeout(r, 250))
      const seg = document.querySelector('.seg')
      expect(getComputedStyle(seg).borderTopWidth, theme).toBe('0px')
      expect(rgb(bg(seg)), theme).toEqual(rgb(token('--surface')))
      const on = document.querySelector('.seg-btn.is-on')
      expect(parseFloat(getComputedStyle(on).borderTopLeftRadius)).toBeGreaterThanOrEqual(22)
      expect(rgb(bg(on)), theme).toEqual(rgb(token('--text')))
      expect(rgb(parseColor(getComputedStyle(on).color)), theme).toEqual(rgb(token('--bg')))
      expect(sinFondo(document.querySelector('.seg-btn:not(.is-on)')), theme).toBe(true)
    }
  })

  it('los días son filas, no cajas: separadas por una raya', async () => {
    await mountPlan({ routes: conPlan() })
    const filas = [...document.querySelectorAll('.semana-dia')]
    expect(filas).toHaveLength(7)
    for (const fila of filas) {
      expect(sinFondo(fila)).toBe(true)
      expect(parseFloat(getComputedStyle(fila.closest('.plan-dia')).borderTopWidth)).toBeGreaterThanOrEqual(1)
    }
    expect(sinFondo(document.querySelector('.plan-dia.is-today'))).toBe(true)
  })

  it('«Cómo va la semana» es un aviso en oro bajo una raya, no una tarjeta', async () => {
    await mountPlan({ routes: conPlan() })
    const aviso = await vi.waitFor(() => {
      const el = document.querySelector('.plan-adherencia.is-tonal')
      expect(el).not.toBeNull()
      return el
    })
    for (const theme of ['light', 'dark']) {
      forceTheme(theme)
      await settle()
      expect(sinFondo(aviso), theme).toBe(true)
      expect(parseFloat(getComputedStyle(aviso).borderTopWidth), theme).toBeGreaterThanOrEqual(1)
      const sello = aviso.querySelector('.card-eyebrow')
      expect(rgb(parseColor(getComputedStyle(sello).color)), theme).toEqual(rgb(token('--pr')))
    }
  })
})

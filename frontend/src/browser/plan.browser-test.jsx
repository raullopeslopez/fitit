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
  // Las dos semanas van seguidas: cada una abre con su titular de sección y su
  // rango en sello a la derecha.
  it('«Semana» es titular de pantalla, y cada semana lleva su rango a la derecha', async () => {
    await mountPlan({ routes: conPlan() })
    const titulo = document.querySelector('.plan-title')
    const estilo = getComputedStyle(titulo)
    expect(estilo.fontSize).toBe('54px')
    expect(estilo.fontWeight).toBe('800')
    expect(estilo.fontFamily).toContain('Bricolage Grotesque')
    const sello = document.querySelector('#semana-esta .seccion-head .card-eyebrow').getBoundingClientRect()
    const t = document.querySelector('#semana-esta .seccion-titulo').getBoundingClientRect()
    expect(sello.left).toBeGreaterThan(t.right)
    expect(sello.bottom).toBeGreaterThan(t.top)
  })

  it('el índice es una píldora, y la semana en la que estás va en tinta', async () => {
    await mountPlan({ routes: conPlan() })
    for (const theme of ['light', 'dark']) {
      forceTheme(theme)
      await settle()
      await new Promise((r) => setTimeout(r, 250))
      const seg = document.querySelector('.indice-pildoras')
      expect(getComputedStyle(seg).borderTopWidth, theme).toBe('0px')
      expect(rgb(bg(seg)), theme).toEqual(rgb(token('--surface')))
      const on = document.querySelector('.indice-btn.is-on')
      expect(parseFloat(getComputedStyle(on).borderTopLeftRadius)).toBeGreaterThanOrEqual(22)
      expect(rgb(bg(on)), theme).toEqual(rgb(token('--text')))
      expect(rgb(parseColor(getComputedStyle(on).color)), theme).toEqual(rgb(token('--bg')))
      expect(sinFondo(document.querySelector('.indice-btn:not(.is-on)')), theme).toBe(true)
    }
  })

  // Comida simple: la semana es una cuadrícula; cada día, un objetivo de dedo.
  it('la cuadrícula cabe en el móvil, y cada día se toca', async () => {
    await mountPlan({ routes: conPlan() })
    const dias = [...document.querySelectorAll('#semana-esta .semana-rejilla-dia')]
    expect(dias).toHaveLength(7)
    for (const dia of dias) {
      const box = dia.getBoundingClientRect()
      expect(box.height, dia.getAttribute('aria-label')).toBeGreaterThanOrEqual(44)
    }
    for (const casilla of document.querySelectorAll('.semana-rejilla .semana-casilla')) {
      expect(casilla.getBoundingClientRect().right).toBeLessThanOrEqual(window.innerWidth)
    }
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth)
  })

  it('la compra es una banda a sangre, y «Preparar» es su acción', async () => {
    await mountPlan({ routes: conPlan() })
    const banda = await vi.waitFor(() => {
      const el = document.querySelector('.semana-compra')
      expect(el).not.toBeNull()
      return el
    })
    for (const theme of ['light', 'dark']) {
      forceTheme(theme)
      await settle()
      await new Promise((r) => setTimeout(r, 250))
      expect(rgb(bg(banda)), theme).toEqual(rgb(token('--surface')))
      const caja = banda.getBoundingClientRect()
      expect(Math.round(caja.width), theme).toBe(window.innerWidth)
      const ir = banda.querySelector('.semana-compra-ir')
      expect(rgb(bg(ir)), theme).toEqual(rgb(token('--accent')))
      expect(ir.getBoundingClientRect().height).toBeGreaterThanOrEqual(44)
    }
  })
})

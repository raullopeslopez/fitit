// La escala tipográfica de DESIGN.md, vigilada contra la hoja de estilos.
//
// La auditoría de 2026-09-26 contó 26 tamaños distintos donde el documento
// define 8, y texto en minúscula a 10.4–12.48px donde el documento dice «nada
// que se lea como frase por debajo de Label, sin excepciones». Ninguno de esos
// tamaños rompió un test, porque ningún test miraba: este mira.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(process.cwd(), 'src')

const css = readFileSync(resolve(SRC, 'styles.css'), 'utf8')

// DESIGN.md → Typography → Scale. `2.6rem` es la cifra del día: una por
// pantalla, la que se lee de lejos (objetivo de hoy, kcal, la del arranque en frío).
const SCALE = new Set(['2.6rem', '1.6rem', '1.4rem', '1.15rem', '1rem', '0.85rem', '0.8rem', '0.7rem'])

// Glifos: se dimensionan como iconos, no como texto. Un chevron, una × o un
// ✓ no tienen «tamaño de lectura», tienen el del hueco que ocupan.
const GLYPHS = new Set([
  '.head-menu-btn.head-menu-btn',
  '.rep-icon',
  '.unit-fix.exercise-edit::after',
  '.editor-more::after',
  '.editor-row-picker::after',
  '.editor-back-arrow',
  '.editor-close',
  '.stepper-btn',
  '.link-row::after',
  'button.idea-to-dish > span',
  '.idea-saved-tick',
  '.plan-plato-chev',
])

function blocks() {
  const out = []
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const m of stripped.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim().replace(/\s+/g, ' ')
    const size = m[2].match(/font-size:\s*([^;]+);/)
    if (size) out.push({ selector, size: size[1].trim(), body: m[2] })
  }
  return out
}

describe('escala tipográfica', () => {
  it('todo font-size es un paso de la escala, o un glifo con nombre', () => {
    const fuera = blocks()
      .filter((b) => !SCALE.has(b.size) && !GLYPHS.has(b.selector))
      .map((b) => `${b.size}  ${b.selector}`)
    expect(fuera).toEqual([])
  })

  it('por debajo de Label sólo hay Micro, y Micro no se usa para prosa en minúscula', () => {
    const rem = (v) => parseFloat(v)
    const bajo = blocks()
      .filter((b) => !GLYPHS.has(b.selector) && rem(b.size) < 0.8 && b.size !== '0.7rem')
      .map((b) => `${b.size}  ${b.selector}`)
    expect(bajo).toEqual([])
  })

  // Micro es de sellos, y un sello no tiene minúsculas. Lo normal es que la
  // regla lo diga ella misma (`text-transform: uppercase`); estos otros lo
  // cumplen por su texto, que el JSX ya escribe en mayúsculas o en cifras
  // (`ESTA SEMANA`, ` SER`, `S 1`, `35 × 15`, `MIN`). Añadir uno aquí es
  // afirmar eso de su texto: «3 de 5 cifras» o «Falta: …» no entran.
  const STAMPS_BY_CONTENT = new Set([
    '.week-label',
    '.week-totals',
    '.day-rest-label',
    '.day-count-unit',
    '.chart-point-label',
    '.rhythm-months, .rhythm-weeks',
    '.set-ix',
    '.idea-min small',
  ])

  it('Micro sólo lo llevan sellos: en mayúsculas por la hoja, o por su texto', () => {
    const prosa = blocks()
      .filter((b) => b.size === '0.7rem' && !/uppercase/.test(b.body))
      .filter((b) => !STAMPS_BY_CONTENT.has(b.selector))
      .map((b) => b.selector)
    expect(prosa).toEqual([])
  })

  it('la gráfica de Progreso no fija tamaños en el SVG: los pone la hoja', () => {
    const jsx = readFileSync(resolve(SRC, 'Progress.jsx'), 'utf8')
    expect(jsx).not.toMatch(/fontSize=/)
  })
})

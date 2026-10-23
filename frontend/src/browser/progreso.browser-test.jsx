// Progreso, medido donde se pinta. Marcador (DESIGN.md): titular de pantalla a
// 54, las tres secciones seguidas con su índice en píldora (la de la sección
// por la que pasas en tinta, pegada arriba al desplazarte), y los músculos de
// Evolución como el lienzo los dibuja — contorno de su color sin elegir, relleno
// pastel con tinta negra elegido, en los dos temas.
import { afterEach, onTestFinished } from 'vitest'

import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { instalarEntradaSecciones } from '../movimientoSecciones.js'
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
const bg = (el) => parseColor(getComputedStyle(el).backgroundColor)
const ink = (el) => parseColor(getComputedStyle(el).color)
// Los cambios de tema de un botón tardan 150 ms en pintarse.
const tema = async (theme) => {
  forceTheme(theme)
  await settle()
  await new Promise((r) => setTimeout(r, 250))
}

async function mountProgreso(user) {
  await mountApp()
  await user.click(await screen.findByRole('button', { name: /^Progreso$/ }, { timeout: 5000 }))
  await vi.waitFor(() => expect(document.querySelector('.indice')).not.toBeNull(), { timeout: 5000 })
  await settle()
}

describe('Progreso en Marcador', () => {
  // El índice: pegado arriba al desplazarte, y tocar una píldora deja su
  // sección justo debajo de él, marcada.
  it('el índice se queda arriba y salta a cada sección', async () => {
    const user = userEvent.setup()
    await mountProgreso(user)
    await vi.waitFor(() => expect(document.querySelector('.weight-card')).not.toBeNull())
    await settle()
    window.scrollTo(0, 600)
    await settle()
    const indice = document.querySelector('.indice')
    expect(Math.abs(indice.getBoundingClientRect().top)).toBeLessThanOrEqual(1)

    window.scrollTo(0, 0)
    await settle()
    await user.click(screen.getByRole('button', { name: 'Cuerpo' }))
    await vi.waitFor(
      () => {
        const bajo = document.querySelector('.indice').getBoundingClientRect().bottom
        const cuerpo = document.getElementById('prog-cuerpo').getBoundingClientRect().top
        const alFondo = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2
        // O queda bajo el índice, o la página ya no da para subirla más.
        expect(alFondo || Math.abs(cuerpo - bajo) < 24).toBe(true)
      },
      { timeout: 3000 },
    )
    await new Promise((r) => setTimeout(r, 800))
    expect(screen.getByRole('button', { name: 'Cuerpo' })).toHaveAttribute('aria-current', 'true')
    // Por encima del índice no asoma nada de lo desplazado: tiene fondo.
    expect(bg(document.querySelector('.indice'))[3]).toBe(1)
  })

  // Lo que empieza fuera de la pantalla espera escondido y entra al asomar.
  it('una sección de abajo entra al asomar', async () => {
    const user = userEvent.setup()
    // main.jsx lo instala para toda la app; aquí, para este caso.
    const quitar = instalarEntradaSecciones()
    onTestFinished(quitar)
    // La prueba de antes deja la página desplazada: arriba, como al abrirla.
    window.scrollTo(0, 0)
    await mountProgreso(user)
    await vi.waitFor(() => expect(document.querySelector('.weight-card')).not.toBeNull())
    await settle()
    const peso = document.querySelector('.weight-card')
    expect(peso.getBoundingClientRect().top).toBeGreaterThan(window.innerHeight)
    await vi.waitFor(() => expect(peso.dataset.entrada).toBe('espera'))
    expect(getComputedStyle(peso).opacity).toBe('0')
    peso.scrollIntoView({ block: 'center' })
    await vi.waitFor(() => expect(peso.dataset.entrada).toBe('entra'))
    await new Promise((r) => setTimeout(r, 450))
    expect(getComputedStyle(peso).opacity).toBe('1')
  })

  it('«Progreso» es titular de pantalla en Bricolage 800 a 54 px', async () => {
    await mountProgreso(userEvent.setup())
    const titulo = document.querySelector('.prog-title')
    expect(titulo.textContent).toBe('Progreso')
    const estilo = getComputedStyle(titulo)
    expect(estilo.fontSize).toBe('54px')
    expect(estilo.fontWeight).toBe('800')
    expect(estilo.fontFamily).toContain('Bricolage Grotesque')
  })

  it('la sección en la que estás va en tinta', async () => {
    await mountProgreso(userEvent.setup())
    for (const theme of ['light', 'dark']) {
      await tema(theme)
      const on = document.querySelector('.indice-btn.is-on')
      expect(rgb(bg(on)), theme).toEqual(rgb(token('--text')))
      expect(rgb(ink(on)), theme).toEqual(rgb(token('--bg')))
    }
  })

  it('ninguna sección va en tarjeta, y nada se sale por el lado', async () => {
    const user = userEvent.setup()
    await mountProgreso(user)
    for (const nombre of ['Ejercicio', 'Músculos', 'Cuerpo']) {
      const id = { Ejercicio: 'prog-ejercicio', Músculos: 'prog-musculos', Cuerpo: 'prog-cuerpo' }[nombre]
      await settle()
      const tarjetas = [...document.querySelectorAll(`#${id} .card`)]
      // Cuerpo abre con el peso, que es banda y no tarjeta.
      if (nombre !== 'Cuerpo') expect(tarjetas.length, nombre).toBeGreaterThan(0)
      for (const t of tarjetas) {
        expect(bg(t)[3], nombre).toBe(0)
        expect(getComputedStyle(t).borderLeftWidth, nombre).toBe('0px')
        expect(getComputedStyle(t).boxShadow, nombre).toBe('none')
      }
      expect(document.documentElement.scrollWidth, nombre).toBeLessThanOrEqual(window.innerWidth)
    }
  })

  it('en Cuerpo, el peso es una banda a sangre: de canto a canto y sin esquinas', async () => {
    const user = userEvent.setup()
    await mountProgreso(user)
    await vi.waitFor(() => expect(document.querySelector('.weight-card')).not.toBeNull())
    await settle()
    const banda = document.querySelector('.weight-card')
    const r = banda.getBoundingClientRect()
    expect(r.left).toBe(0)
    expect(r.right).toBe(window.innerWidth)
    expect(getComputedStyle(banda).borderTopLeftRadius).toBe('0px')
  })

  it('un músculo es contorno de su color, y elegido, pastel con tinta negra', async () => {
    const user = userEvent.setup()
    await mountProgreso(user)
    const hombro = await screen.findByRole('button', { name: 'Hombro' }, { timeout: 5000 })
    for (const theme of ['light', 'dark']) {
      await tema(theme)
      const estilo = getComputedStyle(hombro)
      expect(bg(hombro)[3], theme).toBe(0)
      expect(parseFloat(estilo.borderTopWidth), theme).toBeGreaterThanOrEqual(1)
      expect(rgb(parseColor(estilo.borderTopColor)), theme).toEqual(rgb(token('--m-hombro')))
    }
    await user.click(hombro)
    for (const theme of ['light', 'dark']) {
      await tema(theme)
      // El pastel del lienzo en los dos temas: es relleno, y encima va negro.
      expect(rgb(bg(hombro)), theme).toEqual([255, 212, 92])
      expect(rgb(ink(hombro)), theme).toEqual([16, 17, 19])
    }
  })
})

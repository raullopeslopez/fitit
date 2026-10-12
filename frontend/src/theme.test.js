import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { applyTheme, getThemePref, setThemePref, watchSystemTheme } from './theme.js'
import { setSystemBarsTheme } from './platform/systemBars.js'

vi.mock('./platform/systemBars.js', () => ({ setSystemBarsTheme: vi.fn() }))

// Un `matchMedia` de mentira cuyo «sistema» se puede cambiar a mano.
function fakeSystem(dark) {
  const listeners = new Set()
  const mql = {
    get matches() {
      return dark
    },
    addEventListener: (_type, fn) => listeners.add(fn),
    removeEventListener: (_type, fn) => listeners.delete(fn),
  }
  window.matchMedia = vi.fn(() => mql)
  return {
    set(value) {
      dark = value
      listeners.forEach((fn) => fn())
    },
  }
}

describe('tema', () => {
  beforeEach(() => {
    localStorage.clear()
    delete document.documentElement.dataset.theme
    document.head.innerHTML = `
      <meta name="theme-color" content="#f4f2ee" media="(prefers-color-scheme: light)" />
      <meta name="theme-color" content="#0b0c0e" media="(prefers-color-scheme: dark)" />`
  })

  it('sin elegir nada, sigue al sistema', () => {
    expect(getThemePref()).toBe('system')
  })

  it('se recuerda lo elegido, y lo que no reconoce vuelve a sistema', () => {
    setThemePref('dark')
    expect(getThemePref()).toBe('dark')
    localStorage.setItem('fitit_theme', 'sepia')
    expect(getThemePref()).toBe('system')
  })

  it('con «sistema», pinta lo que diga el teléfono', () => {
    fakeSystem(true)
    applyTheme('system')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('lo elegido gana al sistema, y la barra del navegador va con ello', () => {
    fakeSystem(true)
    applyTheme('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
      expect(meta.getAttribute('content')).toBe('#f4f2ee')
    }
  })

  it('si el sistema cambia, sólo lo sigue quien eligió «sistema»', () => {
    const system = fakeSystem(false)
    const stop = watchSystemTheme()

    applyTheme('system')
    system.set(true)
    expect(document.documentElement.dataset.theme).toBe('dark')

    setThemePref('light')
    applyTheme('light')
    system.set(false)
    system.set(true)
    expect(document.documentElement.dataset.theme).toBe('light')
    stop()
  })

  it('los iconos de las barras del teléfono van con el tema pintado, no con el del sistema', () => {
    fakeSystem(true)
    applyTheme('light')
    expect(setSystemBarsTheme).toHaveBeenLastCalledWith('light')
    applyTheme('system')
    expect(setSystemBarsTheme).toHaveBeenLastCalledWith('dark')
  })

  // Sin `viewport-fit=cover`, Capacitor encoge la WebView para dejar sitio a
  // las barras del teléfono y ese hueco se pinta gris, no del fondo de la app.
  it('la app se pinta también debajo de las barras del teléfono', () => {
    const html = readFileSync(join(__dirname, '..', 'index.html'), 'utf8')
    expect(html).toMatch(/name="viewport"[\s\S]*?viewport-fit=cover/)
  })
})

import { storage } from './platform/storage.js'
import { setSystemBarsTheme } from './platform/systemBars.js'

// Claro u oscuro. Por defecto manda el teléfono (`prefers-color-scheme`), pero
// se puede fijar uno desde Perfil → Apariencia: quien entrena de noche con el
// móvil en claro quiere la app en oscuro igual.
//
// El tema que se pinta vive en `<html data-theme="light|dark">`, y la hoja de
// estilos sólo mira ese atributo, nunca la media query: así hay una sola fuente
// de verdad y los tokens oscuros no se escriben dos veces. Lo resuelve este
// módulo —y, antes del primer pintado, el script en línea de `index.html`,
// que repite esta misma lógica para que no haya un fogonazo del otro tema.
const THEME_KEY = 'fitit_theme'
export const THEME_OPTIONS = ['system', 'light', 'dark']

// El color de la barra del navegador / del sistema, uno por tema: `--bg`.
const BAR_COLOR = { light: '#f5f3ee', dark: '#101113' }

const DARK_QUERY = '(prefers-color-scheme: dark)'

function systemTheme() {
  return window.matchMedia?.(DARK_QUERY).matches ? 'dark' : 'light'
}

export function getThemePref() {
  const stored = storage.getItem(THEME_KEY)
  return THEME_OPTIONS.includes(stored) ? stored : 'system'
}

export function setThemePref(pref) {
  storage.setItem(THEME_KEY, THEME_OPTIONS.includes(pref) ? pref : 'system')
}

export function applyTheme(pref = getThemePref()) {
  const theme = pref === 'light' || pref === 'dark' ? pref : systemTheme()
  document.documentElement.dataset.theme = theme
  // Las dos `<meta name="theme-color">` llevan cada una su media query; con un
  // tema elegido a mano las dos dicen el mismo color, el del tema elegido.
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    const own = meta.media?.includes('dark') ? 'dark' : 'light'
    meta.setAttribute('content', BAR_COLOR[pref === 'system' ? own : theme])
  }
  setSystemBarsTheme(theme)
  return theme
}

// Con «Sistema», cambiar el tema del teléfono con la app abierta la cambia
// también. Con uno fijado, no.
export function watchSystemTheme() {
  const mql = window.matchMedia?.(DARK_QUERY)
  if (!mql?.addEventListener) return () => {}
  const onChange = () => {
    if (getThemePref() === 'system') applyTheme('system')
  }
  mql.addEventListener('change', onChange)
  return () => mql.removeEventListener('change', onChange)
}

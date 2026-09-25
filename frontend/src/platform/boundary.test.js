import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

// La frontera de `platform/`.
//
// La app va a vivir en dos sitios: el navegador y un APK de Capacitor. Todo lo
// que en uno y otro se hace distinto —dónde se guarda el token, cómo se lee un
// código de barras, cómo se entra con Google, a qué URL se habla— tiene que
// pasar por `src/platform/`, para que la versión nativa sea otra implementación
// de esos módulos y no una búsqueda por cuarenta archivos. Este test es lo que
// impide que la frontera se vaya agujereando sin que nadie lo decida.
//
// Los tests, el harness y la suite de navegador quedan fuera: simulan el
// navegador a propósito.

// `import.meta.url` no es `file:` bajo jsdom; `__dirname` sí lo resuelve vitest.
const SRC = dirname(__dirname)

const FORBIDDEN = [
  [/\blocalStorage\b/, 'localStorage → platform/storage.js'],
  [/\bnavigator\.(serviceWorker|wakeLock|onLine)\b/, 'navigator → platform/'],
  [/\bBarcodeDetector\b/, 'BarcodeDetector → platform/scanner.js'],
  [/\bwindow\.google\b/, 'window.google → platform/googleIdentity.js'],
  [/\bNotification\./, 'Notification → platform/notify.js'],
  [/\bfetch\(\s*[`'"]\/api/, "fetch('/api…') → platform/http.js"],
]

function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return ['platform', 'browser', 'harness'].includes(name) ? [] : sources(path)
    }
    if (!/\.(js|jsx)$/.test(name) || /\.test\.(js|jsx)$/.test(name)) return []
    if (name === 'setupTests.js') return []
    return [path]
  })
}

// Los comentarios hablan de `localStorage` y de `BarcodeDetector` para explicar
// decisiones; eso no es usarlos.
function code(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/(^|[^:'"`])\/\/.*$/, '$1'))
    .join('\n')
}

describe('platform/', () => {
  it('nada fuera de platform/ toca el navegador directamente', () => {
    const leaks = []
    for (const file of sources(SRC)) {
      const lines = code(readFileSync(file, 'utf8')).split('\n')
      lines.forEach((line, i) => {
        for (const [pattern, fix] of FORBIDDEN) {
          if (pattern.test(line)) leaks.push(`${relative(SRC, file)}:${i + 1}  ${fix}`)
        }
      })
    }
    expect(leaks).toEqual([])
  })
})

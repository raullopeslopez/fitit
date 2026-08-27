/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// ── La segunda suite: geometría medida en un navegador de verdad ────────────
//
// La suite de siempre (`npm test`) corre en jsdom, y jsdom no tiene motor de
// maquetación: `getBoundingClientRect()` devuelve ceros, no hay pintado, no hay
// apilado por `z-index`, no hay scroll y no hay `elementFromPoint`. Las pruebas
// del editor se apañan **falsificando la geometría** —sobrescriben
// `Element.prototype.getBoundingClientRect` con un modelo escrito a mano— y eso
// demuestra que la aritmética de `fit()` es correcta, pero no que se le esté
// preguntando lo correcto. El defecto que costó un renombrado sin guardar
// (42,9 px de un control de 44 debajo de la barra fija, a `z-index: 10` contra
// el 3 del panel) tenía prueba verde: pasaba porque en el mundo falso no había
// ningún elemento fijo fuera del flujo de scroll.
//
// Esta configuración existe para que ese defecto tenga que fallar una prueba.
// No sustituye a la otra suite y no migra ni una de sus 632 pruebas: es una red
// de regresión sobre lo que ya se midió a mano, y nada más.
//
// ── Por qué un archivo aparte y no una segunda `test` en `vite.config.js` ──
// `vite.config.js` es también el servidor de desarrollo. Vite reinicia el
// servidor cuando su config cambia, así que tocarlo tira la sesión de quien
// esté mirando la app en vivo. Y son dos entornos incompatibles —jsdom contra
// Chromium— que no caben en un solo bloque `test`.
//
// ── Por qué los archivos se llaman `*.browser-test.jsx` ────────────────────
// El `include` por defecto de vitest es `**/*.{test,spec}.?(c|m)[jt]s?(x)`, y
// `vite.config.js` no lo cambia. Un archivo llamado `algo.browser.test.jsx`
// terminaría en `.test.jsx` y lo recogería *también* la suite de jsdom, donde
// no puede funcionar. `browser-test` no lleva el punto delante de `test`, así
// que no casa con ese patrón: la separación es el nombre del archivo, no una
// exclusión que haya que mantener en dos sitios.
export default defineConfig({
  plugins: [react()],
  test: {
    // Sólo lo de aquí. Sin esto heredaría el `include` por defecto y arrastraría
    // las pruebas de jsdom a un navegador donde `vi.mock` y `jsdom` no van.
    include: ['src/browser/**/*.browser-test.jsx'],
    globals: true,
    setupFiles: './src/browser/setup.js',
    browser: {
      enabled: true,
      provider: 'playwright',
      headless: true,
      // Una captura por fallo cuesta segundos y no dice nada que la aserción no
      // diga ya con números: aquí lo que se mide son rectángulos.
      screenshotFailures: false,
      // 430×932 es el teléfono contra el que está medido todo lo que estas
      // pruebas comprueban, y es como se usa la app. Un viewport distinto
      // reproduce otra pantalla, no ésta.
      viewport: { width: 430, height: 932 },
      instances: [{ browser: 'chromium' }],
    },
  },
})

import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import './styles.css'
import { handleBackButton } from './platform/backButton.js'
import { registerServiceWorker } from './platform/serviceWorker.js'
import { applyTheme, watchSystemTheme } from './theme.js'

// index.html ya lo puso antes de pintar; esto lo repite con el módulo de
// verdad y se queda escuchando al sistema por si eliges «Sistema».
applyTheme()
watchSystemTheme()

// Dev benches, on a query string and nothing else: `volume` is the per-muscle
// row on its own, `dias` is the whole screen with a fixture behind it.
//
// Gated on `import.meta.env.DEV`, and that gate is load-bearing. A lazy
// `import()` was not enough and the comment that used to sit here — "loaded
// lazily so neither the fixtures nor the fetch stub can reach a real build" —
// was simply false: a dynamic import makes a chunk *lazy*, not *absent*.
// `npm run build` emitted `DaysHarness-*.js` carrying `localStorage.clear()`
// and a `fetch` stub, reachable from the entry chunk. In production that meant
// `/?harness=dias` wiped `fitit_token` and `fitit_open_workout` — signed out,
// and a session in progress dropped — then drew fixture data over the top.
//
// `import.meta.env.DEV` is statically false in a build, so Vite drops the whole
// branch and the chunks with it. The check is that **no Harness chunk is
// emitted at all**, not that it got smaller — see the test in main.test.js.
const harness = import.meta.env.DEV
  ? new URLSearchParams(location.search).get('harness')
  : null

const root = ReactDOM.createRoot(document.getElementById('root'))

async function mount() {
  if (import.meta.env.DEV) {
    if (harness === 'volume') {
      const { default: VolumeHarness } = await import('./harness/VolumeHarness.jsx')
      return <VolumeHarness />
    }
    if (harness === 'dias') {
      const { default: DaysHarness } = await import('./harness/DaysHarness.jsx')
      return <DaysHarness />
    }
  }
  return <App />
}

// La barrera va **por dentro** de `StrictMode` y por fuera de todo lo demás.
// Por dentro porque en desarrollo StrictMode monta el árbol dos veces, y una
// barrera colgada por encima de él se quedaría fuera del segundo montaje — que
// es justo donde aparecen los fallos de efectos. Por fuera de `App` porque lo
// que hay que evitar es precisamente que no quede nada: una barrera dentro de
// una pantalla no cubre a la pantalla que la contiene.
mount().then((tree) =>
  root.render(
    <React.StrictMode>
      <ErrorBoundary>{tree}</ErrorBoundary>
    </React.StrictMode>,
  ),
)

// Register the service worker so the app is installable and loads its shell offline.
registerServiceWorker()
// Dentro del APK, el botón atrás de Android (en la web no hace nada).
handleBackButton()

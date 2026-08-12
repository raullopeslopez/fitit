import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.jsx'
import './styles.css'

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

mount().then((tree) => root.render(<React.StrictMode>{tree}</React.StrictMode>))

// Register the service worker so the app is installable and loads its shell offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

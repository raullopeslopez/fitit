import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.jsx'
import './styles.css'

// Dev benches, on a query string and nothing else: `volume` is the per-muscle
// row on its own, `dias` is the whole screen with a fixture behind it. Loaded
// lazily so neither the fixtures nor the fetch stub can reach a real build.
const harness = new URLSearchParams(location.search).get('harness')

const root = ReactDOM.createRoot(document.getElementById('root'))

async function mount() {
  if (harness === 'volume') {
    const { default: VolumeHarness } = await import('./harness/VolumeHarness.jsx')
    return <VolumeHarness />
  }
  if (harness === 'dias') {
    const { default: DaysHarness } = await import('./harness/DaysHarness.jsx')
    return <DaysHarness />
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

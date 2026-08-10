import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App.jsx'
import VolumeHarness from './harness/VolumeHarness.jsx'
import './styles.css'

// Dev bench for the per-muscle volume row, on a query string and nothing else.
const harness = new URLSearchParams(location.search).get('harness') === 'volume'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>{harness ? <VolumeHarness /> : <App />}</React.StrictMode>,
)

// Register the service worker so the app is installable and loads its shell offline.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

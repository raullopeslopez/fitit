import { isNative } from './native.js'

// El service worker de la PWA: caché para abrir sin red y el aviso de la
// pantalla de bloqueo (ver notify.js). Dentro del APK no se registra: la
// interfaz ya viene en el propio paquete, y un worker cacheando `index.html`
// serviría la versión anterior después de instalar una nueva.
export function registerServiceWorker() {
  if (isNative() || !('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

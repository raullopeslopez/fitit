// El service worker de la PWA: caché para abrir sin red y el aviso de la
// pantalla de bloqueo (ver notify.js). Dentro del APK no hay service worker
// que registrar; esto se quedará en la versión web.
export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

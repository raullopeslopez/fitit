// ¿Sabe el dispositivo, sin preguntar a nadie, que no tiene red?
//
// Sólo el `false` es fiable: `navigator.onLine === true` significa «hay alguna
// interfaz», no «llega el servidor». Por eso la pregunta es si está *sin* red.
export function isKnownOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false
}

import { registerPlugin } from '@capacitor/core'

import { isNative } from './native.js'

// El control del entreno en el APK: la cola de series la tiene el nativo, y la
// envía él con la app abierta o cerrada (WorkManager). La página le habla por
// aquí: encola, renombra, borra, pide un envío y le da el token.
// Spec: docs/widgets-entreno.md, fase 1. Lado nativo:
// android/app/src/main/java/…/session/SessionPlugin.java.
//
// En la web no existe: todo resuelve a null sin llamar a nada, y la página
// sigue con su propia cola (offline.js).

const FititSession = registerPlugin('FititSession')

// De una en una, en el orden pedido. El puente es asíncrono, y un «renombrar»
// que adelantase al «encolar» de la serie que renombra la dejaría con el nombre
// viejo. Un fallo no corta la cadena: lo recibe quien hizo esa llamada.
let chain = Promise.resolve()
function run(call) {
  if (!isNative()) return Promise.resolve(null)
  const next = chain.then(call)
  chain = next.catch(() => {})
  return next
}

export function nativeSession() {
  return isNative()
}

export const session = {
  enqueue: (entry) => run(() => FititSession.enqueue({ entry })),
  adopt: (entries) => run(() => FititSession.adopt({ entries })),
  drop: (tmpId) => run(() => FititSession.drop({ tmpId })),
  dropFor: (name) => run(() => FititSession.dropFor({ name })),
  rename: (from, to) => run(() => FititSession.rename({ from, to })),
  snapshot: () => run(() => FititSession.snapshot()),
  flush: () => run(() => FititSession.flush()),
  setSession: (token, apiBase, clientVersion) =>
    run(() => FititSession.setSession({ token, apiBase, clientVersion })),
  clearToken: () => run(() => FititSession.clearToken()),

  // Un envío terminó: `{ queue, sent, rejected, workout }`. Devuelve cómo
  // dejar de escuchar.
  onChanged(listener) {
    if (!isNative()) return () => {}
    const handle = FititSession.addListener('changed', listener)
    return () => {
      Promise.resolve(handle).then((h) => h?.remove())
    }
  },
}

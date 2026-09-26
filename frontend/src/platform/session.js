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

  // El control del entreno (fase 2): lo que enseña la notificación en curso.
  publish: (control) => run(() => FititSession.publish({ control })),
  end: () => run(() => FititSession.end()),
  skipRest: () => run(() => FititSession.skipRest()),
  // Android 13+ lo pregunta una vez; contesta `{ granted }`.
  ensureNotifications: () => run(() => FititSession.ensureNotifications()),
  // A qué ejercicios se puede cambiar desde el widget y la notificación (fase 5):
  // `[{ exercise, template, count }]`. Sólo cambia la lista del control de ese
  // entreno; sin control, el nativo no hace nada.
  candidates: (workoutId, candidates) =>
    run(() => FititSession.candidates({ workoutId, candidates })),

  // La orden con la que el widget o la notificación abrieron la app:
  // `{ action: 'open', workoutId }`, `{ action: 'add', workoutId }` («Nuevo…»
  // del 4×2) o `{ action: 'start' }`. El nativo la guarda
  // hasta que alguien escucha, así que vale también para un arranque en frío.
  onLaunch(listener) {
    if (!isNative()) return () => {}
    const handle = FititSession.addListener('launch', listener)
    return () => {
      Promise.resolve(handle).then((h) => h?.remove())
    }
  },

  // Un envío terminó (`{ queue, sent, rejected, workout, control }`) o algo
  // cambió desde la notificación (`{ queue, control }`). Devuelve cómo dejar de
  // escuchar.
  onChanged(listener) {
    if (!isNative()) return () => {}
    const handle = FititSession.addListener('changed', listener)
    return () => {
      Promise.resolve(handle).then((h) => h?.remove())
    }
  },
}

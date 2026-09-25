import { App } from '@capacitor/app'

import { isNative } from './native.js'

// Volver a la app. En el APK, Android avisa al pasar a primer plano; en la web,
// la pestaña vuelve a estar visible. Devuelve la función que deja de escuchar.
export function onResume(callback) {
  if (isNative()) {
    const handle = App.addListener('appStateChange', ({ isActive }) => {
      if (isActive) callback()
    })
    return () => {
      Promise.resolve(handle).then((h) => h?.remove?.())
    }
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') callback()
  }
  document.addEventListener('visibilitychange', onVisible)
  return () => document.removeEventListener('visibilitychange', onVisible)
}

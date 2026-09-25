import { Capacitor } from '@capacitor/core'

// ¿Corre esto dentro del APK? Es la única pregunta que decide qué
// implementación usa cada módulo de `platform/`. En el navegador —la PWA, los
// tests— la respuesta es no y todo se comporta como siempre.
export function isNative() {
  return Capacitor.isNativePlatform()
}

import { App } from '@capacitor/app'

import { isNative } from './native.js'

// El botón «atrás» de Android dentro del APK.
//
// En la PWA lo resuelve Chrome: si hay historial vuelve, y así se cierra el
// editor de ejercicio, que abre una entrada propia (ExerciseEditor.jsx). En el
// APK nadie lo hace por nosotros. Se reproduce lo mismo: con historial,
// `history.back()`; sin él, la app se va al fondo en vez de cerrarse, que es lo
// que hace Android con cualquier app y lo que no pierde un entreno a medias.
export function handleBackButton() {
  if (!isNative()) return
  App.addListener('backButton', ({ canGoBack }) => {
    if (canGoBack) window.history.back()
    else App.minimizeApp()
  })
}

// Hacer una foto del envase.
//
// En el navegador la foto la hace un `<input type="file" capture>`, y ahí se
// queda: es el control real, y no hay nada que envolver.
//
// En el APK, `@capacitor/camera`. Dos razones:
// - La foto sale **reducida** (1600 px de ancho, calidad 80). La de la cámara a
//   resolución completa son varios megas que viajan al servidor y a Gemini para
//   leer una tabla que se lee igual de bien a 1600; subirla más pequeña es subir
//   antes.
// - La foto vive en un fichero del teléfono, y su ruta es lo que ML Kit necesita
//   para decodificar un código en ella (`scanner.js`). Viaja dentro del `File`,
//   en `nativePath`.
//
// `getPhoto` está marcado como obsoleto en la 8 a favor de `takePhoto`, pero
// `takePhoto` no reduce conservando la proporción (pide ancho y alto a la vez),
// y la foto de una tabla no se puede deformar.

import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'

import { isNative } from './native.js'

// El rechazo con el que Android cuenta que volviste de la cámara sin foto.
const CANCELLED = 'User cancelled photos app'

export function usesNativeCamera() {
  return isNative()
}

// La foto, como un `File` que `readLabel` sabe subir. `null` si volviste sin
// hacerla — no es un error, igual que cerrar el selector de ficheros en la
// web. Cualquier otro fallo se lanza, para que la pantalla no se quede muda.
export async function takePhoto() {
  let photo
  try {
    photo = await Camera.getPhoto({
      source: CameraSource.Camera,
      resultType: CameraResultType.Uri,
      width: 1600,
      quality: 80,
      correctOrientation: true,
      saveToGallery: false,
    })
  } catch (error) {
    if (error?.message === CANCELLED) return null
    throw error
  }
  const blob = await (await fetch(photo.webPath)).blob()
  const format = photo.format || 'jpeg'
  const file = new File([blob], `envase.${format}`, { type: blob.type || `image/${format}` })
  file.nativePath = photo.path
  return file
}

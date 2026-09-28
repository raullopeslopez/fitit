// Leer un código de barras, en el propio teléfono.
//
// En el navegador, `BarcodeDetector`: es nativo en Chrome y en Android, y no
// existe en Safari ni en Firefox. Traer una librería para cubrirlos serían
// cientos de kilobytes en el bundle de una app que se usa en un móvil Android —
// y el resto de la pantalla sigue funcionando sin esto: se teclea, o se lee la
// etiqueta.
//
// En el APK, ML Kit (`@capacitor-mlkit/barcode-scanning`), porque un WebView de
// Android no promete `BarcodeDetector` y ML Kit va dentro de la app: funciona en
// cualquier teléfono y sin red. Decodifica la foto ya hecha, igual que en la
// web. El escáner en vivo de Google que trae el plugin (`BarcodeScanner.scan`)
// no se usa: su pantalla no tiene obturador, y la foto tiene que servir también
// para leer la tabla si no hay código.

import { BarcodeFormat, BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'

import { isNative } from './native.js'

// Los códigos de un envase. Un QR no lleva a ninguna ficha nutricional, y
// buscarlos todos sólo haría el escáner más lento.
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']
const NATIVE_FORMATS = [
  BarcodeFormat.Ean13,
  BarcodeFormat.Ean8,
  BarcodeFormat.UpcA,
  BarcodeFormat.UpcE,
]

export function canScan() {
  if (isNative()) return true
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

// Los códigos que haya en la foto. Devuelve una lista vacía si no ve ninguno,
// que no es un error: es una foto sin código.
export async function detectBarcodes(file) {
  if (isNative()) return detectNatively(file)
  const detector = new window.BarcodeDetector({ formats: FORMATS })
  const bitmap = await createImageBitmap(file)
  const found = await detector.detect(bitmap)
  return found.map((code) => code.rawValue).filter(Boolean)
}

// ML Kit no lee un `Blob`: lee un fichero del teléfono. `camera.js` deja la
// ruta de la foto en `nativePath`; una foto que no la trae no se puede
// decodificar, y eso se cuenta igual que una foto sin código.
async function detectNatively(file) {
  const path = file?.nativePath
  if (!path) return []
  const { barcodes } = await BarcodeScanner.readBarcodesFromImage({ path, formats: NATIVE_FORMATS })
  return barcodes.map((code) => code.rawValue).filter(Boolean)
}


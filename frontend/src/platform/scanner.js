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
// cualquier teléfono y sin red. Da dos cosas: decodificar una foto ya hecha
// (`detectBarcodes`, igual que en la web) y escanear en vivo (`scanLive`), que
// es apuntar sin hacer foto.

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

// El rechazo con el que el plugin cuenta que cerraste el escáner sin leer nada
// (`BarcodeScannerPlugin.ERROR_SCAN_CANCELED`).
const CANCELED = 'scan canceled.'

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

// Apuntar con la cámara, sin hacer foto. Sólo en el APK.
//
// Contesta una de tres cosas:
// - `{ code }` — leyó un código.
// - `{ cancelled: true }` — cerraste el escáner sin que leyera nada.
// - `null` — aquí no hay escáner en vivo (el navegador, o un Android al que
//   todavía le falta el módulo de Google): quien llama sigue por la foto, que
//   es lo que había antes.
//
// El escáner es el de Google (Play Services): abre su propia pantalla, no pide
// permiso de cámara, y necesita un módulo que Play Services baja aparte. Si no
// está, se pide aquí y se sigue sin esperar — la próxima vez ya estará, y
// hacerte mirar una barra de descarga para leer un código sería peor que una
// foto.
//
// Lo que no cubre: Android puede matar la app mientras el escáner de Google
// está delante. Entonces esta promesa no vuelve nunca, y el código llega en el
// evento `appRestoredResult` de `@capacitor/app` a una app recién arrancada, sin
// la pantalla de añadir abierta. No se recoge: se vuelve a escanear.
export async function scanLive() {
  if (!isNative()) return null
  try {
    const { available } = await BarcodeScanner.isGoogleBarcodeScannerModuleAvailable()
    if (!available) {
      BarcodeScanner.installGoogleBarcodeScannerModule().catch(() => {})
      return null
    }
    const { barcodes } = await BarcodeScanner.scan({ formats: NATIVE_FORMATS, autoZoom: true })
    const code = barcodes.map((found) => found.rawValue).find(Boolean)
    return code ? { code } : { cancelled: true }
  } catch (error) {
    if (error?.message === CANCELED) return { cancelled: true }
    return null
  }
}

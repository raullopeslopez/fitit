// Leer un código de barras de una foto, en el propio teléfono.
//
// `BarcodeDetector` es nativo en Chrome y en Android, y no existe en Safari ni
// en Firefox. Traer una librería para cubrirlos serían cientos de kilobytes en
// el bundle de una app que se usa en un móvil Android — y el resto de la
// pantalla sigue funcionando sin esto: se teclea, o se lee la etiqueta. En el
// APK esto pasará a ML Kit (`@capacitor-mlkit/barcode-scanning`).

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e']

export function canScan() {
  return typeof window !== 'undefined' && 'BarcodeDetector' in window
}

// Los códigos que haya en la foto. Devuelve una lista vacía si no ve ninguno,
// que no es un error: es una foto sin código.
export async function detectBarcodes(file) {
  const detector = new window.BarcodeDetector({ formats: FORMATS })
  const bitmap = await createImageBitmap(file)
  const found = await detector.detect(bitmap)
  return found.map((code) => code.rawValue).filter(Boolean)
}

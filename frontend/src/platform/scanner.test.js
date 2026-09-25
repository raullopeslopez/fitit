import { beforeEach, describe, expect, it, vi } from 'vitest'

// El escáner dentro del APK: ML Kit en vez de `BarcodeDetector`. El plugin es un
// doble — aquí se comprueba qué se le pide y qué se hace con lo que conteste,
// no que decodifique: eso sólo se ve en un teléfono.

vi.mock('./native.js', () => ({ isNative: vi.fn(() => true) }))
vi.mock('@capacitor-mlkit/barcode-scanning', () => ({
  BarcodeFormat: { Ean13: 'EAN_13', Ean8: 'EAN_8', UpcA: 'UPC_A', UpcE: 'UPC_E' },
  BarcodeScanner: {
    readBarcodesFromImage: vi.fn(),
    isGoogleBarcodeScannerModuleAvailable: vi.fn(),
    installGoogleBarcodeScannerModule: vi.fn(() => Promise.resolve()),
    scan: vi.fn(),
  },
}))

import { BarcodeScanner } from '@capacitor-mlkit/barcode-scanning'

import { isNative } from './native.js'
import { canScan, detectBarcodes, scanLive } from './scanner.js'

const FORMATS = ['EAN_13', 'EAN_8', 'UPC_A', 'UPC_E']

// Una foto como la devuelve `camera.js` en el APK: con la ruta del fichero
// dentro, que es lo único que ML Kit sabe leer.
function foto(path = 'file:///data/user/0/cache/envase.jpeg') {
  const file = new File([new Uint8Array([255, 216, 255])], 'envase.jpeg', { type: 'image/jpeg' })
  file.nativePath = path
  return file
}

describe('scanner.js dentro del APK', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNative.mockReturnValue(true)
    delete window.BarcodeDetector
  })

  it('sabe leer códigos aunque el WebView no traiga BarcodeDetector', () => {
    expect(canScan()).toBe(true)
  })

  it('decodifica la foto con ML Kit, por su ruta, y sólo los formatos de un envase', async () => {
    BarcodeScanner.readBarcodesFromImage.mockResolvedValue({
      barcodes: [{ rawValue: '8410128750121' }, { rawValue: '' }],
    })
    await expect(detectBarcodes(foto())).resolves.toEqual(['8410128750121'])
    expect(BarcodeScanner.readBarcodesFromImage).toHaveBeenCalledWith({
      path: 'file:///data/user/0/cache/envase.jpeg',
      formats: FORMATS,
    })
  })

  it('una foto sin ruta no se puede decodificar, y no es un error: no hay código', async () => {
    const sinRuta = new File([new Uint8Array([1])], 'x.jpg', { type: 'image/jpeg' })
    await expect(detectBarcodes(sinRuta)).resolves.toEqual([])
    expect(BarcodeScanner.readBarcodesFromImage).not.toHaveBeenCalled()
  })

  describe('escanear en vivo', () => {
    it('abre el escáner de Google y devuelve el primer código', async () => {
      BarcodeScanner.isGoogleBarcodeScannerModuleAvailable.mockResolvedValue({ available: true })
      BarcodeScanner.scan.mockResolvedValue({ barcodes: [{ rawValue: '8410128750121' }] })
      await expect(scanLive()).resolves.toEqual({ code: '8410128750121' })
      expect(BarcodeScanner.scan).toHaveBeenCalledWith(
        expect.objectContaining({ formats: FORMATS }),
      )
    })

    it('cerrar el escáner sin leer nada es «no hay código», no un fallo', async () => {
      BarcodeScanner.isGoogleBarcodeScannerModuleAvailable.mockResolvedValue({ available: true })
      BarcodeScanner.scan.mockRejectedValue(new Error('scan canceled.'))
      await expect(scanLive()).resolves.toEqual({ cancelled: true })
    })

    it('sin el módulo de Google lo pide para la próxima y deja paso a la foto', async () => {
      BarcodeScanner.isGoogleBarcodeScannerModuleAvailable.mockResolvedValue({ available: false })
      await expect(scanLive()).resolves.toBe(null)
      expect(BarcodeScanner.installGoogleBarcodeScannerModule).toHaveBeenCalled()
      expect(BarcodeScanner.scan).not.toHaveBeenCalled()
    })

    it('un escáner que falla por otra cosa también deja paso a la foto', async () => {
      BarcodeScanner.isGoogleBarcodeScannerModuleAvailable.mockResolvedValue({ available: true })
      BarcodeScanner.scan.mockRejectedValue(new Error('Google Play Services no disponible'))
      await expect(scanLive()).resolves.toBe(null)
    })
  })
})

describe('scanner.js en el navegador', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNative.mockReturnValue(false)
  })

  it('no hay escaneo en vivo: la escalada empieza por la foto, como siempre', async () => {
    await expect(scanLive()).resolves.toBe(null)
    expect(BarcodeScanner.scan).not.toHaveBeenCalled()
  })

  it('sin BarcodeDetector no promete leer códigos', () => {
    delete window.BarcodeDetector
    expect(canScan()).toBe(false)
  })
})

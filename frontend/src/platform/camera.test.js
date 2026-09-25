import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// La cámara dentro del APK. `Camera` es un doble: se comprueba qué se le pide y
// que lo que devuelve acabe siendo el `File` que `readLabel` ya sabía subir.

vi.mock('./native.js', () => ({ isNative: vi.fn(() => true) }))
vi.mock('@capacitor/camera', () => ({
  Camera: { getPhoto: vi.fn() },
  CameraResultType: { Uri: 'uri' },
  CameraSource: { Camera: 'CAMERA' },
}))

import { Camera } from '@capacitor/camera'

import { isNative } from './native.js'
import { takePhoto, usesNativeCamera } from './camera.js'

describe('camera.js dentro del APK', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isNative.mockReturnValue(true)
    globalThis.fetch = vi.fn(() =>
      Promise.resolve({ blob: () => Promise.resolve(new Blob([new Uint8Array([255, 216])], { type: 'image/jpeg' })) }),
    )
  })

  afterEach(() => {
    delete globalThis.fetch
  })

  it('usa la cámara de Android, no el input', () => {
    expect(usesNativeCamera()).toBe(true)
  })

  it('pide la cámara trasera y una foto reducida, que sube antes', async () => {
    Camera.getPhoto.mockResolvedValue({
      format: 'jpeg',
      path: 'file:///cache/foto.jpeg',
      webPath: 'http://localhost/_capacitor_file_/cache/foto.jpeg',
    })
    await takePhoto()
    expect(Camera.getPhoto).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'CAMERA',
        resultType: 'uri',
        width: 1600,
        quality: 80,
        saveToGallery: false,
      }),
    )
  })

  it('devuelve un File con la ruta dentro, para que ML Kit pueda leer el código', async () => {
    Camera.getPhoto.mockResolvedValue({
      format: 'jpeg',
      path: 'file:///cache/foto.jpeg',
      webPath: 'http://localhost/_capacitor_file_/cache/foto.jpeg',
    })
    const file = await takePhoto()
    expect(globalThis.fetch).toHaveBeenCalledWith('http://localhost/_capacitor_file_/cache/foto.jpeg')
    expect(file).toBeInstanceOf(File)
    expect(file.type).toBe('image/jpeg')
    expect(file.name).toBe('envase.jpeg')
    expect(file.nativePath).toBe('file:///cache/foto.jpeg')
  })

  it('volver de la cámara sin foto no es un error: no hay nada que leer', async () => {
    Camera.getPhoto.mockRejectedValue(new Error('User cancelled photos app'))
    await expect(takePhoto()).resolves.toBe(null)
  })

  it('una cámara que falla de verdad sí lo dice, para que la pantalla no se quede muda', async () => {
    Camera.getPhoto.mockRejectedValue(new Error("Device doesn't have a camera available"))
    await expect(takePhoto()).rejects.toThrow()
  })
})

describe('camera.js en el navegador', () => {
  it('se queda con el input de siempre', () => {
    isNative.mockReturnValue(false)
    expect(usesNativeCamera()).toBe(false)
  })
})

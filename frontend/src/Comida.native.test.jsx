import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Comida from './Comida.jsx'
import * as api from './api.js'
import * as camera from './platform/camera.js'
import * as scanner from './platform/scanner.js'

// La cámara de Comida dentro del APK.
//
// Aquí no se dobla ningún plugin: se doblan `platform/scanner.js` y
// `platform/camera.js`, que es la frontera. Lo que se prueba es qué hace la
// pantalla con lo que contestan — el mapeo de cada uno a su plugin tiene sus
// propias pruebas en `platform/`. La web (el `input` de siempre) sigue en
// `Comida.test.jsx`, sin tocar.

vi.mock('./api.js')
vi.mock('./platform/scanner.js', () => ({
  canScan: vi.fn(() => true),
  detectBarcodes: vi.fn(),
  scanLive: vi.fn(),
}))
vi.mock('./platform/camera.js', () => ({
  usesNativeCamera: vi.fn(() => true),
  takePhoto: vi.fn(),
}))

const EAN = '8410128750121'

const YOGUR = {
  id: 70,
  name: 'Yogur natural',
  brand: 'Hacendado',
  kcal_100g: 61,
  protein_100g: 3.8,
  fat_100g: 3.2,
  carbs_100g: 4.5,
  fiber_100g: 0.3,
  portions: [],
  is_mine: true,
}

function day() {
  return {
    date: '2026-08-31',
    entries: [],
    totals: { kcal: null, protein: null, fat: null, carbs: null, fiber: null },
    unknown: { kcal: 0, protein: 0, fat: 0, carbs: 0, fiber: 0 },
    by_slot: [],
    label_reading: true,
  }
}

// Una foto como la devuelve `camera.js` en el APK: con su ruta dentro.
function foto() {
  const file = new File([new Uint8Array([255, 216, 255])], 'envase.jpeg', { type: 'image/jpeg' })
  file.nativePath = 'file:///cache/envase.jpeg'
  return file
}

async function abrirCamara() {
  render(<Comida />)
  await userEvent.click(await screen.findByRole('button', { name: 'Añadir a desayuno' }))
  await userEvent.click(screen.getByRole('button', { name: 'Abrir la cámara' }))
}

describe('Comida dentro del APK', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    vi.setSystemTime(new Date(2026, 7, 31, 12, 0))
    scanner.canScan.mockReturnValue(true)
    camera.usesNativeCamera.mockReturnValue(true)
    api.getFoodDay.mockResolvedValue(day())
    api.searchFoods.mockResolvedValue([])
    api.frequentFoods.mockResolvedValue([])
    api.listDishes.mockResolvedValue([])
    api.listRules.mockResolvedValue([])
    api.dayVerdicts.mockResolvedValue({ date: '2026-08-31', verdicts: [], acceptable: true })
    api.getTargetProfile.mockResolvedValue({})
    api.getPlan.mockResolvedValue(null)
    api.getAdherence.mockResolvedValue(null)
    api.getTargetProposal.mockResolvedValue({ kcal: null, source: null, days: 0, missing: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // El disparador es un botón: en el APK no hay `input` que envolver, la
  // cámara la abre el plugin.
  it('«Abrir la cámara» es un botón, y apunta al código sin hacer foto', async () => {
    scanner.scanLive.mockResolvedValue({ code: EAN })
    api.scanBarcode.mockResolvedValue({ barcode: EAN, food: YOGUR })
    await abrirCamara()
    expect(await screen.findByLabelText('Cantidad')).toBeInTheDocument()
    expect(api.scanBarcode).toHaveBeenCalledWith(EAN)
    expect(camera.takePhoto).not.toHaveBeenCalled()
    expect(api.readLabel).not.toHaveBeenCalled()
  })

  // La misma puerta que el código sacado de una foto: la ficha pública se
  // guarda en tu catálogo por `POST /foods`, con su código dentro.
  it('un código que conoce Open Food Facts se guarda igual que el de una foto', async () => {
    scanner.scanLive.mockResolvedValue({ code: EAN })
    api.scanBarcode.mockResolvedValue({
      barcode: EAN,
      food: null,
      name: 'Yogur natural',
      brand: 'Hacendado',
      nutrients: { kcal: 61, protein: 3.8, fat: 3.2, carbs: 4.5, fiber: 0.3 },
      refusal: null,
    })
    api.createFood.mockResolvedValue(YOGUR)
    await abrirCamara()
    await waitFor(() =>
      expect(api.createFood).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Yogur natural', barcode: EAN, kcal_100g: 61 }),
      ),
    )
    expect(await screen.findByLabelText('Cantidad')).toBeInTheDocument()
  })

  it('un código que nadie conoce pide la tabla, y la foto la hace la cámara de Android', async () => {
    scanner.scanLive.mockResolvedValue({ code: EAN })
    api.scanBarcode.mockResolvedValue({ barcode: EAN, food: null, refusal: 'unknown' })
    const tabla = foto()
    camera.takePhoto.mockResolvedValue(tabla)
    api.readLabel.mockResolvedValue({ refusal: 'unreadable' })
    await abrirCamara()
    expect(await screen.findByText('Ese código no está en ninguna base.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Enfocar la tabla' }))
    await waitFor(() => expect(api.readLabel).toHaveBeenCalledWith(tabla))
  })

  it('sin red al preguntar por el código, lo dice y pide la tabla', async () => {
    scanner.scanLive.mockResolvedValue({ code: EAN })
    api.scanBarcode.mockRejectedValue(new Error('network'))
    await abrirCamara()
    expect(await screen.findByText('No he podido preguntar por ese código.')).toBeInTheDocument()
    expect(api.readLabel).not.toHaveBeenCalled()
  })

  // Cerrar el escáner es la salida de un envase sin código legible: se ofrece
  // la tabla, como cuando el código no sirve. No se lee nada por su cuenta.
  it('cerrar el escáner sin código ofrece la tabla o teclearlo', async () => {
    scanner.scanLive.mockResolvedValue({ cancelled: true })
    await abrirCamara()
    expect(await screen.findByText('No he leído ningún código.')).toBeInTheDocument()
    expect(screen.getByText('Acerca la foto a la tabla nutricional y la leo.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Enfocar la tabla' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Teclearlo' })).toBeInTheDocument()
    expect(api.scanBarcode).not.toHaveBeenCalled()
    expect(camera.takePhoto).not.toHaveBeenCalled()
  })

  // Sin el módulo de Google todavía, la escalada es la de antes: una foto, el
  // código decodificado en ella con ML Kit, y si no hay código, la tabla.
  describe('sin escáner en vivo', () => {
    beforeEach(() => scanner.scanLive.mockResolvedValue(null))

    it('hace una foto y busca el código en ella', async () => {
      const envase = foto()
      camera.takePhoto.mockResolvedValue(envase)
      scanner.detectBarcodes.mockResolvedValue([EAN])
      api.scanBarcode.mockResolvedValue({ barcode: EAN, food: YOGUR })
      await abrirCamara()
      expect(await screen.findByLabelText('Cantidad')).toBeInTheDocument()
      expect(scanner.detectBarcodes).toHaveBeenCalledWith(envase)
      expect(api.scanBarcode).toHaveBeenCalledWith(EAN)
    })

    it('una foto sin código se lee como tabla', async () => {
      const envase = foto()
      camera.takePhoto.mockResolvedValue(envase)
      scanner.detectBarcodes.mockResolvedValue([])
      api.readLabel.mockResolvedValue({ refusal: 'unreadable' })
      await abrirCamara()
      await waitFor(() => expect(api.readLabel).toHaveBeenCalledWith(envase))
    })

    it('volver de la cámara sin foto no hace nada', async () => {
      camera.takePhoto.mockResolvedValue(null)
      await abrirCamara()
      await waitFor(() => expect(camera.takePhoto).toHaveBeenCalled())
      expect(api.readLabel).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Abrir la cámara' })).toBeEnabled()
    })

    // Un botón que no hace nada no se distingue de uno roto: si la cámara
    // falla, se abre el formulario, que es donde estabas antes de la cámara.
    it('una cámara que falla abre el formulario', async () => {
      camera.takePhoto.mockRejectedValue(new Error('sin cámara'))
      await abrirCamara()
      expect(await screen.findByLabelText('Kcal por 100 g')).toBeInTheDocument()
    })
  })
})

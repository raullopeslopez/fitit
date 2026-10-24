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
    api.getTargetProfile.mockResolvedValue({})
    api.getPlan.mockResolvedValue(null)
    api.getAdherence.mockResolvedValue(null)
    api.getTargetProposal.mockResolvedValue({ kcal: null, source: null, days: 0, missing: [] })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // El disparador es un botón: en el APK no hay `input` que envolver, la
  // cámara la abre el plugin. Una sola foto sirve para las dos cosas: el código,
  // decodificado en el móvil, y si no hay código, la tabla.
  it('«Abrir la cámara» hace una foto y busca el código en ella', async () => {
    const envase = foto()
    camera.takePhoto.mockResolvedValue(envase)
    scanner.detectBarcodes.mockResolvedValue([EAN])
    api.scanBarcode.mockResolvedValue({ barcode: EAN, food: YOGUR })
    await abrirCamara()
    expect(await screen.findByLabelText('Cantidad')).toBeInTheDocument()
    expect(scanner.detectBarcodes).toHaveBeenCalledWith(envase)
    expect(api.scanBarcode).toHaveBeenCalledWith(EAN)
    expect(api.readLabel).not.toHaveBeenCalled()
  })

  // La ficha pública se guarda en tu catálogo por `POST /foods`, con su código
  // dentro.
  it('un código que conoce Open Food Facts se guarda en tu catálogo', async () => {
    camera.takePhoto.mockResolvedValue(foto())
    scanner.detectBarcodes.mockResolvedValue([EAN])
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

  // El peldaño caro: la misma foto va al modelo, sin pedir otra.
  it('una foto sin código se lee como tabla', async () => {
    const envase = foto()
    camera.takePhoto.mockResolvedValue(envase)
    scanner.detectBarcodes.mockResolvedValue([])
    api.readLabel.mockResolvedValue({ refusal: 'unreadable' })
    await abrirCamara()
    await waitFor(() => expect(api.readLabel).toHaveBeenCalledWith(envase))
    expect(api.scanBarcode).not.toHaveBeenCalled()
  })

  it('un código que nadie conoce pide la tabla con otra foto', async () => {
    camera.takePhoto.mockResolvedValue(foto())
    scanner.detectBarcodes.mockResolvedValue([EAN])
    api.scanBarcode.mockResolvedValue({ barcode: EAN, food: null, refusal: 'unknown' })
    await abrirCamara()
    expect(await screen.findByText('Ese código no está en ninguna base.')).toBeInTheDocument()
    const tabla = foto()
    camera.takePhoto.mockResolvedValue(tabla)
    api.readLabel.mockResolvedValue({ refusal: 'unreadable' })
    await userEvent.click(screen.getByRole('button', { name: 'Enfocar la tabla' }))
    await waitFor(() => expect(api.readLabel).toHaveBeenCalledWith(tabla))
  })

  // Sin red para preguntar por el código, la foto sigue siendo del envase: la
  // tabla puede estar en ella.
  it('sin red al preguntar por el código, intenta la tabla con la misma foto', async () => {
    const envase = foto()
    camera.takePhoto.mockResolvedValue(envase)
    scanner.detectBarcodes.mockResolvedValue([EAN])
    api.scanBarcode.mockRejectedValue(new Error('network'))
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

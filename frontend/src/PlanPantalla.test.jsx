import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import PlanPantalla, { rangoSemana } from './PlanPantalla.jsx'
import {
  generatePlan,
  getAdherence,
  getPlan,
  getShoppingList,
  getTargetProfile,
  importPlan,
  importPlanText,
  listDishes,
  saveImportedPlan,
} from './api.js'

vi.mock('./api.js')

// Sábado: la semana en curso empieza el lunes 5 y la que viene el 12.
const HOY = '2026-10-10'
const ESTA = '2026-10-05'
const VIENE = '2026-10-12'

function plan(weekStart, nombre, over = {}) {
  return {
    id: 1,
    week_start: weekStart,
    seed: 3,
    score: 0,
    verdicts: [],
    entries: [
      {
        id: 1,
        log_date: weekStart,
        slot: 'comida',
        dish_id: 7,
        dish_name: nombre,
        grams: [150],
        kcal: 620,
        status: null,
        log_entry_id: null,
        ...over,
      },
    ],
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  getPlan.mockImplementation(async (week) =>
    week === ESTA ? plan(ESTA, 'Pollo con arroz') : null,
  )
  getAdherence.mockResolvedValue(null)
  listDishes.mockResolvedValue([])
  getTargetProfile.mockResolvedValue({ objetivo_kcal: 2150 })
  generatePlan.mockResolvedValue(plan(VIENE, 'Merluza'))
  getShoppingList.mockResolvedValue({ week_start: VIENE, aisles: [] })
})

describe('rangoSemana', () => {
  it('dice los dos días con el mes una vez', () => {
    expect(rangoSemana('2026-10-05')).toBe('5 – 11 oct')
  })
  it('con la semana entre dos meses dice los dos', () => {
    expect(rangoSemana('2026-09-28')).toBe('28 sep – 4 oct')
  })
})

// La pauta del nutricionista va plegada al pie de la que viene (comida simple).
const esta = () => screen.getByRole('region', { name: 'Esta semana' })
const viene = () => screen.getByRole('region', { name: 'La que viene' })

async function abrirPauta() {
  await userEvent.click(await screen.findByRole('button', { name: '¿Tienes una pauta del nutricionista?' }))
}

describe('la pantalla Plan', () => {
  it('abre en esta semana, con su rango y sus días', async () => {
    render(<PlanPantalla hoy={HOY} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Semana' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Esta semana' })).toHaveAttribute('aria-current', 'true')
    expect(within(esta()).getByText('5 – 11 oct')).toBeInTheDocument()
    // Comida simple: la semana es una cuadrícula; el lunes se elige y enseña lo suyo.
    await userEvent.click(await screen.findByRole('button', { name: /^Lunes 5/ }))
    expect(await screen.findByText('Pollo con arroz')).toBeInTheDocument()
    expect(getPlan).toHaveBeenCalledWith(ESTA)
  })

  it('sin plan esta semana ofrece generarla', async () => {
    getPlan.mockResolvedValue(null)
    render(<PlanPantalla hoy={HOY} />)
    expect(await screen.findByRole('heading', { name: 'Esta semana no hay plan' })).toBeInTheDocument()
    await userEvent.click(within(esta()).getByRole('button', { name: 'Generar la semana' }))
    await waitFor(() => expect(generatePlan).toHaveBeenCalledWith(ESTA, null))
  })

  // Las dos semanas van seguidas; la píldora salta a la que viene y la marca.
  it('«La que viene» planifica la semana del lunes siguiente', async () => {
    render(<PlanPantalla hoy={HOY} />)
    await userEvent.click(screen.getByRole('button', { name: 'La que viene' }))
    expect(screen.getByRole('button', { name: 'La que viene' })).toHaveAttribute('aria-current', 'true')
    expect(within(viene()).getByText('12 – 18 oct')).toBeInTheDocument()
    await userEvent.click(await within(viene()).findByRole('button', { name: 'Generar la semana' }))
    await waitFor(() => expect(generatePlan).toHaveBeenCalledWith(VIENE, null))
  })

  it('con la que viene ya generada, enseña su lista de la compra', async () => {
    getPlan.mockImplementation(async (week) => plan(week, week === VIENE ? 'Merluza' : 'Pollo con arroz'))
    render(<PlanPantalla hoy={HOY} inicial="viene" />)
    expect(await screen.findByText('Merluza')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Preparar la compra/ }))
    expect(screen.getByRole('dialog', { name: 'Lista de la compra' })).toBeInTheDocument()
  })

  // Reorganización del 17 oct: Tus platos es de «Mis cosas», en Perfil. La que
  // viene planifica con ellos, pero no es donde se gestionan.
  it('«Tus platos» ya no está en la que viene', async () => {
    getPlan.mockResolvedValue(null)
    render(<PlanPantalla hoy={HOY} inicial="viene" />)
    await within(viene()).findByRole('button', { name: 'Generar la semana' })
    expect(screen.queryByRole('button', { name: /Tus platos/ })).not.toBeInTheDocument()
  })

  // Plan v2: «Esta semana» es para seguir el plan. Planificar y comprar —la
  // pauta, la lista, el ticket, tus platos— es de «La que viene».
  it('esta semana no carga con planificar ni comprar', async () => {
    render(<PlanPantalla hoy={HOY} />)
    await screen.findByRole('table', { name: 'Plan de la semana' })
    for (const nombre of [/Lista de la compra/, /Tus platos/, /Subir plan/, /Pegar plan/, /Subir ticket/]) {
      expect(within(esta()).queryByRole('button', { name: nombre })).not.toBeInTheDocument()
    }
  })

  it('en la que viene, subir y pegar plan van después de la semana', async () => {
    getPlan.mockImplementation(async (week) => plan(week, week === VIENE ? 'Merluza' : 'Pollo con arroz'))
    render(<PlanPantalla hoy={HOY} inicial="viene" />)
    const merluza = await screen.findByText('Merluza')
    await abrirPauta()
    const pegar = screen.getByRole('button', { name: /Pegar plan/ })
    expect(merluza.compareDocumentPosition(pegar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('un plan que no llega no deja la pantalla en blanco', async () => {
    getPlan.mockRejectedValue(new Error('red'))
    render(<PlanPantalla hoy={HOY} />)
    expect(await screen.findByText('No se ha podido cargar el plan.')).toBeInTheDocument()
  })

  describe('subir el plan del nutricionista', () => {
    const LECTURA = {
      dishes: [
        { name: 'Pollo con arroz', slots: ['comida'], status: 'existing', dish_id: 7, lines: [] },
      ],
      week: [{ day: 0, slot: 'comida', dish: 0 }],
      refusal: null,
    }
    const pdf = () => new File(['%PDF'], 'plan.pdf', { type: 'application/pdf' })

    it('subir un PDF lo lee y enseña los platos identificados', async () => {
      importPlan.mockResolvedValue(LECTURA)
      render(<PlanPantalla hoy={HOY} inicial="viene" />)
      await abrirPauta()
      expect(await screen.findByRole('button', { name: /Subir plan/ })).toHaveTextContent('PDF del nutricionista')
      await userEvent.upload(screen.getByLabelText('PDF del plan'), pdf())
      expect(await screen.findByRole('dialog', { name: 'Platos identificados' })).toBeInTheDocument()
      expect(importPlan).toHaveBeenCalled()
    })

    describe('pegar el plan que escribe Claude', () => {
      const TEXTO = '{"dishes": [], "week": []}'
      function portapapeles(readText) {
        Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true })
      }

      it('un toque lee el portapapeles y enseña los platos identificados', async () => {
        portapapeles(vi.fn().mockResolvedValue(TEXTO))
        importPlanText.mockResolvedValue(LECTURA)
        render(<PlanPantalla hoy={HOY} inicial="viene" />)
        await abrirPauta()
        await userEvent.click(await screen.findByRole('button', { name: /Pegar plan/ }))
        expect(await screen.findByRole('dialog', { name: 'Platos identificados' })).toBeInTheDocument()
        expect(importPlanText).toHaveBeenCalledWith(TEXTO)
      })

      it('sin acceso al portapapeles abre un cuadro para pegarlo a mano', async () => {
        portapapeles(vi.fn().mockRejectedValue(new Error('NotAllowedError')))
        importPlanText.mockResolvedValue(LECTURA)
        render(<PlanPantalla hoy={HOY} inicial="viene" />)
        await abrirPauta()
        await userEvent.click(await screen.findByRole('button', { name: /Pegar plan/ }))
        const cuadro = await screen.findByRole('textbox', { name: 'Plan en texto' })
        expect(screen.getByRole('button', { name: 'Leer' })).toBeDisabled()
        await userEvent.click(cuadro)
        await userEvent.paste(TEXTO)
        await userEvent.click(screen.getByRole('button', { name: 'Leer' }))
        expect(await screen.findByRole('dialog', { name: 'Platos identificados' })).toBeInTheDocument()
        expect(importPlanText).toHaveBeenCalledWith(TEXTO)
      })

      it('un texto que no es un plan lo dice, y no abre nada', async () => {
        portapapeles(vi.fn().mockResolvedValue('hola'))
        importPlanText.mockResolvedValue({ dishes: [], week: [], refusal: 'unreadable' })
        render(<PlanPantalla hoy={HOY} inicial="viene" />)
        await abrirPauta()
        await userEvent.click(await screen.findByRole('button', { name: /Pegar plan/ }))
        expect(
          await screen.findByText('Eso no parece un plan. Pega la respuesta entera de Claude.'),
        ).toBeInTheDocument()
        expect(screen.queryByRole('dialog', { name: 'Platos identificados' })).not.toBeInTheDocument()
      })
    })

    it('si no se puede leer lo dice, y no abre nada', async () => {
      importPlan.mockResolvedValue({ dishes: [], week: [], refusal: 'unreadable' })
      render(<PlanPantalla hoy={HOY} inicial="viene" />)
      await abrirPauta()
      await userEvent.upload(await screen.findByLabelText('PDF del plan'), pdf())
      expect(await screen.findByText('No se ha podido leer el plan. Prueba otra vez.')).toBeInTheDocument()
      expect(screen.queryByRole('dialog', { name: 'Platos identificados' })).not.toBeInTheDocument()
    })

    it('sin cuota en el día lo dice distinto', async () => {
      importPlan.mockResolvedValue({ dishes: [], week: [], refusal: 'quota', quota_scope: 'day' })
      render(<PlanPantalla hoy={HOY} inicial="viene" />)
      await abrirPauta()
      await userEvent.upload(await screen.findByLabelText('PDF del plan'), pdf())
      expect(await screen.findByText('Se ha gastado la lectura de hoy. Prueba mañana.')).toBeInTheDocument()
    })

    it('guardar rehace las semanas que no tienen nada confirmado y lo dice', async () => {
      importPlan.mockResolvedValue(LECTURA)
      saveImportedPlan.mockResolvedValue({ pauta_id: 1 })
      getPlan.mockImplementation(async (week) => plan(week, 'Pollo con arroz'))
      render(<PlanPantalla hoy={HOY} inicial="viene" />)
      await abrirPauta()
      await userEvent.upload(await screen.findByLabelText('PDF del plan'), pdf())
      await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(saveImportedPlan).toHaveBeenCalled())
      expect(saveImportedPlan.mock.calls[0][0].week_start).toBe(ESTA)
      await waitFor(() => expect(generatePlan).toHaveBeenCalledWith(VIENE, null))
      expect(generatePlan).toHaveBeenCalledWith(ESTA, null)
      expect(
        await screen.findByText('Pauta guardada. Esta semana y la que viene ya siguen el plan.'),
      ).toBeInTheDocument()
    })

    // Guardar es el momento de comprar: la que viene se genera aunque no
    // existiera, y su lista queda ahí mismo, en «La que viene».
    it('guardar genera también la que viene aunque no existiera, y ofrece su lista', async () => {
      importPlan.mockResolvedValue(LECTURA)
      saveImportedPlan.mockResolvedValue({ pauta_id: 1 })
      // La que viene no existe hasta que guardar la genera.
      let generada = false
      generatePlan.mockImplementation(async (week) => {
        if (week === VIENE) generada = true
        return plan(week, 'Merluza')
      })
      getPlan.mockImplementation(async (week) => {
        if (week === ESTA) return plan(ESTA, 'Pollo con arroz', { status: 'done' })
        return generada ? plan(VIENE, 'Merluza') : null
      })
      render(<PlanPantalla hoy={HOY} inicial="viene" />)
      await abrirPauta()
      await userEvent.upload(await screen.findByLabelText('PDF del plan'), pdf())
      await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
      await waitFor(() => expect(generatePlan).toHaveBeenCalledWith(VIENE, null))
      expect(generatePlan).not.toHaveBeenCalledWith(ESTA, null)
      await userEvent.click(await screen.findByRole('button', { name: /Preparar la compra/ }))
      expect(screen.getByRole('dialog', { name: 'Lista de la compra' })).toBeInTheDocument()
      expect(getShoppingList).toHaveBeenCalledWith(VIENE)
    })

    it('una semana con comidas ya confirmadas no se rehace', async () => {
      importPlan.mockResolvedValue(LECTURA)
      saveImportedPlan.mockResolvedValue({ pauta_id: 1 })
      getPlan.mockImplementation(async (week) =>
        week === ESTA ? plan(ESTA, 'Pollo con arroz', { status: 'done' }) : null,
      )
      render(<PlanPantalla hoy={HOY} inicial="viene" />)
      await abrirPauta()
      await userEvent.upload(await screen.findByLabelText('PDF del plan'), pdf())
      await userEvent.click(await screen.findByRole('button', { name: 'Guardar' }))
      expect(
        await screen.findByText(
          'Pauta guardada. Esta semana ya tiene comidas confirmadas: el plan se aplica desde la que viene.',
        ),
      ).toBeInTheDocument()
      expect(generatePlan).not.toHaveBeenCalledWith(ESTA, null)
    })
  })
})

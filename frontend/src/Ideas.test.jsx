import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { IdeasScreen, shortFoodName } from './Ideas.jsx'
import { createDish, dishIdeas, ideaDraft, previewDish } from './api.js'

vi.mock('./api.js')

const FOOD = { id: 7, name: 'Acelga, cruda' }

const idea = (over = {}) => ({
  id: 1,
  name: 'Acelgas esparragadas',
  url: 'https://www.directoalpaladar.com/acelgas-esparragadas',
  method: 'sartén',
  minutes: 30,
  new: false,
  ...over,
})

const answer = (over = {}) => ({
  ideas: [idea()],
  new_count: 0,
  refusal: null,
  quota_scope: null,
  stored_at: '2026-09-12T10:00:00Z',
  ...over,
})

const status = () => screen.getByRole('status')
const more = () => screen.getByRole('button', { name: /Otras ideas|Buscando/ })

beforeEach(() => vi.resetAllMocks())

describe('shortFoodName', () => {
  it('se queda con lo que va antes de la primera coma, en minúscula', () => {
    expect(shortFoodName('Acelga, cruda')).toBe('acelga')
    expect(shortFoodName('Pan de la panadería')).toBe('pan de la panadería')
  })
})

describe('IdeasScreen', () => {
  it('cada idea es un enlace a la receta original, en otra pestaña', async () => {
    dishIdeas.mockResolvedValue(answer())
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    const link = await screen.findByRole('link', { name: /Acelgas esparragadas/ })
    expect(link).toHaveAttribute('href', 'https://www.directoalpaladar.com/acelgas-esparragadas')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'))
    expect(link).toHaveTextContent('directoalpaladar.com ↗')
    expect(link).toHaveTextContent('30MIN')
    expect(link).toHaveTextContent('sartén')
  })

  it('una receta sin minutos no dice cero', async () => {
    dishIdeas.mockResolvedValue(answer({ ideas: [idea({ minutes: null, method: null })] }))
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    const link = await screen.findByRole('link', { name: /Acelgas esparragadas/ })
    expect(link).not.toHaveTextContent('MIN')
    expect(link).not.toHaveTextContent('0')
  })

  it('lo guardado dice cuándo, y que «Otras ideas» busca más', async () => {
    dishIdeas.mockResolvedValue(answer())
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    await screen.findByRole('link', { name: /Acelgas/ })
    expect(status()).toHaveTextContent('Guardadas el 12 sep · «Otras ideas» busca más')
    expect(more()).toBeEnabled()
  })

  it('la primera vez espera con el esqueleto y lo dice', async () => {
    let resolve
    dishIdeas.mockReturnValue(new Promise((r) => (resolve = r)))
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    expect(screen.getByText('Buscando recetas con acelga en la web. Tarda unos segundos.')).toBeInTheDocument()
    expect(document.querySelectorAll('.idea-skeleton')).toHaveLength(3)
    expect(screen.getByRole('button', { name: 'Buscando…' })).toBeDisabled()
    await act(async () => resolve(answer()))
    expect(await screen.findByRole('link', { name: /Acelgas/ })).toBeInTheDocument()
  })

  it('«Otras ideas» pone lo nuevo arriba, marcado, y cuenta', async () => {
    dishIdeas.mockResolvedValueOnce(answer())
    dishIdeas.mockResolvedValueOnce(
      answer({
        ideas: [idea({ id: 2, name: 'Acelgas a la vasca', url: 'https://www.consumer.es/a.html', new: true }), idea()],
        new_count: 1,
      }),
    )
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    await screen.findByRole('link', { name: /Acelgas esparragadas/ })
    await userEvent.click(more())
    await waitFor(() => expect(dishIdeas).toHaveBeenLastCalledWith(7, { more: true }))
    const links = await screen.findAllByRole('link')
    expect(links[0]).toHaveTextContent('Acelgas a la vasca')
    expect(links[0]).toHaveTextContent('Nueva')
    expect(links[1]).not.toHaveTextContent('Nueva')
    expect(status()).toHaveTextContent('1 idea nueva · 2 guardadas')
  })

  it('cuenta en plural, y dice cuando no ha salido nada nuevo', async () => {
    dishIdeas.mockResolvedValueOnce(answer())
    dishIdeas.mockResolvedValueOnce(answer({ new_count: 0 }))
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    await screen.findByRole('link', { name: /Acelgas/ })
    await userEvent.click(more())
    await waitFor(() => expect(status()).toHaveTextContent('Ninguna idea nueva · 1 guardada'))
  })

  it('sin cuota del día, lo guardado sigue y el botón se apaga', async () => {
    dishIdeas.mockResolvedValueOnce(answer())
    dishIdeas.mockResolvedValueOnce(answer({ refusal: 'quota', quota_scope: 'day' }))
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    await screen.findByRole('link', { name: /Acelgas/ })
    await userEvent.click(more())
    await waitFor(() => expect(status()).toHaveTextContent('Se ha agotado la cuota de hoy. Vuelve mañana.'))
    expect(screen.getByRole('link', { name: /Acelgas esparragadas/ })).toBeInTheDocument()
    expect(more()).toBeDisabled()
  })

  it('la cuota del minuto deja volver a probar', async () => {
    dishIdeas.mockResolvedValue(answer({ ideas: [], stored_at: null, refusal: 'quota', quota_scope: 'minute' }))
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    await waitFor(() =>
      expect(status()).toHaveTextContent('Demasiadas peticiones seguidas. Prueba dentro de un minuto.'),
    )
    expect(more()).toBeEnabled()
  })

  it.each([
    ['unusable', 'La respuesta no se ha podido leer. Inténtalo otra vez.'],
    ['unavailable', 'No he podido preguntar. Inténtalo otra vez.'],
  ])('nombra el fallo (%s)', async (refusal, copy) => {
    dishIdeas.mockResolvedValue(answer({ ideas: [], stored_at: null, refusal }))
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    await waitFor(() => expect(status()).toHaveTextContent(copy))
  })

  it('un error de red no deja la pantalla colgada', async () => {
    dishIdeas.mockRejectedValue(new Error('offline'))
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    await waitFor(() => expect(status()).toHaveTextContent('No he podido preguntar. Inténtalo otra vez.'))
    expect(more()).toBeEnabled()
  })

  it('«Cerrar» vuelve', async () => {
    dishIdeas.mockResolvedValue(answer())
    const onClose = vi.fn()
    render(<IdeasScreen food={FOOD} onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }))
    expect(onClose).toHaveBeenCalled()
  })
})

describe('IdeasScreen → convertir en plato', () => {
  const plato = () =>
    screen.getByRole('button', { name: 'Convertir en plato: Acelgas esparragadas' })

  it('va al lado del enlace, no dentro: la fila sigue abriendo la receta', async () => {
    dishIdeas.mockResolvedValue(answer())
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    const link = await screen.findByRole('link', { name: /Acelgas esparragadas/ })
    expect(plato()).toHaveTextContent('+Plato')
    expect(link).not.toContainElement(plato())
    expect(link.closest('li')).toContainElement(plato())
  })

  it('abre el borrador encima de la lista, y «Cancelar» vuelve a ella', async () => {
    dishIdeas.mockResolvedValue(answer())
    ideaDraft.mockResolvedValue({
      idea_id: 1,
      name: 'Acelgas esparragadas',
      url: idea().url,
      method: null,
      servings: null,
      servings_published: false,
      lines: [],
      refusal: null,
      dish_id: null,
    })
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    await screen.findByRole('link', { name: /Acelgas esparragadas/ })
    await userEvent.click(plato())
    expect(await screen.findByRole('dialog', { name: 'Convertir en plato' })).toBeInTheDocument()
    expect(ideaDraft).toHaveBeenCalledWith(1)
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog', { name: 'Convertir en plato' })).not.toBeInTheDocument()
  })

  it('una idea ya guardada dice «Guardado» en vez del botón', async () => {
    dishIdeas.mockResolvedValue(answer({ ideas: [idea({ dish_id: 42 })] }))
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    const link = await screen.findByRole('link', { name: /Acelgas esparragadas/ })
    expect(link.closest('li')).toHaveTextContent('Guardado')
    expect(
      screen.queryByRole('button', { name: /Convertir en plato/ }),
    ).not.toBeInTheDocument()
  })

  it('al guardar, la fila pasa a «Guardado» sin volver a pedir la lista', async () => {
    dishIdeas.mockResolvedValue(answer())
    ideaDraft.mockResolvedValue({
      idea_id: 1,
      name: 'Acelgas esparragadas',
      url: idea().url,
      method: null,
      servings: 2,
      servings_published: true,
      lines: [
        {
          text: '500 gr de acelgas',
          quantity: 500,
          unit: 'g',
          recipe_grams: 500,
          grams: 250,
          status: 'chosen',
          food: { id: 7, name: 'Acelga, cruda' },
          candidates: [{ id: 7, name: 'Acelga, cruda' }],
        },
      ],
      refusal: null,
      dish_id: null,
    })
    previewDish.mockResolvedValue({ per_serving: { kcal: 50 } })
    createDish.mockResolvedValue({ id: 42, name: 'Acelgas esparragadas' })
    render(<IdeasScreen food={FOOD} onClose={() => {}} />)
    await screen.findByRole('link', { name: /Acelgas esparragadas/ })
    await userEvent.click(plato())
    const guardar = await screen.findByRole('button', { name: 'Guardar en mis platos' })
    await waitFor(() => expect(guardar).toBeEnabled())
    await userEvent.click(guardar)

    await waitFor(() =>
      expect(screen.queryByRole('dialog', { name: 'Convertir en plato' })).not.toBeInTheDocument(),
    )
    const link = screen.getByRole('link', { name: /Acelgas esparragadas/ })
    expect(link.closest('li')).toHaveTextContent('Guardado')
    expect(dishIdeas).toHaveBeenCalledTimes(1)
  })
})

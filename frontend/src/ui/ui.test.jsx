import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { Chip, Fab, ListRow, Sheet } from './index.js'

describe('Sheet', () => {
  // La hoja es modal: un lector de pantalla tiene que saber que lo de debajo ya
  // no cuenta, y que la hoja se llama como su título.
  it('is a modal dialog named by its title', () => {
    render(
      <Sheet open title="Tu objetivo" onClose={() => {}}>
        <p>2.230 kcal</p>
      </Sheet>,
    )
    const dialog = screen.getByRole('dialog', { name: 'Tu objetivo' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('2.230 kcal')
  })

  it('renders nothing while closed', () => {
    render(
      <Sheet open={false} title="Tu objetivo" onClose={() => {}}>
        <p>2.230 kcal</p>
      </Sheet>,
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  // Se echa abajo como cualquier hoja de Android: tocando fuera o con Atrás
  // (Escape en el teclado). Tocar dentro no la cierra.
  it('closes from the scrim and from Escape, not from inside', async () => {
    const onClose = vi.fn()
    const user = userEvent.setup()
    const { container } = render(
      <Sheet open title="Altura" onClose={onClose}>
        <p>190 cm</p>
      </Sheet>,
    )
    await user.click(screen.getByText('190 cm'))
    expect(onClose).not.toHaveBeenCalled()

    await user.click(container.querySelector('.sheet-scrim'))
    expect(onClose).toHaveBeenCalledTimes(1)

    await user.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('reuses the v1 sheet layout and adds the v2 skin', () => {
    render(
      <Sheet open title="Altura" onClose={() => {}}>
        <p>190 cm</p>
      </Sheet>,
    )
    expect(screen.getByRole('dialog')).toHaveClass('sheet', 'ui-sheet')
  })
})

describe('Fab', () => {
  // Extendido: el verbo va escrito. Un «+» solo no dice si añade una comida o
  // una pesada.
  it('is a button named by its verb', async () => {
    const onClick = vi.fn()
    render(<Fab icon="+" label="Añadir comida" onClick={onClick} />)
    const button = screen.getByRole('button', { name: 'Añadir comida' })
    await userEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })
})

describe('Chip', () => {
  it('reports its state when it is a choice', () => {
    render(
      <>
        <Chip selected>Bajar</Chip>
        <Chip selected={false}>Mantener</Chip>
      </>,
    )
    expect(screen.getByRole('button', { name: 'Bajar' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Mantener' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  // Un atajo —la línea del plan— no está «pulsado» ni «sin pulsar»: decirlo
  // haría que un lector anunciara un estado que no existe.
  it('is a plain action when it is a shortcut', () => {
    render(<Chip onClick={() => {}}>Bajando 0,5 kg/sem</Chip>)
    expect(screen.getByRole('button', { name: 'Bajando 0,5 kg/sem' })).not.toHaveAttribute(
      'aria-pressed',
    )
  })
})

describe('ListRow', () => {
  it('is one button with its label, hint and value', async () => {
    const onClick = vi.fn()
    render(
      <ListRow
        label="Objetivo diario"
        hint="Medido con tus datos · 28 días"
        value="2.230 kcal"
        onClick={onClick}
      />,
    )
    const row = screen.getByRole('button', { name: /Objetivo diario/ })
    expect(row).toHaveTextContent('Medido con tus datos · 28 días')
    expect(row).toHaveTextContent('2.230 kcal')
    await userEvent.click(row)
    expect(onClick).toHaveBeenCalledOnce()
  })

  // `NULL` no es `0`: un dato que no hay se imprime `—`, con la misma tinta.
  it('prints a dash for a missing value', () => {
    render(<ListRow label="Altura" value={null} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: /Altura/ }).querySelector('.ui-row-value')).toHaveTextContent('—')
  })
})

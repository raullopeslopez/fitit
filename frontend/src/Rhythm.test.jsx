import { render, screen } from '@testing-library/react'

import Rhythm from './Rhythm.jsx'

let seq = 0
const group = (name, n) =>
  Array.from({ length: n }, () => ({ id: (seq += 1), muscle_group: name }))

const day = (date, ...blocks) => ({ date, workouts: [{ id: (seq += 1), sets: blocks.flat() }] })

// 26 jul 2026 is a Sunday, so four weeks back from the current one starts on
// Monday 29 jun and the window is a full 28 days.
const SUNDAY = '2026-07-26'
const cellOn = (container, date) => container.querySelector(`.rhythm-day[data-date="${date}"]`)
const rowFor = (container, name) =>
  [...container.querySelectorAll('.rhythm-row')].find((r) =>
    r.querySelector('.rhythm-name').textContent.includes(name),
  )

describe('Rhythm', () => {
  const LOG = [
    day('2026-07-22', group('Espalda', 5)),
    day('2026-07-20', group('Pecho', 4), group('Tríceps', 2)),
    day('2026-07-15', group('Pecho', 2)),
    day('2026-06-30', group('Cuádriceps', 3)),
  ]

  it('gives each muscle a row, most abandoned first, named in ink', () => {
    const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
    const names = [...container.querySelectorAll('.rhythm-name')]
      .map((n) => n.textContent.trim())
      .filter(Boolean)
    expect(names).toEqual(['Cuádriceps', 'Pecho', 'Tríceps', 'Espalda'])
  })

  // The user asked to keep the palette. It survives because the row states its
  // muscle in text, so the hue rides a mark beside a name instead of being the
  // only thing saying which muscle this is.
  it('keeps the muscle colour on the mark, with the name beside it', () => {
    const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
    const row = rowFor(container, 'Pecho')
    expect(row.querySelector('.dot').style.getPropertyValue('--chip')).toBe('var(--m-pecho)')
    expect(cellOn(row, '2026-07-20').style.getPropertyValue('--m')).toBe('var(--m-pecho)')
  })

  it('marks the days that muscle was trained, and only those', () => {
    const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
    const row = rowFor(container, 'Pecho')
    expect(cellOn(row, '2026-07-20')).toHaveClass('is-worked')
    expect(cellOn(row, '2026-07-15')).toHaveClass('is-worked')
    expect(cellOn(row, '2026-07-21')).not.toHaveClass('is-worked')
    // Espalda trained on the 22nd is the other row's day, not this one's.
    expect(cellOn(row, '2026-07-22')).not.toHaveClass('is-worked')
  })

  // The whole point of the split with the period summary: this card says when,
  // that one says how much. Four sets and two draw the same mark.
  it('draws a heavy day and a light one exactly the same', () => {
    // Both midweek, so the only thing that could differ between them is volume.
    const { container } = render(
      <Rhythm
        days={[day('2026-07-15', group('Pecho', 2)), day('2026-07-16', group('Pecho', 12))]}
        endDate={SUNDAY}
      />,
    )
    const row = rowFor(container, 'Pecho')
    const light = cellOn(row, '2026-07-15')
    const heavy = cellOn(row, '2026-07-16')
    expect(heavy.className).toBe(light.className)
    expect(heavy.getAttribute('style')).toBe(light.getAttribute('style'))
  })

  it('says how long since each muscle, and names today as today', () => {
    const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
    expect(rowFor(container, 'Cuádriceps').querySelector('.rhythm-since').textContent).toBe('26 d')
    expect(rowFor(container, 'Espalda').querySelector('.rhythm-since').textContent).toBe('4 d')

    const { container: today } = render(<Rhythm days={LOG} endDate="2026-07-22" />)
    expect(rowFor(today, 'Espalda').querySelector('.rhythm-since').textContent).toBe('hoy')
  })

  it('runs a column per day of the window, week boundaries every seven', () => {
    const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
    const track = rowFor(container, 'Pecho').querySelector('.rhythm-track')
    expect(track.querySelectorAll('.rhythm-day')).toHaveLength(28)
    const starts = [...track.querySelectorAll('.is-week-start')].map((c) => c.dataset.date)
    // The first column opens no gap — there is nothing to its left.
    expect(starts).toEqual(['2026-07-06', '2026-07-13', '2026-07-20'])
  })

  it('spans each month label over its own days', () => {
    const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
    const months = [...container.querySelectorAll('.rhythm-months span')]
    expect(months.map((m) => m.textContent)).toEqual(['jun', 'jul'])
    // 29 and 30 jun, then all 26 days of july in the window.
    expect(months[0].style.getPropertyValue('--cols')).toBe('2')
    expect(months[1].style.getPropertyValue('--cols')).toBe('26')
  })

  it('labels each week with the Monday it starts on and marks the one you are in', () => {
    const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
    const weeks = [...container.querySelectorAll('.rhythm-weeks span')]
    expect(weeks.map((w) => w.textContent)).toEqual(['29', '6', '13', '20'])
    expect(weeks.filter((w) => w.classList.contains('is-current'))).toHaveLength(1)
    expect(weeks.at(-1)).toHaveClass('is-current')
  })

  it('outlines today in every row, trained or not', () => {
    const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
    const today = container.querySelectorAll('.rhythm-day.is-today')
    expect(today).toHaveLength(4) // one per muscle row
    expect([...today].every((c) => c.dataset.date === SUNDAY)).toBe(true)
    expect([...today].every((c) => !c.classList.contains('is-worked'))).toBe(true)
  })

  // The legend existed because colour was carrying the muscle on its own. With
  // the name on the row there is nothing left for it to name, and the filter it
  // doubled as is answered by the rows already being one muscle each.
  it('has no legend and no filter chips', () => {
    const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
    expect(container.querySelector('.muscle-chips')).toBeNull()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('says so when nothing in the log carries a muscle', () => {
    const { container } = render(
      <Rhythm days={[day('2026-07-20', group(null, 3))]} endDate={SUNDAY} />,
    )
    expect(container.querySelector('.rhythm')).toBeNull()
    expect(screen.getByText(/todavía no hay series/i)).toBeInTheDocument()
  })

  it('reads a row out as a frequency for a screen reader', () => {
    const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
    expect(rowFor(container, 'Pecho').querySelector('.rhythm-track')).toHaveAttribute(
      'aria-label',
      'Pecho: 2 días de 28',
    )
  })
})

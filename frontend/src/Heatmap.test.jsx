import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Heatmap from './Heatmap.jsx'

let seq = 0
const group = (name, n) =>
  Array.from({ length: n }, () => ({ id: (seq += 1), muscle_group: name }))

const day = (date, ...blocks) => ({ date, workouts: [{ id: (seq += 1), sets: blocks.flat() }] })

// 26 jul 2026 is a Sunday, so the last column is the week of the 20th.
const SUNDAY = '2026-07-26'
const cellOn = (container, date) =>
  container.querySelector(`.heat-cell[data-date="${date}"]`)

describe('Heatmap', () => {
  it('colours a day with the muscle it worked', () => {
    const { container } = render(
      <Heatmap days={[day('2026-07-20', group('Pecho', 6))]} weeks={4} endDate={SUNDAY} />,
    )
    const cell = cellOn(container, '2026-07-20')
    expect(cell.style.getPropertyValue('--m-a')).toBe('var(--m-pecho)')
    expect(cell).toHaveClass('is-worked')
  })

  it('splits a day between two muscles when both did real work', () => {
    const { container } = render(
      <Heatmap
        days={[day('2026-07-20', group('Pecho', 6), group('Tríceps', 4))]}
        weeks={4}
        endDate={SUNDAY}
      />,
    )
    const cell = cellOn(container, '2026-07-20')
    expect(cell).toHaveClass('is-split')
    expect(cell.style.getPropertyValue('--m-b')).toBe('var(--m-triceps)')
  })

  // A single warm-up set of something else shouldn't repaint half the day.
  it('keeps one colour when the second muscle was an afterthought', () => {
    const { container } = render(
      <Heatmap
        days={[day('2026-07-20', group('Pecho', 10), group('Core', 1))]}
        weeks={4}
        endDate={SUNDAY}
      />,
    )
    expect(cellOn(container, '2026-07-20')).not.toHaveClass('is-split')
  })

  it('reads volume as opacity, in the same four steps as before', () => {
    const { container } = render(
      <Heatmap
        days={[day('2026-07-20', group('Pecho', 3)), day('2026-07-22', group('Pecho', 12))]}
        weeks={4}
        endDate={SUNDAY}
      />,
    )
    expect(cellOn(container, '2026-07-20')).toHaveClass('heat-v1')
    expect(cellOn(container, '2026-07-22')).toHaveClass('heat-v3')
  })

  it('outlines today, trained or not', () => {
    const { container } = render(
      <Heatmap days={[day('2026-07-20', group('Pecho', 6))]} weeks={4} endDate={SUNDAY} />,
    )
    const today = container.querySelectorAll('.heat-today')
    expect(today).toHaveLength(1)
    expect(today[0].dataset.date).toBe(SUNDAY)
  })

  // A column is a week, and the weekly set count is what this app is measured
  // in — so "which of these ten is the one I'm living in" has to be answerable
  // without counting back from the right edge.
  it('marks the week you are in, not just the day', () => {
    const { container } = render(
      <Heatmap days={[day('2026-07-20', group('Pecho', 6))]} weeks={4} endDate={SUNDAY} />,
    )
    const current = container.querySelectorAll('.heat-col.is-current')
    expect(current).toHaveLength(1)
    // 26 jul is a Sunday, so the week you are in is the one starting the 20th.
    expect(current[0].querySelector('.heat-cell').dataset.date).toBe('2026-07-20')
    // Its date label carries the same mark, or the column has nothing under it
    // to name the week it is.
    const labels = [...container.querySelectorAll('.heat-weeks span')]
    expect(labels.filter((l) => l.classList.contains('is-current'))).toHaveLength(1)
    expect(labels.at(-1)).toHaveClass('is-current')
  })

  it('leaves the rest of the current week blank rather than empty-looking', () => {
    const { container } = render(
      <Heatmap days={[day('2026-07-20', group('Pecho', 6))]} weeks={4} endDate="2026-07-22" />,
    )
    expect(cellOn(container, '2026-07-25')).toHaveClass('heat-future')
  })

  it('spans each month label over its own columns and opens a gap at the change', () => {
    const { container } = render(
      <Heatmap
        // Trained in the first week too, or the grid would start at the last
        // one and there would be no month change left to label.
        days={[day('2026-06-29', group('Pecho', 4)), day('2026-07-20', group('Pecho', 6))]}
        weeks={4}
        endDate={SUNDAY}
      />,
    )
    // Four weeks back from 20 jul: 29 jun, 6 jul, 13 jul, 20 jul.
    const months = [...container.querySelectorAll('.heat-months span')]
    expect(months.map((m) => m.textContent)).toEqual(['jun', 'jul'])
    expect(months[1].style.getPropertyValue('--cols')).toBe('3')
    expect(months[1]).toHaveClass('is-month-start')
    // The column and its date shift with the label, or the three drift apart.
    expect(container.querySelectorAll('.heat-col')[1]).toHaveClass('is-month-start')
    expect(container.querySelectorAll('.heat-weeks span')[1]).toHaveClass('is-month-start')
  })

  it('labels each column with the Monday it starts on', () => {
    const { container } = render(
      <Heatmap
        days={[day('2026-06-29', group('Pecho', 4)), day('2026-07-20', group('Pecho', 6))]}
        weeks={4}
        endDate={SUNDAY}
      />,
    )
    const weeks = [...container.querySelectorAll('.heat-weeks span')]
    expect(weeks.map((w) => w.textContent)).toEqual(['29', '6', '13', '20'])
  })

  it('filters the grid to one muscle, receding the rest', async () => {
    const { container } = render(
      <Heatmap
        days={[day('2026-07-20', group('Pecho', 6)), day('2026-07-22', group('Cuádriceps', 6))]}
        weeks={4}
        endDate={SUNDAY}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: /pecho/i }))

    expect(cellOn(container, '2026-07-20')).not.toHaveClass('is-dimmed')
    expect(cellOn(container, '2026-07-22')).toHaveClass('is-dimmed')

    // Tapping it again clears the filter.
    await userEvent.click(screen.getByRole('button', { name: /pecho/i }))
    expect(cellOn(container, '2026-07-22')).not.toHaveClass('is-dimmed')
  })

  it('offers a chip only for the muscles the log actually has', () => {
    render(<Heatmap days={[day('2026-07-20', group('Pecho', 6))]} weeks={4} endDate={SUNDAY} />)
    expect(screen.getByRole('button', { name: /pecho/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /cuádriceps/i })).not.toBeInTheDocument()
  })

  it('tells you what a day was when you tap it', async () => {
    render(<Heatmap days={[day('2026-07-20', group('Pecho', 6))]} weeks={4} endDate={SUNDAY} />)
    await userEvent.click(screen.getByLabelText(/2026-07-20.*6 series/i))
    expect(await screen.findByText(/Pecho · 6 series/i)).toBeInTheDocument()
  })

  // 15 weeks of 21px cells plus a seven-row chip column is ~500px of content in
  // a 320px card: on the phone the grid was clipped at both edges, the weekday
  // labels fell off the left and the chips ran past the bottom of the calendar.
  it('stops at a number of weeks that fits a phone', () => {
    // 18 may is ten weeks back from the week of the 20th — the oldest column
    // the card will draw however far the log goes.
    const { container } = render(
      <Heatmap
        days={[day('2026-04-06', group('Pecho', 4)), day('2026-05-18', group('Pecho', 4))]}
        endDate={SUNDAY}
      />,
    )
    expect(container.querySelectorAll('.heat-col')).toHaveLength(10)
    expect(container.querySelectorAll('.heat-weeks span')[0].textContent).toBe('18')
  })

  // Ten weeks is the ceiling, not the width. The card used to draw all ten
  // whatever the log held, so a young one spent most of its width on months
  // that predate the first workout.
  it('starts at the first week you trained, not ten back on the calendar', () => {
    const { container } = render(
      <Heatmap days={[day('2026-07-13', group('Pecho', 4))]} endDate={SUNDAY} />,
    )
    const weeks = [...container.querySelectorAll('.heat-weeks span')]
    expect(weeks.map((w) => w.textContent)).toEqual(['13', '20'])
  })

  // The labels are built from the grid, so they have to survive the trim with
  // it: a month that lost all its columns must lose its label too, and the gap
  // has to reopen at whatever month change is left.
  it('re-spans the month labels over what is left after the trim', () => {
    const { container } = render(
      <Heatmap
        days={[day('2026-06-29', group('Pecho', 4)), day('2026-07-20', group('Pecho', 6))]}
        weeks={8}
        endDate={SUNDAY}
      />,
    )
    const months = [...container.querySelectorAll('.heat-months span')]
    // Asked for 8 weeks from 8 jun; three of them predate the log and go, so
    // "may"/the early june columns never reach the label row.
    expect(months.map((m) => m.textContent)).toEqual(['jun', 'jul'])
    expect(months[0].style.getPropertyValue('--cols')).toBe('1')
    expect(months[1].style.getPropertyValue('--cols')).toBe('3')
    expect(container.querySelectorAll('.heat-col')[1]).toHaveClass('is-month-start')
  })

  it('still draws the current week when nothing has ever been logged', () => {
    const { container } = render(<Heatmap days={[]} endDate={SUNDAY} />)
    expect(container.querySelectorAll('.heat-col')).toHaveLength(1)
    expect(cellOn(container, SUNDAY)).toHaveClass('heat-today')
  })

  it('puts the chips under the grid, on one swipeable line', () => {
    const { container } = render(
      <Heatmap
        days={[day('2026-07-20', group('Pecho', 6)), day('2026-07-21', group('Cuádriceps', 4))]}
        endDate={SUNDAY}
      />,
    )
    // Seven groups stacked down the right are taller than the grid they label,
    // so they ride below it in the row the app already uses for muscle chips.
    const chips = container.querySelector('.muscle-chips')
    expect(chips).not.toBeNull()
    const grid = container.querySelector('.heat-grid')
    expect(grid.compareDocumentPosition(chips) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('keeps the weekday labels beside the grid', () => {
    const { container } = render(<Heatmap days={[]} endDate={SUNDAY} />)
    expect([...container.querySelectorAll('.heat-daylabel')].map((l) => l.textContent)).toEqual([
      'L',
      'M',
      'X',
      'J',
      'V',
      'S',
      'D',
    ])
  })

  // Both were consistency scoring, and neither said anything about training.
  it('has no streak and no intensity legend', () => {
    const { container } = render(
      <Heatmap days={[day('2026-07-20', group('Pecho', 6))]} weeks={4} endDate={SUNDAY} />,
    )
    expect(screen.queryByText(/racha/i)).not.toBeInTheDocument()
    expect(container.querySelector('.heat-legend')).toBeNull()
  })
})

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import Rhythm from './Rhythm.jsx'

let seq = 0
const group = (name, n, exercise = 'Press banca') =>
  Array.from({ length: n }, () => ({
    id: (seq += 1),
    muscle_group: name,
    exercise_name: exercise,
  }))

const day = (date, ...blocks) => ({ date, workouts: [{ id: (seq += 1), sets: blocks.flat() }] })

// 26 jul 2026 is a Sunday, so four weeks back from the current one starts on
// Monday 29 jun and the window is a full 28 days.
const SUNDAY = '2026-07-26'
const rowFor = (name) => screen.getByRole('button', { name: new RegExp(`^${name}`) })
const sinceOf = (name) => rowFor(name).querySelector('.rhythm-since').textContent
const freqOf = (name) => rowFor(name).querySelector('.rhythm-freq').textContent

// The card is one sentence per muscle: how often, and how long ago. The
// calendar it used to be is still there, one tap down, for the muscle you ask
// about — a grid of twenty-eight cells per row needed a legend to be read,
// and a sentence does not.
describe('Rhythm', () => {
  const LOG = [
    day('2026-07-22', group('Espalda', 5, 'Remo con barra')),
    day('2026-07-20', group('Pecho', 4), group('Pecho', 2, 'Aperturas'), group('Tríceps', 2, 'Fondos')),
    day('2026-07-15', group('Pecho', 2)),
    day('2026-06-30', group('Cuádriceps', 3, 'Sentadilla')),
  ]

  it('gives each muscle a row, most abandoned first', () => {
    const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
    const names = [...container.querySelectorAll('.rhythm-name')].map((n) => n.textContent.trim())
    expect(names).toEqual(['Cuádriceps', 'Pecho', 'Tríceps', 'Espalda'])
  })

  it('says how often, in days trained over the four weeks', () => {
    render(<Rhythm days={LOG} endDate={SUNDAY} />)
    expect(freqOf('Pecho')).toBe('2 veces en 4 semanas')
    expect(freqOf('Tríceps')).toBe('1 vez en 4 semanas')
  })

  it('says how long ago in words: hoy, ayer, hace N días', () => {
    render(<Rhythm days={LOG} endDate={SUNDAY} />)
    expect(sinceOf('Cuádriceps')).toBe('hace 26 días')
    expect(sinceOf('Espalda')).toBe('hace 4 días')
  })

  it('names today and yesterday as such', () => {
    const { unmount } = render(<Rhythm days={LOG} endDate="2026-07-22" />)
    expect(sinceOf('Espalda')).toBe('hoy')
    unmount()
    render(<Rhythm days={LOG} endDate="2026-07-23" />)
    expect(sinceOf('Espalda')).toBe('ayer')
  })

  // Over a week is what the order is there to surface, so it is the one thing
  // on the card in ink.
  it('inks a muscle left alone for more than a week', () => {
    render(<Rhythm days={LOG} endDate={SUNDAY} />)
    expect(rowFor('Cuádriceps')).toHaveClass('is-cold')
    expect(rowFor('Espalda')).not.toHaveClass('is-cold')
  })

  it('keeps the muscle colour on a mark beside its name', () => {
    render(<Rhythm days={LOG} endDate={SUNDAY} />)
    expect(rowFor('Pecho').querySelector('.dot').style.getPropertyValue('--chip')).toBe(
      'var(--m-pecho)',
    )
  })

  describe('a row opened', () => {
    it('starts closed, and opens on a tap', async () => {
      const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
      expect(container.querySelector('.rhythm-detail')).toBeNull()
      expect(rowFor('Pecho')).toHaveAttribute('aria-expanded', 'false')

      await userEvent.click(rowFor('Pecho'))
      expect(rowFor('Pecho')).toHaveAttribute('aria-expanded', 'true')
      expect(container.querySelectorAll('.rhythm-detail')).toHaveLength(1)
    })

    // What you would repeat or change: the exercises of that muscle on the
    // last day it was trained, most sets first.
    it('shows the last session, by exercise', async () => {
      const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
      await userEvent.click(rowFor('Pecho'))

      const detail = container.querySelector('.rhythm-detail')
      expect(detail.querySelector('.rhythm-last-lab').textContent).toBe('Última vez · lun 20 jul')
      expect(
        [...detail.querySelectorAll('.rhythm-ex')].map((e) => e.textContent.replace(/\s+/g, ' ')),
      ).toEqual(['Press banca 4 series', 'Aperturas 2 series'])
    })

    it('draws the four weeks with that muscle’s days, and today framed', async () => {
      const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
      await userEvent.click(rowFor('Pecho'))

      const cal = container.querySelector('.rhythm-cal')
      expect([...cal.querySelectorAll('.rhythm-week-lab')].map((l) => l.textContent)).toEqual([
        '29 jun',
        '6 jul',
        '13 jul',
        '20 jul',
      ])
      const worked = [...cal.querySelectorAll('.rhythm-cal-day.is-worked')].map(
        (d) => d.dataset.date,
      )
      expect(worked).toEqual(['2026-07-15', '2026-07-20'])
      expect(cal.querySelector('.rhythm-cal-day.is-today').dataset.date).toBe(SUNDAY)
      expect(cal.querySelector('.rhythm-cal-day.is-worked').style.getPropertyValue('--m')).toBe(
        'var(--m-pecho)',
      )
    })

    // The window ends today: the days still to come are not drawn as days
    // you skipped.
    it('leaves the days after today blank', async () => {
      const { container } = render(<Rhythm days={LOG} endDate="2026-07-22" />)
      await userEvent.click(rowFor('Pecho'))
      const cal = container.querySelector('.rhythm-cal')
      expect(cal.querySelectorAll('.rhythm-cal-day')).toHaveLength(24)
      expect(cal.querySelectorAll('.rhythm-cal-blank')).toHaveLength(4)
    })

    it('keeps one row open at a time, and closes it on a second tap', async () => {
      const { container } = render(<Rhythm days={LOG} endDate={SUNDAY} />)
      await userEvent.click(rowFor('Pecho'))
      await userEvent.click(rowFor('Espalda'))
      expect(container.querySelectorAll('.rhythm-detail')).toHaveLength(1)
      expect(rowFor('Pecho')).toHaveAttribute('aria-expanded', 'false')

      await userEvent.click(rowFor('Espalda'))
      expect(container.querySelector('.rhythm-detail')).toBeNull()
    })

    // A muscle last touched before the window still has a last session; the
    // calendar is simply empty for it.
    it('still names the last session when it is older than the window', async () => {
      const stale = [day('2026-05-04', group('Gemelo', 3, 'Gemelo en máquina')), ...LOG]
      const { container } = render(<Rhythm days={stale} endDate={SUNDAY} />)
      expect(freqOf('Gemelo')).toBe('0 veces en 4 semanas')
      await userEvent.click(rowFor('Gemelo'))

      const detail = container.querySelector('.rhythm-detail')
      expect(detail.querySelector('.rhythm-last-lab').textContent).toBe('Última vez · lun 4 may')
      expect(within(detail).getByText('Gemelo en máquina')).toBeInTheDocument()
      expect(detail.querySelector('.rhythm-cal-day.is-worked')).toBeNull()
    })
  })

  it('says so when nothing in the log carries a muscle', () => {
    const { container } = render(
      <Rhythm days={[day('2026-07-20', group(null, 3))]} endDate={SUNDAY} />,
    )
    expect(container.querySelector('.rhythm-row')).toBeNull()
    expect(screen.getByText(/todavía no hay series/i)).toBeInTheDocument()
  })
})

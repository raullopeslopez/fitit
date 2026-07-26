import { useState } from 'react'

import { formatDate } from './format.js'
import { MUSCLE_GROUPS, muscleColor } from './muscles.js'
import { muscleHeatmapGrid } from './stats.js'

// Monday-start.
const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// When a day's second muscle gets at least this share of the first one's sets,
// the cell is split between the two. Below it, the day had a main muscle and a
// bit of something else — one warm-up set of core shouldn't repaint half a leg
// day.
const SPLIT_SHARE = 0.5

// Consecutive columns that belong to the same month, so a label can span its
// own weeks and centre over them instead of sitting on the first one.
function monthRuns(grid) {
  const runs = []
  for (const col of grid) {
    const [y, m] = col[0].date.split('-').map(Number)
    const last = runs.at(-1)
    if (last && last.year === y && last.month === m) last.cols += 1
    else runs.push({ year: y, month: m, cols: 1 })
  }
  return runs
}

// The calendar of what you trained: a column per week, a row per weekday.
// Colour says which muscle, opacity says how much — so a glance answers "have I
// touched legs this month?" without a single number on screen.
// Ten weeks, not fifteen: at 21px a column is 24px of width, and a phone card
// has about 300 to give. Fifteen overflowed it — the grid was clipped at both
// edges and the weekday labels fell off the left. Ten is still two and a half
// months, which is the range the question needs.
export default function Heatmap({ days, weeks = 10, endDate }) {
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState(null)
  const grid = muscleHeatmapGrid(days, { weeks, endDate })
  const runs = monthRuns(grid)

  // Only the muscles this log actually has, in canonical order.
  const present = MUSCLE_GROUPS.filter((m) =>
    grid.some((col) => col.some((c) => c.groups.some((g) => g.group === m))),
  )

  // The first column of every month but the leftmost opens the month gap. The
  // date under it and the label over it have to move with it.
  const monthStarts = new Set()
  let at = 0
  for (const run of runs) {
    if (at > 0) monthStarts.add(at)
    at += run.cols
  }

  function cellProps(cell) {
    const [main, second] = cell.groups
    const split = second && second.sets >= main.sets * SPLIT_SHARE
    const classes = ['heat-cell']
    if (cell.future) classes.push('heat-future')
    else if (main) classes.push('is-worked', `heat-v${cell.level}`)
    if (split) classes.push('is-split')
    if (cell.today) classes.push('heat-today')
    if (filter && main && !cell.groups.some((g) => g.group === filter)) classes.push('is-dimmed')
    return {
      'data-date': cell.date,
      className: classes.join(' '),
      style: main
        ? {
            '--m-a': muscleColor(main.group),
            ...(split ? { '--m-b': muscleColor(second.group) } : {}),
          }
        : undefined,
    }
  }

  return (
    <div className="card card-raised">
      <h2>Qué has entrenado</h2>

      <div className="heatmap heat-cal">
        <div className="heat-days">
          {DAY_LABELS.map((d) => (
            <span key={d} className="heat-daylabel">
              {d}
            </span>
          ))}
        </div>
        <div>
          <div className="heat-months" aria-hidden="true">
            {runs.map((run, i) => (
              <span
                key={`${run.year}-${run.month}`}
                className={i > 0 ? 'is-month-start' : undefined}
                style={{ '--cols': String(run.cols) }}
              >
                {MONTHS[run.month - 1]}
              </span>
            ))}
          </div>
          <div className="heat-grid" role="grid" aria-label="Qué has entrenado">
            {grid.map((col, ci) => (
              <div
                key={col[0].date}
                className={`heat-col${monthStarts.has(ci) ? ' is-month-start' : ''}`}
                role="row"
              >
                {col.map((cell) => {
                  const props = cellProps(cell)
                  if (cell.total === 0 || cell.future) {
                    return (
                      <span
                        key={cell.date}
                        {...props}
                        // Today is outlined even on a rest day — the empty cell
                        // is the point, it's the one you can still fill.
                        aria-label={cell.today ? `${cell.date}: hoy, sin series` : undefined}
                      />
                    )
                  }
                  return (
                    <button
                      key={cell.date}
                      type="button"
                      {...props}
                      aria-label={`${cell.date}: ${cell.total} series`}
                      onClick={() => setSelected(cell)}
                    />
                  )
                })}
              </div>
            ))}
          </div>
          <div className="heat-weeks" aria-hidden="true">
            {grid.map((col, ci) => (
              <span key={col[0].date} className={monthStarts.has(ci) ? 'is-month-start' : undefined}>
                {Number(col[0].date.slice(8))}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* The legend is the filter: naming the colours and narrowing the grid are
          the same act, so there is no second control to learn. Under the grid on
          one swipeable line, not stacked down its right: seven groups make a
          column taller than the calendar it labels, and on a phone that column
          also stole the width the grid needed. */}
      {present.length > 0 && (
        <div className="muscle-chips heat-chips">
          {present.map((m) => (
            <button
              key={m}
              type="button"
              className={`chip${filter === m ? ' is-active' : ''}`}
              style={{ '--chip': muscleColor(m) }}
              aria-pressed={filter === m}
              onClick={() => setFilter((current) => (current === m ? null : m))}
            >
              <span className="dot" aria-hidden="true" />
              {m}
            </button>
          ))}
        </div>
      )}

      <p className="hint">
        Cada columna es una semana (empieza el lunes indicado) · color = músculo · opacidad = series
      </p>

      {selected && (
        <p className="heat-readout">
          {formatDate(selected.date)} · {selected.groups.map((g) => g.group).join(' + ') || 'Sin grupo'} ·{' '}
          {selected.total} {selected.total === 1 ? 'serie' : 'series'}
        </p>
      )}
    </div>
  )
}

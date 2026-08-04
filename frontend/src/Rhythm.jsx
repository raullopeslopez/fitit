import { muscleColor } from './muscles.js'
import { muscleRhythm } from './stats.js'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

// Consecutive days that belong to the same month, so a label can span its own
// stretch of the track instead of sitting on the day the month happens to open.
function monthRuns(dates) {
  const runs = []
  for (const date of dates) {
    const [y, m] = date.split('-').map(Number)
    const last = runs.at(-1)
    if (last && last.year === y && last.month === m) last.cols += 1
    else runs.push({ year: y, month: m, cols: 1 })
  }
  return runs
}

// The window starts on a Monday, so the weeks are just the days in sevens. The
// last one is short — it is the week you are living in.
function weekRuns(dates) {
  const runs = []
  for (let i = 0; i < dates.length; i += 7) {
    runs.push({ start: dates[i], cols: Math.min(7, dates.length - i) })
  }
  return runs
}

// How often you touch each muscle, and what you have stopped touching.
//
// This used to be a calendar — a column per week, a row per weekday, colour for
// the muscle and opacity for the volume. Three encodings in a 21px square, and
// the one it could least afford was volume: the period summary directly above
// already states sets per muscle as a number against a reference, so the grid
// was spending its opacity saying worse what the card above said exactly. Nine
// hues then had to carry the muscle alone, which needs a nine-chip legend, which
// does not fit a phone card — the legend running off the edge was the symptom,
// the encoding was the cause.
//
// So the categorical dimension moves to the y axis, where labels are free: a row
// per muscle, named in ink, a day per column. Colour stays (the user's call) but
// is no longer load-bearing — it rides a mark beside the name it belongs to,
// which is exactly the scope the palette was approved for. The marks are binary,
// because "how much" is the other card's dimension and saying it twice is how
// the two disagree. What is left is frequency, read as density along a row, and
// the gap at the end of one — so the rows are ordered by that gap, longest
// first, and "what should I train today" is answered by the order rather than by
// another control.
export default function Rhythm({ days, weeks = 4, endDate }) {
  const { dates, rows } = muscleRhythm(days, { weeks, endDate })

  if (rows.length === 0) {
    return (
      <div className="card card-raised">
        <h2>Ritmo por músculo</h2>
        <p className="hint">Todavía no hay series asignadas a un músculo.</p>
      </div>
    )
  }

  const months = monthRuns(dates)
  const wks = weekRuns(dates)

  return (
    <div className="card card-raised">
      <h2>Ritmo por músculo</h2>

      {/* One grid for the whole block, with head, rows and foot as `display:
          contents` — the labels have to sit on exactly the same columns as the
          marks, and any layout that computes the track width twice drifts. */}
      <div className="rhythm" style={{ '--days': String(dates.length) }}>
        <div className="rhythm-head">
          <span className="rhythm-name" />
          <div className="rhythm-track rhythm-months" aria-hidden="true">
            {months.map((run) => (
              <span key={`${run.year}-${run.month}`} style={{ '--cols': String(run.cols) }}>
                {MONTHS[run.month - 1]}
              </span>
            ))}
          </div>
          <span className="rhythm-since" />
        </div>

        {rows.map((row) => {
          const trained = row.days.filter((d) => d.worked).length
          return (
            <div key={row.group} className="rhythm-row">
              <span className="rhythm-name">
                <span className="dot" style={{ '--chip': muscleColor(row.group) }} aria-hidden="true" />
                {row.group}
              </span>
              <div
                className="rhythm-track"
                role="img"
                aria-label={`${row.group}: ${trained} días de ${dates.length}`}
              >
                {row.days.map((d, i) => (
                  <span
                    key={d.date}
                    data-date={d.date}
                    className={[
                      'rhythm-day',
                      d.worked && 'is-worked',
                      i > 0 && i % 7 === 0 && 'is-week-start',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    style={d.worked ? { '--m': muscleColor(row.group) } : undefined}
                  />
                ))}
              </div>
              {/* The gap is the only figure on this card, and it is the one you
                  can act on: every other number here is something you already
                  did. */}
              <span className="rhythm-since">{row.since === 0 ? 'hoy' : `${row.since} d`}</span>
            </div>
          )
        })}

        <div className="rhythm-foot">
          <span className="rhythm-name" />
          <div className="rhythm-track rhythm-weeks" aria-hidden="true">
            {wks.map((run, i) => (
              <span
                key={run.start}
                className={i === wks.length - 1 ? 'is-current' : undefined}
                style={{ '--cols': String(run.cols) }}
              >
                {Number(run.start.slice(8))}
              </span>
            ))}
          </div>
          <span className="rhythm-since" />
        </div>
      </div>

      <p className="hint">
        Un punto por día entrenado · a la derecha, días desde la última vez · arriba, lo que llevas
        más tiempo sin tocar
      </p>
    </div>
  )
}

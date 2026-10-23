import { useState } from 'react'

import { muscleColor } from './muscles.js'
import { muscleRhythm, sessionOn } from './stats.js'

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const HEAD = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

const parts = (iso) => iso.split('-').map(Number)
const dayMonth = (iso) => {
  const [, m, d] = parts(iso)
  return `${d} ${MONTHS[m - 1]}`
}
const weekdayOf = (iso) => {
  const [y, m, d] = parts(iso)
  return WEEKDAYS[new Date(y, m - 1, d).getDay()]
}

// How long ago, the way you would say it.
const sinceWords = (n) => (n === 0 ? 'hoy' : n === 1 ? 'ayer' : `hace ${n} días`)

// How often you touch each muscle, and what you have stopped touching.
//
// One sentence per muscle: how many days you trained it in the last four weeks,
// and how long ago the last one was. It replaced a grid of twenty-eight cells
// per row, which said the same thing in a form that needed a legend — a dot
// per day, a figure at the end, a footnote to explain both. Read out loud, the
// sentence is the answer, and the order (longest untouched first) is the
// answer to "what should I train today" without another control.
//
// The calendar is still there for the muscle you ask about: a row opens on its
// last session, by exercise — the thing you would repeat or change — and on its
// four weeks drawn day by day. One open at a time, so the list stays a list.
//
// No volume anywhere: four sets and one draw the same day. How much is Series'
// question, and two tabs answering it are two tabs that can disagree.
export default function Rhythm({ days, weeks = 4, endDate }) {
  const { dates, rows } = muscleRhythm(days, { weeks, endDate })
  const [open, setOpen] = useState(null)

  if (rows.length === 0) {
    return (
      <div className="card card-raised">
        <h2 className="visually-hidden">Ritmo por músculo</h2>
        <p className="hint">Todavía no hay series asignadas a un músculo.</p>
      </div>
    )
  }

  // The window starts on a Monday and ends today, so it splits into whole weeks
  // with the last one cut short; the days still to come are blank, not missed.
  const weekRows = []
  for (let i = 0; i < dates.length; i += 7) weekRows.push(dates.slice(i, i + 7))
  const today = dates.at(-1)

  return (
    <div className="card card-raised rhythm-card" data-seccion>
      <h2 className="visually-hidden">Ritmo por músculo</h2>
      <ul className="rhythm-list">
        {rows.map((row) => {
          const trained = row.days.filter((d) => d.worked).length
          const isOpen = open === row.group
          const worked = new Set(row.days.filter((d) => d.worked).map((d) => d.date))
          return (
            <li key={row.group} className="rhythm-item">
              <button
                type="button"
                className={`rhythm-row${row.since > 7 ? ' is-cold' : ''}`}
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : row.group)}
              >
                <span className="rhythm-id">
                  <span className="rhythm-name">
                    <span
                      className="dot"
                      style={{ '--chip': muscleColor(row.group) }}
                      aria-hidden="true"
                    />
                    {row.group}
                  </span>
                  <span className="rhythm-freq">
                    {trained === 1 ? '1 vez' : `${trained} veces`} en {weeks} semanas
                  </span>
                </span>
                <span className="rhythm-since">{sinceWords(row.since)}</span>
                <span className="rhythm-chev" aria-hidden="true" />
              </button>

              {isOpen && (
                <div className="rhythm-detail">
                  <div className="rhythm-last">
                    <p className="rhythm-last-lab">
                      Última vez · {weekdayOf(row.last)} {dayMonth(row.last)}
                    </p>
                    <ul className="rhythm-exs">
                      {sessionOn(days, row.last, row.group).map((ex) => (
                        <li key={ex.name} className="rhythm-ex">
                          <span>{ex.name}</span>{' '}
                          <span className="rhythm-ex-sets">
                            {ex.sets} {ex.sets === 1 ? 'serie' : 'series'}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="rhythm-cal" role="img" aria-label={`${row.group}: ${trained} días de ${dates.length}`}>
                    <span />
                    {HEAD.map((h) => (
                      <span key={h} className="rhythm-cal-head" aria-hidden="true">
                        {h}
                      </span>
                    ))}
                    {weekRows.map((week, w) => (
                      <div key={week[0]} className="rhythm-cal-week" style={{ '--w': w }}>
                        <span className="rhythm-week-lab">{dayMonth(week[0])}</span>
                        {Array.from({ length: 7 }, (_, d) => {
                          const date = week[d]
                          if (!date) return <span key={d} className="rhythm-cal-blank" />
                          const hit = worked.has(date)
                          return (
                            <span
                              key={date}
                              data-date={date}
                              className={[
                                'rhythm-cal-day',
                                hit && 'is-worked',
                                date === today && 'is-today',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              style={hit ? { '--m': muscleColor(row.group), '--d': d } : { '--d': d }}
                            >
                              {parts(date)[2]}
                            </span>
                          )
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

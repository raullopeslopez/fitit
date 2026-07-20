import { useState } from 'react'

import { formatDate } from './format.js'
import { heatmapGrid, trainingStats } from './stats.js'

// Monday-start; show every other label so the column doesn't crowd on mobile.
const DAY_LABELS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

// A consistency "heat map": one cell per day, amber intensity by how many sets
// you logged. Amber, not green — a heat map of effort is literally heat (see DESIGN.md).
export default function Heatmap({ days, weeks = 15, endDate }) {
  const [selected, setSelected] = useState(null)
  const grid = heatmapGrid(days, { weeks, endDate })
  const { streak } = trainingStats(days)

  return (
    <div className="card heatmap-card">
      <div className="heatmap-head">
        <div className="streak-hero">
          <span className="streak-num">{streak}</span>
          <span className="streak-word">{streak === 1 ? 'día de racha' : 'días de racha'}</span>
        </div>
        <div className="heat-legend" aria-hidden="true">
          {/* Naming the ends in sets, not "menos/más", says what a step is worth. */}
          <span className="heat-legend-label">0</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={`heat-cell heat-${l}`} />
          ))}
          <span className="heat-legend-label">20+</span>
        </div>
      </div>

      <div className="heatmap">
        <div className="heat-days">
          {DAY_LABELS.map((d, i) => (
            <span key={d} className="heat-daylabel">
              {i % 2 === 0 ? d : ''}
            </span>
          ))}
        </div>
        <div className="heat-grid" role="grid" aria-label="Constancia de entrenamiento">
          {grid.map((col, ci) => (
            <div key={ci} className="heat-col" role="row">
              {col.map((cell) =>
                cell.count > 0 && !cell.future ? (
                  <button
                    key={cell.date}
                    type="button"
                    className={`heat-cell heat-${cell.level}${cell.today ? ' heat-today' : ''}`}
                    aria-label={`${cell.date}: ${cell.count} series`}
                    onClick={() => setSelected(cell)}
                  />
                ) : (
                  <span
                    key={cell.date}
                    // Today is outlined even on a rest day — the empty cell is
                    // the point, it's the one you can still fill.
                    className={`heat-cell ${cell.future ? 'heat-future' : `heat-${cell.level}`}${
                      cell.today ? ' heat-today' : ''
                    }`}
                    aria-label={cell.today ? `${cell.date}: hoy, sin series` : undefined}
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <p className="heat-readout">
          {formatDate(selected.date)} · {selected.count}{' '}
          {selected.count === 1 ? 'serie' : 'series'}
        </p>
      )}
    </div>
  )
}

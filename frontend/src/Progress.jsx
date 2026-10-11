import { useEffect, useId, useRef, useState } from 'react'

import {
  deleteExercise,
  listDays,
  listExercises,
  mergeExercise,
  renameExercise,
  setExerciseMuscle,
  setExerciseNote,
} from './api.js'
import { downloadCsv } from './csv.js'
import { deloadWeeks } from './deload.js'
import { DeleteConfirm, damageFromDays } from './DeleteExercise.jsx'
import { ExerciseEditor, MusclePicker } from './ExerciseEditor.jsx'
import { EditTrouble, NoteUndo, clashTrouble, focusEditorTrigger } from './EditTrouble.jsx'
import { fold, formatMonth, formatRange } from './format.js'
import Rhythm from './Rhythm.jsx'
import { RhythmSkeleton, SummarySkeleton, useWaitFlag } from './Skeleton.jsx'
import { MUSCLE_GROUPS, muscleColor, UNGROUPED } from './muscles.js'
import { RetagUndo } from './MuscleRetag.jsx'
import {
  deloadTargets,
  recordLadder,
  sessionsPerPeriod,
  setsPerMuscle,
  typicalWeekSets,
} from './stats.js'
import { showKg } from './units.js'
import { bandState, effectiveBand, shortOf } from './volume.js'

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1)
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`


// The climb of one lift: only the sessions where it actually went up. A step,
// not a slope — nothing here is interpolated, so every corner is a day you did
// it. The estimated-1RM curve this replaces drew a line through days you were
// only maintaining, which reads as progress that never happened.
function Ladder({ rungs, color }) {
  const W = 320
  const H = 130
  const padL = 10
  const padR = 14
  const padT = 16
  const padB = 26
  const weights = rungs.map((r) => r.weight)
  const min = Math.min(...weights)
  const max = Math.max(...weights)
  const span = max - min || 1
  const t = (iso) => {
    const [y, m, d] = iso.split('-').map(Number)
    return new Date(y, m - 1, d).getTime()
  }
  const first = t(rungs[0].date)
  const timeSpan = t(rungs.at(-1).date) - first || 1
  const x = (rung) =>
    rungs.length === 1
      ? padL + (W - padL - padR) / 2
      : padL + ((t(rung.date) - first) / timeSpan) * (W - padL - padR)
  const y = (weight) => padT + (1 - (weight - min) / span) * (H - padT - padB)

  // Hold the old mark until the day the new one landed, then step up.
  const line = rungs
    .flatMap((rung, i) => (i === 0 ? [[padL, y(rung.weight)]] : [
      [x(rung), y(rungs[i - 1].weight)],
      [x(rung), y(rung.weight)],
    ]))
    .map(([px, py]) => `${px},${py}`)
    .join(' ')

  // A month tick only where the month changes, so the axis stays legible.
  const ticks = rungs.filter(
    (rung, i) => i === 0 || rung.date.slice(0, 7) !== rungs[i - 1].date.slice(0, 7),
  )

  return (
    // `data-editor-protect`: la gráfica es lo que esta pantalla *es* —«el
    // contenido por encima del mecanismo que lo produce», DESIGN.md— y el
    // editor no puede posarse encima de ella. Con el segundo paso desplegándose
    // en sitio la tapaba entera; ahora el panel tiene prohibido subir del pie
    // de este `svg`, y lo que no le quepa entre la gráfica y la barra de
    // pestañas se desplaza por dentro.
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="chart"
      data-editor-protect
      role="img"
      aria-label="Récords reales"
    >
      <line
        x1="0"
        x2={W}
        y1={H - padB + 4}
        y2={H - padB + 4}
        stroke="var(--border)"
        strokeWidth="1"
      />
      {rungs.length > 1 && <polyline fill="none" stroke={color} strokeWidth="2" points={line} />}
      {rungs.map((rung, i) => {
        const isLast = i === rungs.length - 1
        // A label past the middle of the chart is hung to the left of its point,
        // or it runs off the edge — the last rung sits on the right border by
        // construction, so its label always would.
        const inwards = x(rung) > W * 0.55
        return (
          <g key={`${rung.date}-${i}`}>
            {/* Every point is the exercise's own muscle colour — mixing in the
                PR amber for the last one reads as a different muscle when
                that muscle happens to be Hombro's amber-adjacent hue. The
                record gets an amber ring instead, same "outline, not a fill"
                treatment as the PR badge on a logged set. */}
            <circle
              cx={x(rung)}
              cy={y(rung.weight)}
              r={isLast ? 5 : 4}
              fill={color}
              stroke={isLast ? 'var(--pr)' : 'none'}
              strokeWidth={isLast ? 2 : 0}
            />
            <text
              x={inwards ? x(rung) - 8 : x(rung) + 6}
              y={y(rung.weight) - 6}
              textAnchor={inwards ? 'end' : 'start'}
              className={isLast ? 'chart-point-label is-last' : 'chart-point-label'}
            >
              {showKg(rung.weight)} × {rung.reps}
            </text>
          </g>
        )
      })}
      {ticks.map((rung) => (
        <text
          key={`t${rung.date}`}
          x={x(rung)}
          y={H - 4}
          className="chart-tick"
        >
          {formatMonth(rung.date).slice(0, 3)}
        </text>
      ))}
    </svg>
  )
}

// What the detail's two marks are. The rows no longer need a sentence saying
// that every band is its own: on one axis in real sets, Femoral's narrow 4–12
// and Hombro's wide 8–25 say it themselves. What a picture cannot say is which
// mark is the target — the rule, not the band, because a ceiling is a limit
// and not somewhere to aim — and how a compound lift is counted.
const REFERENCE_COPY =
  'La raya es el mínimo que hace crecer ese músculo; el gris llega hasta lo ' +
  'máximo de lo que te recuperas. Sin raya, no pide un mínimo. La barra son ' +
  'tus series; un músculo secundario cuenta media serie.'

// The one week where the standing reference is the wrong question. Marked as a
// deload, every row is measured against a third of your own recent average
// instead — and nothing is called short, because training less is the plan.
//
// Only the volume moves. Bickel et al. (2011) and the tapering meta-analyses
// agree on cutting sets while holding the load, and the single trial on
// stopping outright found it cost strength and bought no size, so the card says
// "mismo peso" out loud: it is the half of the instruction people drop.
// "Semana típica" and not "media": the average is taken over the weeks you
// trained, so a month off doesn't quietly lower what the deload asks for.
//
// The switch lives in Perfil → Entreno now (it is set one week in six or
// eight, and the card is read every day), so the card says where it is.
const DELOAD_COPY =
  'Semana de descarga: el objetivo es 1/3 de tu semana típica de las ' +
  'últimas 8. Mismo peso, menos series. Se cambia en Perfil.'

const clamp01 = (n) => Math.min(1, Math.max(0, n))
const pct = (n) => `${Math.round(clamp01(n) * 1000) / 10}%`
const round1 = (n) => Math.round(n * 10) / 10

// The detail's axis, in sets, shared by every row — which is the whole point
// of it: a bar's length means the same number of sets on all ten. Never under
// 25, Hombro's ceiling, so the bands do not redraw themselves week to week;
// past that it grows in fives, so a 32-set week of squats still fits.
const AXIS_MIN = 25
const axisFor = (readings) =>
  Math.max(AXIS_MIN, Math.ceil(Math.max(0, ...readings.map((r) => r.shown)) / 5) * 5)

// What the row says out loud to a screen reader, which cannot see the bar.
const SPOKEN = {
  bajo: 'por debajo de la zona',
  zona: 'en zona',
  sobre: 'por encima de la zona',
  'sin-banda': 'sin zona de referencia',
}

// One muscle in the detail: a bullet graph (Few) on the shared axis. Its own
// band where its sets are, a rule at its minimum, and a bar from zero.
//
// The track this replaces pinned every band to the same stretch so ten of them
// stacked into one column. That made the band identical on every row — it said
// nothing about its own row — and it made a length mean a different number of
// sets on each one. On a real axis the band carries information again (it is
// narrow for Femoral, wide for Hombro), and bars compare as bars.
//
// The bar prints the total, indirect half-sets included, which is the figure
// the row prints. RP's bands are for direct work, so the band is drawn in the
// same total units — `effectiveBand` moves both edges out by the week's own
// indirect share — and the bar and the verdict under it agree.
//
// Grey by default, ink for what falls outside: an excess always (it is work
// already done), a shortfall only once the week can be judged.
function BulletRow({ r, max, index, deload, judging, shortWeek }) {
  const at = (sets) => pct(sets / max)
  const eff = r.band ? effectiveBand(r.group, r.indirect) : null
  const short = judging && !deload && !shortWeek && r.state === 'bajo'
  const out = deload ? r.pastGoal : r.state === 'sobre' || short

  const words = deload
    ? `objetivo ${r.goal}`
    : r.untouched
      ? 'opcional'
      : shortWeek
        ? ''
        : r.state === 'bajo'
          ? shortOf(r.gap)
          : r.state === 'sobre'
            ? `+${round1(r.direct - r.band.mrv)}`
            : r.state === 'sin-banda'
              ? 'sin zona'
              : ''

  // The words ride under the name, not at the end of the bar: a bar that runs
  // to the edge of the axis — an excess, or any row in a deload — leaves no
  // room after it, and a label laid over the bar cannot be read.
  return (
    <div className="sum-row" style={{ '--i': index }}>
      <span className={`sum-id${words ? '' : ' is-bare'}`}>
        <span className="sum-label">
          <span className="sum-dot" style={{ '--chip': muscleColor(r.group) }} aria-hidden="true" />
          <span className="sum-name">{r.group}</span>
        </span>
        <span
          className={`sum-state${short ? ' is-short' : ''}${
            !deload && !shortWeek && r.state === 'sobre' ? ' is-over' : ''
          }`}
        >
          {words}
        </span>
      </span>
      <span className="sum-val">{r.shown}</span>
      <span
        className="sum-track"
        role="img"
        aria-label={`${r.group}: ${r.shown} — ${
          deload ? `objetivo ${r.goal}` : r.untouched ? 'opcional' : SPOKEN[r.state]
        }`}
      >
        <span className="sum-grid" aria-hidden="true">
          {Array.from({ length: Math.ceil(max / 10) - 1 }, (_, i) => (
            <span key={i} style={{ left: at((i + 1) * 10) }} />
          ))}
        </span>
        {eff && !deload && (
          <span
            className="sum-zone"
            style={{ left: at(eff.mev), width: pct((Math.min(eff.mrv, max) - eff.mev) / max) }}
            aria-hidden="true"
          />
        )}
        {r.shown > 0 && (
          <span
            className={`sum-bar${out ? ' is-out' : ''}`}
            style={{ width: at(r.shown) }}
            aria-hidden="true"
          />
        )}
        {eff && !deload && r.band.mev > 0 && (
          <span className="sum-min" style={{ left: at(eff.mev) }} aria-hidden="true" />
        )}
        {deload && <span className="sum-goal" style={{ left: at(r.goal) }} aria-hidden="true" />}
      </span>
    </div>
  )
}

// A short list of the muscles that ask for something — pending, past their
// ceiling, past a deload's target — with the one figure that says how much.
// Built from the same readings as the detail, so the two never disagree.
function SummaryBlock({ lab, col, items, more, onMore }) {
  return (
    <section className="sum-block">
      <div className="sum-block-head">
        <h4 className="sum-block-lab">{lab}</h4>
        <span className="sum-block-col">{col}</span>
      </div>
      <ul className="sum-items">
        {items.map((item) => (
          <li className="sum-item" key={item.group}>
            <span className="sum-item-id">
              <span className="sum-label">
                <span
                  className="sum-dot"
                  style={{ '--chip': muscleColor(item.group) }}
                  aria-hidden="true"
                />
                <span className="sum-item-name">{item.group}</span>
              </span>
              <span className="sum-item-sub">{item.sub}</span>
            </span>
            <span className={`sum-item-n${item.tone ? ` ${item.tone}` : ''}`}>{item.n}</span>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <button type="button" className="link-btn sum-more" onClick={onMore}>
          y {more} más
        </button>
      )}
    </section>
  )
}

// What the card says when the period it is on holds nothing to draw. Three
// different facts, so three different sentences: a week that has not started
// yet, a week that was skipped, and an account that has never logged a set.
//
// None of them draws rows. Nine runways at zero, each printing the whole of its
// band as a shortfall, is a verdict on a week nobody has lived — DESIGN.md
// 2026-08-05 settled that a running week is never told it is behind, and on a
// Monday *every* row is at zero. The blank card that would otherwise result is
// the opposite failure, and the shipped one: the week you are actually in went
// unmentioned by the screen that exists to measure it.
//
// So a running week hands over the only figures on screen that are real and
// final — last week's close, and which muscles ended under their band. That is
// where "what should today be" is answered from, and it is answered in this
// card's own currency (sets against a band), which is why it does not repeat
// what Ritmo por músculo already says with frequency.
function EmptyPeriod({ headline, aside, owed }) {
  const shown = owed?.slice(0, 4) ?? []
  return (
    <div className="sum-empty-wrap">
      <p className="sum-empty">{headline}</p>
      {aside && <p className="hint sum-handover">{aside}</p>}
      {owed?.length === 0 && <p className="sum-owed">Todo cerró en zona.</p>}
      {owed?.length > 0 && (
        <p className="sum-owed">
          <span className="sum-owed-lab">
            {owed.length === 1 ? 'Cerró bajo su zona' : 'Cerraron bajo su zona'}
          </span>
          {shown.map((group) => (
            /* The dot, because this list names muscles and every other place
               this app names one puts its colour on a mark beside it. */
            <span className="sum-owed-item" key={group}>
              <span
                className="sum-dot"
                style={{ '--chip': muscleColor(group) }}
                aria-hidden="true"
              />
              <span className="sum-owed-name">{group}</span>
            </span>
          ))}
          {owed.length > shown.length && (
            <span className="sum-owed-more">y {owed.length - shown.length} más</span>
          )}
        </p>
      )}
    </div>
  )
}

// Sets per muscle over a week or a month, with the arrows to walk back through
// them. The question is "am I training what I think I'm training", so the bar
// compares groups and the delta is the only thing wearing a colour.
//
// One card, on Progreso, and nowhere else. It briefly had a second, chromeless
// variant opening Días — same rows, no arrows, no `Mes`, no deload switch — and
// that put nine rows of analysis between you and the log on the tab you are in
// mid-session, which is the trade DESIGN.md's "Días carries only what you touch
// mid-session" exists to refuse. Reading belongs on the reading screen.
export function PeriodSummary({ days }) {
  // The week is the unit the reference is written in (4 / 10–20 sets a week),
  // and the question the card answers — "am I training what I think I'm
  // training" — is a this-week question. Opening on the month meant the number
  // you came for was always one tap away, and it arrived as an average.
  const [period, setPeriod] = useState('week')
  const [index, setIndex] = useState(0)
  const periods = sessionsPerPeriod(days, period)
  const at = Math.min(index, periods.length - 1)
  const current = periods[at]
  const summary = setsPerMuscle(days, { period, index: at })
  const byMonth = period === 'month'

  // A deload belongs to a week, so the month never offers it: four or five
  // weeks with one light one in them is not a deload, it's a month.
  // Switched in Perfil → Entreno, so read here rather than held: the card has
  // no control left that could change it under you.
  const deload = !byMonth && deloadWeeks().includes(current.start)
  const [open, setOpen] = useState(false)
  const detailId = useId()
  const targets = deload ? deloadTargets(days, current.start) : null
  // A group with no history behind it has no third to take, so it keeps the
  // standing reference rather than being handed a target of zero.
  const targetFor = (group) => (deload && targets[group]) || null

  function switchTo(mode) {
    setPeriod(mode)
    // A period index means nothing across modes: week 3 is not month 3.
    setIndex(0)
  }

  const title = byMonth
    ? capitalize(formatMonth(current.start))
    : at === 0
      ? 'Esta semana'
      : formatRange(current.start, current.end)

  // The one token in the header that says what every number under it *means*,
  // and the only one of them in ink. It is **the denominator, never the unit**:
  // the figures beside it carry their own unit, and the rows carry theirs in
  // the `media/sem` heading directly over them.
  //
  // It replaces a subtitle that welded three facts at one weight — sessions,
  // sets, and how far in you were — where the third is the only one that
  // decides how to read the other two, and was the faintest thing on the line.
  // Two cases, one job:
  //
  //  - A period still running prints how far into it you are. "3 días" reads as
  //    a total and "3 de 7 días" reads as three days *trained* sitting next to
  //    "2 entrenos"; "Día 3 de 7" is a position. What it uniquely adds is the
  //    *fraction* — a Tuesday against a Sunday — which is what decides how to
  //    read `faltan 10`, and it earns that most on the week with nothing in it.
  //  - A month reporting weekly averages prints the span it averaged over,
  //    because 1.9/sem after 3.7 weeks and 1.9/sem after two days are different
  //    claims and nothing else on the card can say which one this is. It does
  //    *not* print the word "media": the `/sem` riding each figure and the
  //    `media/sem` heading over the rows both say it, on the figures rather
  //    than beside them, and a third saying is the `HOY`-chip mistake.
  //
  // A closed week gets nothing. Its counts mean exactly what they say, and the
  // nav title flipping `Esta semana` → `20–26 jul`, plus the rows' verdicts
  // going muted → ink, already say it is over.
  const daysIn = Math.round(summary.weeks * 7)
  // 7 for a week; for a month, the day number its last date carries.
  const periodDays = byMonth ? Number(current.end.slice(8, 10)) : 7
  const spanWeeks = Math.round(summary.weeks * 10) / 10
  const stage = summary.averaged
    ? plural(spanWeeks, 'semana', 'semanas')
    : summary.inProgress
      ? `Día ${daysIn} de ${periodDays}`
      : null

  // Whether the reference has earned the right to call this good or short. A
  // finished period has: everything that was going to happen, happened. A month
  // reporting a weekly average has too — the average already accounts for how
  // much of it has run. A week in progress has not, and judging it anyway told
  // you every Monday that you were behind on a week you hadn't lived yet.
  const judging = !summary.inProgress || summary.averaged

  // A week that closed under half of a normal one. Said once, at the top, and
  // the rows stop demanding: nine "+7 a la zona" plus nine red drops is
  // eighteen marks of failure for a week that could as easily have been the flu
  // as a lapse, and none of them is actionable — the week is over.
  //
  // Half rather than a per-row rule because one visible threshold beats nine
  // implicit ones, and any threshold here is a judgement call. It sits above the
  // deload's third on purpose: a deload is a plan, this is only a description.
  //
  // Never on a month (four or five weeks with one light one is a month, not a
  // short week), never while the week is still running (it hasn't come in yet),
  // and never on a deload, which already explains itself in its own words.
  const typical = byMonth || deload ? null : typicalWeekSets(days, current.start)

  // Nothing to draw: no muscle claimed a set in this period. One test, because
  // there is one condition — a row is drawable when it has volume in it.
  //
  // `rows` is not the test. A quiet group holds its row at zero for eight weeks
  // (P4 widened that from one period, which is right for a normal week), so
  // anyone who has lifted at all recently gets nine seeded rows no matter what
  // this week holds — and nine rows all at zero is the whole band printed nine
  // times as a shortfall, the "nueve reproaches" of DESIGN.md 2026-08-10.
  //
  // `summary.sets` is not the test either, and that was the subtler miss: a
  // week of nothing but cardio has sets above zero and nine seeded rows, so it
  // passed both halves of the old condition and drew nine deficits over a week
  // in which you did train. "Nothing was classified" and "nothing happened" are
  // different sentences — the first keeps its counts and says so in words.
  const hasHistory = days.some((day) => day.workouts.some((w) => w.sets.length > 0))
  const empty = !summary.rows.some((row) => row.sets > 0)

  // A week with nothing in it was never short of anything: "0 series, menos de
  // un cuarto de tu semana típica" measures a week that never started against
  // one that did.
  const shortWeek = judging && !empty && typical != null && summary.sets < typical / 2

  // Last week's close, handed to a Monday that has nothing of its own. Only for
  // a running week — a month has no tidy predecessor to borrow from, and a past
  // week you are browsing is being read, not planned from.
  const handover =
    empty && !byMonth && summary.inProgress && hasHistory && at + 1 < periods.length
      ? setsPerMuscle(days, { period, index: at + 1 })
      : null
  // Ordered by how much each one was short, so the first name is the one with
  // most owed to it. Judged with exactly the call the row makes, so the list
  // and the rows behind the ‹ arrow can never disagree.
  const owed =
    handover && handover.sets > 0
      ? handover.rows
          .map((row) => ({ group: row.group, ...bandState(row.group, row.sets, row.indirect) }))
          .filter((row) => row.state === 'bajo')
          .sort((a, b) => b.gap - a.gap)
          .map((row) => row.group)
      : null

  const headline = !hasHistory
    ? 'Todavía no hay series registradas.'
    : summary.sets > 0
      ? 'Ninguna serie con músculo asignado.'
      : summary.inProgress
        ? byMonth
          ? 'El mes aún no tiene series.'
          : 'La semana aún no tiene series.'
        : byMonth
          ? 'Mes sin entrenar.'
          : 'Semana sin entrenar.'

  const aside = !hasHistory
    ? 'Con el primer entreno esta tarjeta empieza a medir cada músculo contra su zona semanal.'
    : !handover
      ? null
      : handover.sets > 0
        ? `La pasada cerró con ${plural(handover.sets, 'serie', 'series')} en ${plural(
            periods[at + 1].sessions,
            'entreno',
            'entrenos',
          )}.`
        : 'La pasada tampoco tuvo ninguna.'

  // The ratio in the words you'd actually use. Only ever below a half by
  // construction, so these four cover it — and "menos de un cuarto" rather than
  // a fifth or a sixth, because past that the fraction stops being the point.
  const shareOfTypical = () => {
    const ratio = summary.sets / typical
    if (ratio >= 0.42) return 'la mitad'
    if (ratio >= 0.29) return 'un tercio'
    if (ratio >= 0.22) return 'un cuarto'
    return 'menos de un cuarto'
  }

  // What the period held. Kept, and demoted: the rows below already carry the
  // volume broken down the way this card asks you to read it, so the totals are
  // context for the marker, not the headline they used to share with it.
  //
  // **Printed in whatever unit the rows are printed in.** A month averages, so
  // its counts average too. Left as month totals they sat behind a marker
  // reading "Media de 1.6 semanas", joined to it by the same `·` that joins
  // them to each other — so the modifier scoped forward onto them and `4
  // entrenos` read as four sessions a week when the rate was 2.5. `193 series`
  // self-corrects by absurdity; four sessions a week does not. No separator
  // fixes that reliably, so the register does: with `/sem` on every figure the
  // marker cannot mis-scope, because there is nothing left to mis-scope onto.
  //
  // Dropped entirely when the period holds no sets, because "0 entrenos · 0
  // series" under a line already saying the week is empty is the same nothing
  // said twice, and it reads as a scorecard. The test is `summary.sets`, not
  // `empty`: a cardio-only week draws no rows and so is "empty" to everything
  // below, but it did have sessions and it did have sets, and those counts are
  // the only thing on the card saying the week was not blank.
  const rate = (n) => Math.round((n / summary.weeks) * 10) / 10
  const counts =
    !hasHistory || summary.sets === 0
      ? null
      : summary.averaged
        ? [
            `${plural(rate(current.sessions), 'entreno', 'entrenos')}/sem`,
            // `perWeek` rather than a second division: stats.js already
            // publishes this figure at this rounding, and two roundings of one
            // number is how a header and a row come to disagree by a tenth.
            `${plural(summary.perWeek, 'serie', 'series')}/sem`,
          ].join(' · ')
        : [
            plural(current.sessions, 'entreno', 'entrenos'),
            plural(summary.sets, 'serie', 'series'),
          ].join(' · ')

  // Every row read once. The tally, the lists and the detail all take their
  // verdicts from here, so the count at the top, the muscle named under it and
  // the bar in the detail cannot disagree about a row.
  const readings = summary.rows.map((row) => {
    const shown = summary.averaged ? row.perWeek : row.sets
    // Same unit as `shown` on both sides of the month switch, or the band
    // would be judged on a month of indirect work against a weekly average.
    const indirect = summary.averaged ? row.indirectPerWeek : row.indirect
    const { state, gap, band, direct } = bandState(row.group, shown, indirect)
    // A group with no history behind it has no third to take, so it keeps its
    // standing minimum rather than being handed a target of zero.
    // Floored at one, like `deloadTargets` floors its own: a deload asks for
    // less, never for nothing.
    const goal = deload ? Math.max(1, targetFor(row.group) ?? band?.mev ?? 1) : null
    return {
      group: row.group,
      shown,
      indirect,
      state,
      gap,
      band,
      direct,
      goal,
      // Zero against a floor of zero: RP's abs and glutes. Inside the band by
      // the numbers, and still not a reading — nothing was done.
      untouched: !deload && shown === 0 && state === 'zona',
      pastGoal: deload && shown > goal,
    }
  })

  // The answer, before any picture: how many of the muscles on the card sit
  // where they should. On a deload "where they should" is at or under the
  // week's target.
  const isIn = (r) => (deload ? !r.pastGoal : r.state === 'zona')
  const isOver = (r) => (deload ? r.pastGoal : r.state === 'sobre')
  const inCount = readings.filter(isIn).length
  const tallyLab = deload ? 'en objetivo de descarga' : 'en zona'
  const cells = [
    ...readings.filter(isIn).map(() => 'is-in'),
    ...readings.filter((r) => !isIn(r) && !isOver(r)).map(() => ''),
    ...readings.filter(isOver).map(() => 'is-over'),
  ]

  // Only the muscles that ask for something, biggest ask first. Three at most:
  // on a Monday everything is pending, and seven rows of it is the whole card
  // again — the rest wait in the detail, one tap away.
  const LIST_CAP = 3
  const blocks = []
  if (deload) {
    const past = readings
      .filter((r) => r.pastGoal)
      .sort((a, b) => b.shown - b.goal - (a.shown - a.goal))
    if (past.length > 0) {
      blocks.push({
        lab: 'Por encima del objetivo',
        col: 'de más',
        items: past.slice(0, LIST_CAP).map((r) => ({
          group: r.group,
          sub: `${r.shown} de ${r.goal}`,
          n: `+${round1(r.shown - r.goal)}`,
          tone: 'is-over',
        })),
        more: past.length - LIST_CAP,
      })
    }
  } else {
    const under = readings
      .filter((r) => r.state === 'bajo')
      .sort((a, b) => b.gap - a.gap)
    // A short week names no gaps: it is over, and nine of them would be nine
    // reproaches for a week that could as easily have been the flu.
    if (under.length > 0 && !shortWeek) {
      const closedWeek = judging && !summary.averaged
      blocks.push({
        lab: !judging ? 'Pendiente' : summary.averaged ? 'Bajo zona' : 'Cerró bajo zona',
        col: closedWeek ? 'faltaron' : 'faltan',
        items: under.slice(0, LIST_CAP).map((r) => ({
          group: r.group,
          sub: `${r.direct} de ${r.band.mev} mín.`,
          n: String(r.gap),
          // Ink once the period can be judged; muted while it still runs.
          tone: judging ? 'is-short' : '',
        })),
        more: under.length - LIST_CAP,
      })
    }
    const over = readings.filter((r) => r.state === 'sobre')
    if (over.length > 0) {
      blocks.push({
        lab: 'Por encima del máximo',
        col: 'de más',
        items: over.map((r) => ({
          group: r.group,
          sub: `${r.direct} de ${r.band.mrv} máx.`,
          n: `+${round1(r.direct - r.band.mrv)}`,
          tone: 'is-over',
        })),
      })
    }
  }
  const allGood = !deload && !shortWeek && blocks.length === 0
  const max = axisFor(readings)
  const foldLabel =
    readings.length === 1
      ? open
        ? 'Ocultar el músculo'
        : 'Ver el músculo'
      : `${open ? 'Ocultar' : 'Ver'} los ${readings.length} músculos`

  const body = empty ? (
    <EmptyPeriod headline={headline} aside={aside} owed={owed} />
  ) : (
    <>
      <div className="sum-tally">
        <p className="sum-tally-line">
          <span className="sum-tally-n">{inCount}</span>
          <span className="sum-tally-of">/{readings.length}</span>
          <span className="sum-tally-lab">{tallyLab}</span>
        </p>
        {/* One cell per muscle on the card: in, waiting, past. The count
            above says how many; this says how much of the card that is. */}
        <div
          className="sum-meter"
          role="img"
          aria-label={`${inCount} de ${readings.length} músculos ${tallyLab}`}
        >
          {cells.map((cls, i) => (
            <span key={i} className={`sum-cell${cls ? ` ${cls}` : ''}`} />
          ))}
        </div>
      </div>
      {blocks.map((block) => (
        <SummaryBlock key={block.lab} {...block} onMore={() => setOpen(true)} />
      ))}
      {allGood && (
        <p className="sum-allgood">
          {judging && !summary.averaged ? 'Todo cerró en zona.' : 'Todo en zona.'}
        </p>
      )}
      <button
        type="button"
        className="sum-fold"
        aria-expanded={open}
        aria-controls={detailId}
        onClick={() => setOpen(!open)}
      >
        {foldLabel}
        <span className="sum-fold-chev" aria-hidden="true">
          ⌄
        </span>
      </button>
      {/* In the DOM while folded, so opening it is a CSS state rather than a
          mount — the bars grow in from zero as it opens. */}
      <div id={detailId} className="sum-detail" hidden={!open}>
        <div className="sum-rows">
          {/* `display: contents` rows, so the cell count must match exactly:
              the identity column keeps an empty heading cell. */}
          <div className="sum-cols">
            <span className="sum-colgap" aria-hidden="true" />
            <span className="sum-collab">{summary.averaged ? 'media/sem' : 'series'}</span>
            <span aria-hidden="true" />
          </div>
          {readings.map((r, i) => (
            <BulletRow
              key={r.group}
              r={r}
              max={max}
              index={i}
              deload={deload}
              judging={judging}
              shortWeek={shortWeek}
            />
          ))}
          {/* The scale, once, under the last row: two or three figures where
              the gridlines fall, instead of a ruler across the top. */}
          <div className="sum-axis-row" aria-hidden="true">
            <span />
            <span />
            <span className="sum-axis-labs">
              {Array.from({ length: Math.ceil(max / 10) - 1 }, (_, i) => (
                <span key={i} className="sum-grid-lab" style={{ left: pct(((i + 1) * 10) / max) }}>
                  {(i + 1) * 10}
                </span>
              ))}
            </span>
          </div>
        </div>
        <p className="hint sum-ref">{deload ? DELOAD_COPY : REFERENCE_COPY}</p>
      </div>
    </>
  )

  const short = shortWeek && (
    <p className="sum-shortweek">
      Semana corta · {plural(summary.sets, 'serie', 'series')}, {shareOfTypical()} de tu semana
      típica
    </p>
  )

  return (
    <div className="card sum-card">
      {/* The card says what it is, like every other card on the screen
          ("Evolución", "Ritmo por músculo"). It used to open on the period
          alone — "Esta semana" answers *when*, never *what*, so the one card
          the screen exists for was the only one that never named its subject. */}
      <h2 className="sum-title">Series por músculo</h2>
      {/* An account with nothing in it has no period to be on: both arrows are
          dead, and `Mes` swaps one empty view for another. A first screen made
          of inert controls is worse than a first screen made of one sentence. */}
      {hasHistory && (
      <div className="sum-head">
        <div className="sum-nav">
          <button
            type="button"
            className="secondary set-action sum-arrow"
            aria-label="Periodo anterior"
            disabled={at + 1 >= periods.length}
            onClick={() => setIndex(at + 1)}
          >
            ‹
          </button>
          {/* Demoted under the card's name: the period is what the arrows
              move, not what the card is about. */}
          <h3>{title}</h3>
          <button
            type="button"
            className="secondary set-action sum-arrow"
            aria-label="Periodo siguiente"
            disabled={at === 0}
            onClick={() => setIndex(at - 1)}
          >
            ›
          </button>
        </div>
        {/* One chip, not two. The week is the default and the title already
            says which period you are in ("Esta semana" / "Julio"), so a second
            chip spelling out the state you can read above it was a control
            standing in for a label. `Mes` is the only thing left to ask for. */}
        <div className="sum-seg">
          <button
            type="button"
            className={`chip${byMonth ? ' is-active' : ''}`}
            aria-pressed={byMonth}
            onClick={() => switchTo(byMonth ? 'week' : 'month')}
          >
            Mes
          </button>
        </div>
      </div>
      )}
      {/* One line, two registers. The marker is ink and leads; the totals stay
          muted behind it. Hierarchy, not colour — nothing here is a record and
          nothing here is destructive. Absent altogether on an account with no
          history: there is no week to be one-seventh of the way through. */}
      {hasHistory && (stage || counts) && (
        <p className="sum-sub">
          {stage && <span className="sum-stage">{stage}</span>}
          {stage && counts ? ` · ${counts}` : counts}
        </p>
      )}

      {body}
      {short}
      {/* Sets that landed in no row at all: cardio has no muscle group by
          design, and a lift the classifier doesn't recognise has none yet.
          Left unsaid it reads as a bug — and it's fixable from the exercise,
          which is worth knowing. (The rows themselves outrun the set count on
          purpose: a press puts 1 into Pecho and half into two more.)

          Not when there are no rows: with nothing classified at all the empty
          state's own headline is already this sentence, and a footnote with
          nothing above it to annotate is the same fact printed twice. */}
      {!empty && summary.unclassified > 0 && (
        <p className="hint sum-rest">
          {plural(summary.unclassified, 'serie', 'series')} sin músculo asignado
        </p>
      )}
    </div>
  )
}

// Sets logged per exercise, from the days feed — used to pick sensible defaults
// and order chips by how much you actually train each lift.
function frequencies(days) {
  const counts = {}
  for (const day of days) {
    for (const workout of day.workouts) {
      for (const set of workout.sets) {
        counts[set.exercise_name] = (counts[set.exercise_name] || 0) + 1
      }
    }
  }
  return counts
}

export default function Progress() {
  const [exercises, setExercises] = useState([]) // [{ name, muscle_group }]
  const [days, setDays] = useState([]) // the whole log; everything here is derived from it
  // An empty log and a log that hasn't arrived are the same `[]`, and the
  // summary card now has something to say about the first one. Saying it before
  // the request answers tells a returning user their account is empty.
  const [daysLoaded, setDaysLoaded] = useState(false)
  const [freq, setFreq] = useState({})
  // Two jobs, two states. One `name` doing both meant the charted lift was
  // printed as the card title, as the field's value and as the active chip —
  // the same string three times, twice within a thumb's width.
  const [name, setName] = useState('') // the currently charted lift
  const [query, setQuery] = useState('') // what you are typing to find one
  const [muscle, setMuscle] = useState(null) // selected muscle filter
  const [error, setError] = useState('')
  const [nameDraft, setNameDraft] = useState('')
  // El último nombre que se mandó, para que dos salidas seguidas no valgan por
  // dos renombrados. Ver `renameCurrent`.
  const sentName = useRef(null)
  // Lo que salió mal en el último renombrado, y lo que se puede hacer al
  // respecto. Vive aquí y no dentro del panel porque el panel se desmonta justo
  // cuando llega la respuesta: el renombrado se manda también al salir, así que
  // en cuatro de sus seis disparos el aviso no llegaba a decir nada. Ver
  // `NameClash.jsx`.
  const [editTrouble, setEditTrouble] = useState(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  // El ejercicio que se acaba de borrar, para poder decirlo donde estaba su
  // tarjeta. `{ name, sets }`; se limpia en cuanto eliges otro.
  const [deleted, setDeleted] = useState(null)
  // El buscador, que es donde aterriza el foco cuando la tarjeta que lo tenía
  // deja de existir.
  const searchRef = useRef(null)
  // El reetiquetado que acaba de pasar, para poder desandarlo.
  const [lastRetag, setLastRetag] = useState(null)
  // La nota permanente, editándose. Se resiembra del ejercicio cada vez que se
  // abre el panel, igual que el nombre.
  const [noteDraft, setNoteDraft] = useState('')
  // La nota que se acaba de quedar en nada, guardada para poder devolverla.
  // Vive fuera del panel porque `commitNote` se dispara también al salir: para
  // cuando el servidor contesta, el panel se ha ido con el mismo cierre que
  // mandó la nota. Ver `EditTrouble.jsx`.
  const [clearedNote, setClearedNote] = useState(null)
  // ¿Está abierta la hoja del editor? Renombrar y reetiquetar son correcciones,
  // de la misma forma que las de una tarjeta de ejercicio en Entreno: raras, y
  // estaban metidas dentro del contenido.
  const [editorOpen, setEditorOpen] = useState(false)

  const muscleOf = (lift) => exercises.find((e) => e.name === lift)?.muscle_group ?? null

  useEffect(() => {
    listExercises()
      .then((list) =>
        setExercises(
          list.map((e) => ({
            id: e.id,
            name: e.name,
            muscle_group: e.muscle_group,
            // Carried, not dropped: it is what the re-tag confirmation counts.
            set_count: e.set_count ?? 0,
            // Se lleva por lo mismo que `set_count`: al chocar con un nombre
            // existente hay que saber si esta pantalla puede ofrecer la fusión,
            // y el servidor rechaza fusionar cardio con fuerza.
            kind: e.kind ?? 'strength',
            // La nota permanente del ejercicio. Antes esta pantalla ni la
            // pedía: su cajón llevaba grupo y borrado y el de Entreno grupo y
            // nota, o sea dos editores distintos con el mismo cromo. Ahora las
            // dos pantallas llevan los cinco actos.
            note: e.note ?? null,
          })),
        ),
      )
      .catch(() => {})
  }, [])

  // Rename in place. The row keeps its id, so past sets, history and records all
  // follow; we update locally and re-point `name` at the renamed lift so the chart
  // and chips stay on it. A blank or unchanged name just closes the editor.
  //
  // A 409 means the name is already an exercise of yours — "Fondo" typed on a
  // busy floor, renamed to the "Fondos" that already exists. That is not a
  // failure to explain, it is an offer: fold this one into that one. El
  // ejercicio con el que chocaste viene **en la respuesta**, así que se nombra
  // con su ortografía guardada y se dice lo que cuesta la fusión con la cifra
  // del servidor, sin rebuscarlo en la lista que esta pantalla tenga cargada.
  //
  // ── Sin botón de guardar, y optimista ─────────────────────────────────────
  // Esto ya no lo dispara un `Guardar nombre`: lo disparan Intro dentro del
  // campo, entrar en el cajón y cerrar el panel por cualquiera de sus puertas.
  // El porqué entero está en la cabecera de `ExerciseEditor.jsx`.
  //
  // `sentName` es el seguro contra el doble envío mientras uno está en vuelo:
  // ahora hay más de una salida que guarda —Intro y después el aspa son dos— y
  // en una conexión lenta la segunda llega antes de que conteste la primera.
  // Se suelta en cuanto falla, porque un fallo de red no es una respuesta a lo
  // que preguntaste y la siguiente salida tiene que poder volver a preguntar;
  // medido en el navegador, sin esto un renombrado caído se quedaba sin poder
  // reintentarse hasta cerrar y reabrir el panel.
  //
  // Y el cambio aterriza antes de que el servidor conteste, como el registro de
  // una serie (DESIGN.md, 2026-07-25); un fallo lo devuelve y lo dice al lado
  // del campo. Sin estado «pendiente» a la vista, que es lo que pide ese mismo
  // apunte: lo pendiente es el caso normal y se pinta callado, y aquí el acuse
  // de recibo es el nombre nuevo, ya escrito por toda la pantalla.
  async function renameCurrent(id, draft) {
    const trimmed = draft.trim()
    if (!trimmed || trimmed === name) {
      // Un campo que tocaste y dejaste como estaba no es un renombrado. La hoja
      // se queda abierta: cerrarla aquí sería castigar el haber dudado.
      setEditTrouble(null)
      return
    }
    if (trimmed === sentName.current) return
    sentName.current = trimmed
    setEditTrouble(null)
    const before = name
    applyRename(id, trimmed)
    try {
      const updated = await renameExercise(id, trimmed)
      // El servidor tiene la última palabra sobre cómo se escribe.
      if (updated.name !== trimmed) applyRename(id, updated.name)
      // La hoja sigue abierta y su cabecera ya dice el nombre nuevo: eso es el
      // acuse de recibo, y no hace falta ninguno más.
      //
      // El registro que alimentan la gráfica, la escalera de récords y el mapa
      // de calor nombra su ejercicio con una cadena, así que se vuelve a pedir:
      // es lo mismo que hacen la fusión y el borrado, por lo mismo.
      await reloadLog()
    } catch (err) {
      sentName.current = null
      applyRename(id, before)
      // El choque lo nombra el servidor. La búsqueda local que había aquí no
      // podía ver un ejercicio que esta pantalla nunca llegó a pedir, y cuando
      // lo encontraba lo nombraba con la ortografía de la lista, no con la
      // guardada.
      const taken = err?.status === 409 ? err?.detail?.exercise : null
      // ── Un choque se lleva el panel ─────────────────────────────────────
      // El bloque de la oferta mide 135–177 px —la frase envuelve— y se pinta **encima** del
      // disparador; el panel mide 130 y cuelga de él. Entre el pie de la
      // gráfica y la barra de pestañas no caben los dos, y con el panel
      // abierto —lo que pasa al confirmar con Intro— medido a 430×932: el
      // panel se posaba sobre el bloque y dejaba `Sí, fusionar` y `Escribir
      // otro nombre` tapados y `inert`. Los dos únicos controles que contestan
      // a la pregunta que el bloque acaba de hacer, escondidos debajo de la
      // caja que la provocó.
      //
      // No es un problema de colocación, es que son dos superficies para una
      // decisión. La que manda es el bloque: es la respuesta, sobrevive al
      // cierre y lleva las dos salidas dentro. Y no se pierde nada, porque una
      // de esas dos salidas —`Escribir otro nombre`— devuelve el panel con lo
      // que escribiste todavía dentro. Así, además, un choque se lee igual
      // hayas salido por donde hayas salido.
      if (taken) setEditorOpen(false)
      // Y las dos cifras frescas, que es lo que convierte «ya tienes ése, con
      // 48 series» en un precio de verdad: 48 es lo que te quedas, no lo que
      // arriesgas. Ver `clashTrouble` en `EditTrouble.jsx`.
      setEditTrouble(
        taken
          ? await clashTrouble({
              id,
              from: before,
              draft: trimmed,
              myKind: exercises.find((e) => e.id === id)?.kind ?? null,
              taken,
            })
          : { field: 'name', kind: 'network', from: before, draft: trimmed },
      )
    }
  }

  // Mudar el ejercicio de nombre por lo que esta pantalla lee por nombre: la
  // lista de ejercicios (el título, los chips) y cuál es el que se está
  // mirando. Va en las dos direcciones, porque también es la que deshace.
  function applyRename(id, to) {
    setExercises((list) => list.map((e) => (e.id === id ? { ...e, name: to } : e)))
    setName(to)
  }

  // Fold this exercise into the one whose name it collided with: its sets move
  // over, it disappears, and the chart lands on the survivor.
  //
  // La dirección es ésta y no la contraria: el superviviente es el ejercicio
  // que ya tenía el nombre, que es exactamente el nombre que acabas de pedir.
  // Fusionar al revés dejaría las series juntas bajo el nombre viejo y haría
  // falta un segundo renombrado que puede volver a fallar.
  async function mergeIntoClash() {
    if (!current || !editTrouble?.exercise) return
    try {
      const target = await mergeExercise(current.id, editTrouble.exercise.id)
      setExercises((list) => list.filter((e) => e.id !== current.id))
      setName(target.name)
      // Este ejercicio ya no existe: la hoja iba de él, así que se va con él.
      setEditorOpen(false)
      setEditTrouble(null)
      await reloadLog()
      // El botón que tenía el foco acaba de desmontarse con el bloque de la
      // oferta. Sin esto el foco caía en `<body>` — medido, y sólo en esta
      // pantalla, que es la asimetría que no puede quedarse.
      focusEditorTrigger(target.name)
    } catch {
      // Una fusión que no sale no es un choque nuevo: es la misma petición sin
      // mandar, y se reintenta como cualquier otra.
      setEditTrouble({ field: 'merge', kind: 'network', from: current.name, draft: editTrouble.draft, exercise: editTrouble.exercise })
    }
  }

  // Volver a mandar exactamente lo que no salió. Un fallo de red no es una
  // respuesta a lo que preguntaste, así que la pregunta se repite tal cual, y
  // desde el propio aviso: sin esto «no se pudo» es una frase sin control al
  // lado, que es la misma forma de callejón que el choque tenía.
  function retryEdit() {
    if (!editTrouble || !current) return
    if (editTrouble.field === 'group') return changeMuscle(current.id, editTrouble.draft)
    if (editTrouble.field === 'note') return changeNote(current.id, editTrouble.draft)
    if (editTrouble.field === 'merge') return mergeIntoClash()
    return renameCurrent(current.id, editTrouble.draft)
  }

  // La otra salida del choque: el panel vuelve con lo que escribiste todavía
  // dentro. Sin esto, «ponle otro nombre» sería una instrucción sin control —
  // que es la forma exacta que tenía el callejón que este cambio quita.
  function reopenOnDraft() {
    if (!editTrouble) return
    setNameDraft(editTrouble.draft)
    setEditTrouble(null)
    sentName.current = null
    setEditorOpen(true)
  }

  // Delete the exercise and everything logged against it. Irreversible, and it
  // takes history with it, so it is gated on a dialog that names the damage.
  //
  // ── Dónde aterrizas ───────────────────────────────────────────────────────
  // La tarjeta que estabas mirando deja de existir, y con ella el botón que
  // abrió el editor. El foco se quedaba en un nodo huérfano —el editor sabe no
  // devolverlo ahí, así que caía en `body`— y la pantalla se quedaba sin decir
  // nada de lo que acababa de pasar: el ejercicio simplemente ya no estaba.
  //
  // Ahora aterriza en el buscador, que es el único control de esta pantalla que
  // sigue existiendo y además es lo siguiente que vas a hacer —elegir otro
  // ejercicio—, con una línea encima que dice qué se fue y con cuántas series.
  // No lleva deshacer y no puede llevarlo: esto es lo que «no se puede
  // deshacer» significaba en el diálogo.
  async function deleteCurrent() {
    if (!current) return
    const gone = { name: current.name, sets: setsLogged }
    try {
      await deleteExercise(current.id)
      const left = exercises.filter((e) => e.id !== current.id)
      setExercises(left)
      setConfirmingDelete(false)
      setEditorOpen(false)
      setName('')
      setMuscle(null)
      setDeleted(gone)
      await reloadLog()
      searchRef.current?.focus()
    } catch {
      setConfirmingDelete(false)
      setError('No se pudo eliminar el ejercicio.')
    }
  }

  // The log on screen is a snapshot; deleting or merging just changed it under
  // us, and the chart, the chips and the heatmap all read from it.
  async function reloadLog() {
    const loaded = await listDays().catch(() => null)
    if (loaded) {
      setDays(loaded)
      setFreq(frequencies(loaded))
    }
  }

  // Fix a mis-guessed group; the classifier is only a default. Updates locally so
  // the chips regroup and the chart recolours immediately.
  //
  // Gated, when there is history to move: the group rides on the exercise, so
  // this re-buckets every set ever logged against it — including the summary
  // bars and heatmap cells further down this very screen. Answers whether it
  // landed, so only a real change gets offered a way back.
  //
  // ── Optimista, como el nombre y la nota ─────────────────────────────────
  // Era el único campo del panel que esperaba al servidor antes de mover nada,
  // y con `Guardar` retirado eso no se lee como «va en camino», se lee como
  // «no». Medido en el banco a 2 s de latencia: 343 ms después de confirmar
  // `Pecho`, el desplegable seguía diciendo `Hombro` y el punto seguía ámbar,
  // mientras el nombre y la nota decían «hecho» al instante. El grupo aterriza
  // ahora igual que los otros dos, y el `catch` lo devuelve.
  async function changeMuscle(id, group) {
    const before = exercises.find((e) => e.id === id)?.muscle_group ?? null
    const land = (value) => {
      setExercises((list) =>
        list.map((e) => (e.id === id ? { ...e, muscle_group: value } : e)),
      )
      setMuscle(value ?? UNGROUPED)
    }
    land(group || null)
    try {
      const updated = await setExerciseMuscle(id, group || null)
      setExercises((list) =>
        list.map((e) => (e.id === id ? { ...e, muscle_group: updated.muscle_group } : e)),
      )
      // Follow it to wherever it landed, Sin grupo included — deselecting the
      // filter would drop the exercise you are looking at off its own screen.
      setMuscle(updated.muscle_group ?? UNGROUPED)
      return true
    } catch {
      land(before)
      // Al mismo sitio que el nombre. El grupo se quejaba al pie de la página y
      // el nombre dentro del panel: dos campos de la misma caja con dos sitios
      // distintos para decir que algo ha fallado, y uno de los dos fuera de la
      // pantalla de un móvil.
      setEditTrouble({
        field: 'group',
        kind: 'network',
        from: exercises.find((e) => e.id === id)?.name ?? '',
        draft: group,
      })
      return false
    }
  }

  // La nota permanente, mandada igual que el grupo y por las mismas puertas que
  // el nombre: Intro dentro del campo, entrar en el cajón y cerrar el panel.
  // Optimista, y el `catch` la devuelve.
  //
  // Es literalmente el mismo acto que `changeNoteFor` en `Workout.jsx`. Estaba
  // sólo allí, que es la mitad de por qué «un editor compartido por las dos
  // pantallas» eran dos.
  async function changeNote(id, note) {
    const before = exercises.find((e) => e.id === id)?.note ?? null
    const land = (value) =>
      setExercises((list) => list.map((e) => (e.id === id ? { ...e, note: value } : e)))
    land(note)
    try {
      const updated = await setExerciseNote(id, note)
      land(updated.note ?? null)
      return true
    } catch {
      land(before)
      setEditTrouble({
        field: 'note',
        kind: 'network',
        from: exercises.find((e) => e.id === id)?.name ?? '',
        draft: note,
      })
      return false
    }
  }

  // Vaciar el campo *es* borrar la nota, y era el único acto destructivo del
  // editor sin ninguna ceremonia. No lleva confirmación —colgaría de la salida,
  // y las cuatro salidas del panel valen lo mismo— sino la forma del
  // reetiquetado: se deja pasar y se ofrece devolverlo. Sólo al vaciar:
  // escribir encima deja en pantalla lo que sustituyó a la nota.
  async function commitNote() {
    if (!current) return
    const next = noteDraft.trim()
    const before = (current.note ?? '').trim()
    if (next === before) return
    if ((await changeNote(current.id, next || null)) === false) return
    setClearedNote(next ? null : before || null)
  }

  // Sin diálogo por medio: reetiquetar es el único acto reversible del editor
  // y era el único que llevaba confirmación *y* deshacer, mientras fusionar
  // —irreversible— iba de un toque. La cifra que decía el diálogo se dice
  // ahora en la fila que ofrece la vuelta. Ver `MuscleRetag.jsx`.
  async function applyRetag(group) {
    if (!current) return
    const from = current?.muscle_group ?? null
    if (await changeMuscle(current.id, group)) setLastRetag({ id: current.id, from })
  }

  async function undoRetag() {
    const { id, from } = lastRetag
    setLastRetag(null)
    // A failed undo leaves the new group standing, so the offer still stands.
    if (!(await changeMuscle(id, from))) setLastRetag({ id, from })
  }

  useEffect(() => {
    // Open on your most-trained lift, and select its muscle.
    listDays()
      .then((loaded) => {
        setDays(loaded || [])
        const counts = frequencies(loaded || [])
        setFreq(counts)
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]
        if (top) selectLift(top[0])
        // Set from the answer, never from the settlement. In `finally` this
        // also fires on a rejection, and then an empty `days` — which is only
        // the initial state — gets read as "this account has never trained".
        // The card would tell somebody with months of log that they have never
        // logged a set, and it would do it most often on a cold start, which
        // on a free tier that sleeps is the frame it draws most.
        //
        // `Array.isArray` rather than truthiness because the endpoint answering
        // with something that is not a list is also not an answer.
        if (Array.isArray(loaded)) setDaysLoaded(true)
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Charting is now a local act: the ladder comes out of the log we already
  // hold, so picking a lift costs nothing and can't fail.
  function selectLift(lift) {
    const trimmed = lift.trim()
    if (!trimmed) return
    setName(trimmed)
    // The box is for finding, not for holding what you found: the card title
    // and the active chip already say where you are.
    setQuery('')
    // An exercise you have but that carries no group lights the Sin grupo chip,
    // not nothing: otherwise picking one silently clears the filter it belongs
    // to. A free-typed name that matches no exercise still selects nothing —
    // it isn't in any group because it isn't anything.
    const picked = exercises.find((e) => e.name === trimmed)
    setMuscle(picked ? (picked.muscle_group ?? UNGROUPED) : null)
    // Cambiar de ejercicio cierra la hoja: iba del anterior.
    setEditorOpen(false)
    setError('')
    setEditTrouble(null)
    setDeleted(null)
  }

  // Picking a known lift charts it immediately, the way the chips already did.
  // Making the text field alone demand a tap on a submit button was two paths
  // for one job, one of them with a confirmation step and one without.
  function handleNameInput(value) {
    setQuery(value)
    // An exact name still charts straight away, so autocomplete and paste work.
    const match = exercises.find((e) => fold(e.name) === fold(value))
    if (match) selectLift(match.name)
  }

  const liftsForMuscle = (m) =>
    exercises
      .filter((e) => (m === UNGROUPED ? !e.muscle_group : e.muscle_group === m))
      .map((e) => e.name)
      .sort((a, b) => (freq[b] || 0) - (freq[a] || 0))

  function selectMuscle(m) {
    setMuscle(m)
    const top = liftsForMuscle(m)[0]
    if (top) selectLift(top)
  }

  // Only show chips for muscles you actually have exercises in, in canonical order.
  const musclesPresent = MUSCLE_GROUPS.filter((m) => exercises.some((e) => e.muscle_group === m))
  // An exercise the classifier didn't recognise is stored with no group, which
  // means it appears in no per-muscle view at all — not the chips, not the
  // summary bars, not the heatmap. It is invisible precisely where you would
  // notice it needs fixing. This chip is the one place it is visible, so it
  // rides at the end of the same row, wearing the muted dot `muscleColor`
  // already gives an unknown group. Absent when there is nothing to find.
  const ungroupedCount = exercises.filter((e) => !e.muscle_group).length
  const chartColor = muscleColor(muscleOf(name))
  const current = exercises.find((e) => e.name === name)
  const rungs = name ? recordLadder(days, name) : []
  const gain = rungs.length > 1 ? rungs.at(-1).weight - rungs[0].weight : 0
  // What you typed, matched by substring. The native <datalist> this replaces
  // was a suggestion the browser showed when it felt like it, and never on a
  // phone — so "gemelo" found nothing and said nothing.
  const matches = query.trim()
    ? exercises.filter((e) => fold(e.name).includes(fold(query))).slice(0, 8)
    : []
  // What deleting this exercise would cost, counted from the log we already
  // hold — the confirmation has to name it.
  //
  // Del registro y no de `listExercises()`: la lista se pidió al montar y su
  // `set_count` no cuenta lo de hoy. `days` se vuelve a pedir después de cada
  // renombrado, fusión y borrado, así que es lo más fresco que hay en esta
  // pantalla. Y lo cuenta la misma función que lo cuenta en Entreno
  // (`DeleteExercise.jsx`): un solo acto, una sola definición del daño.
  const deleteDamage = current ? damageFromDays(days, current.name) : null
  const setsLogged = deleteDamage?.sets ?? 0

  // Las dos tarjetas de arriba no existían mientras el log volvía: la pantalla
  // entraba con Evolución sola y las otras dos caían encima al llegar el dato.
  const waiting = useWaitFlag(!daysLoaded)

  return (
    <section>
      {/* First card on the screen, because it is the one number this screen
          exists to answer: series por músculo esta semana. It used to sit at
          the foot, under the calendar and the whole Evolución apparatus — three
          scrolls down on a phone, which is where you put something you don't
          expect to be read. */}
      {daysLoaded ? <PeriodSummary days={days} /> : waiting ? <SummarySkeleton /> : null}

      {days.length > 0 ? (
        <Rhythm days={days} />
      ) : !daysLoaded && waiting ? (
        <RhythmSkeleton />
      ) : null}

      {/* Not gated on exercises having loaded: the search box below is typeable
          the instant the screen mounts, so it must be on screen the instant the
          screen mounts. Gating the whole card on `exercises.length` held the
          box hostage to a request that hadn't resolved yet. */}
      <div className="card">
        <h2>Evolución</h2>
        {/* The box finds what the chips can't reach: everything that isn't
            the most-trained lift of its group. One card, one job — a lift
            picked here or from the chips ends up on the same chart, so
            picking it shouldn't mean leaving the card that draws it. Above
            the chips: it's the more general way in, the chips a shortcut
            for the common case. */}
        {/* Lo que se acaba de ir, dicho donde aterriza el foco. La tarjeta que
            estabas mirando ha dejado de existir, así que sin esto la pantalla
            contesta a un borrado con la ausencia del ejercicio y nada más. No
            lleva `Deshacer`: es el único acto de esta pantalla que de verdad no
            se puede desandar, y ofrecer una vuelta que no existe sería peor que
            no ofrecer ninguna. `role="status"` y no `alert` — es la confirmación
            de algo que pediste, no un problema. */}
        {deleted && (
          <p role="status" className="retag-undo">
            <span>
              Se eliminó «{deleted.name}»
              {deleted.sets > 0 ? `, con sus ${plural(deleted.sets, 'serie', 'series')}.` : '.'}
            </span>
          </p>
        )}
        <form
          className="exercise-search"
          onSubmit={(e) => {
            e.preventDefault()
            // The go key takes the first thing you found, or the raw text so
            // a name that matches nothing gets told so.
            selectLift(matches[0]?.name ?? query)
          }}
        >
          <div className="field">
            <label htmlFor="progress-exercise">Ejercicio</label>
            <input
              id="progress-exercise"
              ref={searchRef}
              value={query}
              onChange={(e) => handleNameInput(e.target.value)}
              placeholder="Buscar…"
            />
          </div>
          {matches.length > 0 && (
            <ul className="search-results">
              {matches.map((e) => (
                <li key={e.id}>
                  <button type="button" className="set-row" onClick={() => selectLift(e.name)}>
                    <span
                      className="dot"
                      aria-hidden="true"
                      style={{ '--chip': muscleColor(e.muscle_group) }}
                    />
                    {e.name}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </form>
        {(musclesPresent.length > 0 || ungroupedCount > 0) && (
          <div className="muscle-chips">
            {musclesPresent.map((m) => (
              <button
                key={m}
                type="button"
                className={`chip muscle-chip${muscle === m ? ' is-active' : ''}`}
                style={{ '--chip': muscleColor(m) }}
                aria-pressed={muscle === m}
                onClick={() => (muscle === m ? setMuscle(null) : selectMuscle(m))}
              >
                <span className="dot" aria-hidden="true" />
                {m}
              </button>
            ))}
            {ungroupedCount > 0 && (
              <button
                type="button"
                className={`chip muscle-chip${muscle === UNGROUPED ? ' is-active' : ''}`}
                style={{ '--chip': muscleColor(null) }}
                aria-pressed={muscle === UNGROUPED}
                onClick={() =>
                  muscle === UNGROUPED ? setMuscle(null) : selectMuscle(UNGROUPED)
                }
              >
                <span className="dot" aria-hidden="true" />
                {UNGROUPED}
              </button>
            )}
          </div>
        )}
        {/* El nombre titula la tarjeta — una gráfica sin nombre es una gráfica
            cuyo sujeto hay que ir a buscar — y ya no es un botón. Tocar el
            título abría un renombrado en línea que nadie encontraba nunca, y
            era la tercera puerta a lo mismo: una pantalla no puede tener dos
            formas distintas de arreglar un ejercicio. Ahora hay una, al pie, y
            el título vuelve a ser lo que parece: un título. */}
        {current && (
          <div className="chart-title">
            <span className="dot" aria-hidden="true" style={{ '--chip': chartColor }} />
            <h2>{current.name}</h2>
          </div>
        )}
        {rungs.length === 0 ? (
          /* Three different silences. Nothing picked yet; a known lift with no
             records (cardio, or one you have only ever done at the same
             weight); and an unknown name — telling someone "no data" for that
             one blames the log for a name that was never in it. */
          <p className="hint">
            {name === ''
              ? 'Elige un músculo o busca un ejercicio.'
              : current
                ? 'Aún no hay datos para graficar este ejercicio.'
                : 'No hay ningún ejercicio con ese nombre.'}
          </p>
        ) : (
          <>
            <Ladder key={name} rungs={rungs} color={chartColor} />
            <p className="chart-caption muted">
              {name} · solo récords reales
              {gain > 0 && (
                <>
                  {' · '}
                  <span className="mono" style={{ color: 'var(--pr)' }}>
                    +{showKg(gain)} kg
                  </span>{' '}
                  desde {formatMonth(rungs[0].date)}
                </>
              )}
            </p>
          </>
        )}
        {/* Al pie de la tarjeta, según DESIGN.md — entre el título y la gráfica
            se leía como un segundo encabezado sobre la cosa que has venido a
            mirar. Renombrar y reetiquetar son correcciones, no contenido.

            Es la misma puerta que hay en Entreno: mismo texto, mismo trato,
            misma hoja. Antes aquí ponía `Corregir` y allí `Editar ejercicio`,
            dos palabras para una sola cosa — y encima esta solo llevaba a la
            mitad de ella, porque el nombre se cambiaba tocando el título. */}
        {current && (
          <>
            {/* Fuera del panel a propósito: el renombrado se manda también al
                salir, y por las cuatro puertas la respuesta llega cuando el
                panel ya no está. Aquí, justo encima de la puerta que lo abre,
                sobrevive al cierre y sigue estando donde el pulgar acaba de
                tocar. Ver `NameClash.jsx`. */}
            <EditTrouble
              trouble={editTrouble}
              onMerge={mergeIntoClash}
              onRename={reopenOnDraft}
              onRetry={retryEdit}
            />
            {/* La misma superficie y por la misma razón: la nota se manda al
                salir, así que la vuelta atrás tiene que sobrevivir al cierre
                del panel. Idéntica a la de Entreno. */}
            <NoteUndo
              note={clearedNote}
              onUndo={async () => {
                const back = clearedNote
                setClearedNote(null)
                setNoteDraft(back)
                if ((await changeNote(current.id, back)) === false) setClearedNote(back)
              }}
            />
            <button
              type="button"
              className="unit-fix exercise-edit"
              // Mismo motivo y misma forma que en Entreno: el `›` vive en un
              // `::after` y se colaba en el nombre accesible ("Editar
              // ejercicio, mayor que"). La etiqueta visible va entera y
              // primero, para no romperle el control por voz a nadie.
              aria-label={`Editar ejercicio ${current.name}`}
              aria-haspopup="dialog"
              aria-expanded={editorOpen}
              onClick={() => {
                // El segundo toque cierra. Antes no hacía nada, y un control
                // que se anuncia desplegado (`aria-expanded="true"`) y se niega
                // a plegarse es una mentira que el pulgar encuentra sola.
                if (editorOpen) {
                  setEditorOpen(false)
                  return
                }
                // Abrir resiembra el borrador del nombre desde el ejercicio, y
                // se lleva por delante la queja y la colisión de la vez pasada.
                setNameDraft(current.name)
                setNoteDraft(current.note ?? '')
                setEditTrouble(null)
                sentName.current = null
                setEditorOpen(true)
              }}
            >
              Editar ejercicio
            </button>
            <ExerciseEditor
              name={current.name}
              open={editorOpen}
              onClose={() => setEditorOpen(false)}
              // Los dos campos de texto, mandados en cuanto dejan de estar
              // delante. El grupo ya se guardaba al elegirlo y el borrado tiene
              // su propio diálogo.
              onCommit={() => {
                renameCurrent(current.id, nameDraft)
                commitNote()
              }}
              nameDraft={nameDraft}
              onNameDraftChange={setNameDraft}
              onSubmitName={(e) => {
                e.preventDefault()
                renameCurrent(current.id, nameDraft)
              }}
              // Debajo del nombre, a la vista: el grupo, la nota y el borrado.
              // Aquí «Eliminar ejercicio» sí es el ejercicio entero: Progreso es
              // la pantalla a la que vienes a propósito (DESIGN.md).
              more={
                <>
                  <MusclePicker
                    name={current.name}
                    value={current.muscle_group}
                    onChange={(m) => applyRetag(m)}
                  />
                  {/* La nota permanente, en su fila y sin nada que pulsar: se
                      guarda al volver al nombre, al cerrar el panel y con Intro
                      dentro del propio campo. Misma fila, mismo rótulo y mismo
                      marcador de posición que en Entreno — es el mismo campo
                      del mismo ejercicio, y hasta ahora sólo existía en una de
                      las dos pantallas. */}
                  <form
                    className="editor-row editor-row-note"
                    onSubmit={(e) => {
                      e.preventDefault()
                      commitNote()
                    }}
                  >
                    <label className="editor-row-label" htmlFor="exercise-note">
                      Nota
                    </label>
                    <input
                      id="exercise-note"
                      className="editor-row-control"
                      aria-label={`Nota de ${current.name}`}
                      maxLength={200}
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder="agarre, altura del banco…"
                    />
                  </form>
                  {lastRetag && (
                    <RetagUndo
                      group={current.muscle_group}
                      setCount={setsLogged}
                      onUndo={undoRetag}
                    />
                  )}
                  {/* The last resort for a duplicate you don't want to keep at
                      all. True red, per DESIGN.md — it is the one control here
                      that destroys something.
                      Sin caja: es una acción rara y DESIGN.md dice que las
                      acciones raras no llevan controles con peso de contenido.
                      Un botón rojo relleno al pie del cajón pesaba más que el
                      campo del nombre del primer paso, que es lo que de verdad
                      vienes a hacer aquí — y desde que este panel no tiene
                      ningún botón de guardar, sería además el único control con
                      peso de la caja. El rojo se queda —lo pide la regla del
                      destructivo— pero como tinta, y los dos toques siguen
                      siendo dos: esta fila abre el diálogo que cuenta las
                      series.

                      ── Y fuera de la pila de propiedades ──────────────────
                      Esto es lo que hundió a esta pantalla en la ronda
                      anterior: un lector a ciegas leyó `Eliminar ejercicio`,
                      por un instante, **como el valor de una propiedad**. Es
                      una lectura razonable y el dibujo se la estaba pidiendo —
                      misma sangría que el valor de la fila de arriba, mismo
                      cuerpo, sin regla en medio y sin nada que lo contuviera,
                      con el rojo cargando solo con todo el aviso. Y el rojo, a
                      solas, no dice «esto es de otra clase»: dice «esto es
                      importante», que es exactamente lo que dice un valor
                      destacado.

                      Dos cambios y ninguno cuesta una fila. (1) La canaleta de
                      rótulos separa por construcción: los valores de las filas
                      de propiedad arrancan a la derecha del rótulo, y esta fila
                      no tiene rótulo porque no es una propiedad, así que
                      arranca en el canto. Dos sangrías distintas, dos clases
                      distintas. (2) Una regla encima, a `--text` al 17 % y no a
                      `--border`: DESIGN.md ya eligió ese peso exacto para el
                      límite entre dos escalas distintas —el que separa un día
                      de otro frente al que separa dos series del mismo
                      ejercicio— y aquí el salto de escala es el mismo, de
                      «cambiar una etiqueta» a «tirar meses de registro». */}
                  <button
                    type="button"
                    className="editor-row editor-row-danger delete-exercise"
                    onClick={() => setConfirmingDelete(true)}
                  >
                    Eliminar ejercicio
                  </button>
                </>
              }
            />
          </>
        )}
      </div>

      {confirmingDelete && current && (
        <DeleteConfirm
          name={current.name}
          damage={deleteDamage}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={deleteCurrent}
        />
      )}

      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}

      {/* Exporting belongs with the numbers it exports, and it is the rarest
          thing on this screen — so it sits at the bottom of it. */}
      {days.length > 0 && (
        <div className="export-row">
          {/* Callado, como el editor: DESIGN.md dice que las acciones raras no
              se llevan controles con peso de contenido, y ésta es la más rara
              de todas. Iba de botón con caja y salía más fuerte que la única
              puerta para renombrar un ejercicio. */}
          <button type="button" className="unit-fix export-csv" onClick={() => downloadCsv(days)}>
            Exportar CSV
          </button>
        </div>
      )}
    </section>
  )
}

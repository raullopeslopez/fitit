// Dev-only bench for the per-muscle volume row: `?harness=volume`.
//
// The row has to be judgeable on its own, and on the real screen it is one of
// nine inside a card inside a tab bar inside a fetch. Here it is the only thing
// on the page, drawn against a fixture that holds every band state at once —
// so "can you tell under from inside from over in two seconds" is a question
// you can actually ask.
//
// Not shipped: `main.jsx` only mounts this when the query string asks for it.
import { useEffect } from 'react'

import { PeriodSummary } from '../Progress.jsx'
import { days, emptyWeekDays, mondayDays, noHistoryDays } from './fixture.js'

// The four weeks worth benching. `llena` spreads every band state across nine
// rows at once, which is the only way to judge the row itself; `lunes` is the
// week five days out of seven actually look like; `vacia` and `nueva` have no
// rows to draw at all and are therefore almost entirely copy, which a static
// mock cannot be judged from.
//
// Two pieces arrived with two spellings — `?caso=` and `?case=` — so both keys
// are read and the Spanish values are canonical. `case=monday` is kept because
// it is written into briefs already in flight, and costs one line.
const CASES = {
  llena: days,
  lunes: mondayDays,
  monday: mondayDays,
  vacia: emptyWeekDays,
  nueva: noHistoryDays,
}

// Dark is the design's primary target (DESIGN.md: "dark-first"), but the theme
// is chosen by `prefers-color-scheme`, so the bench showed whatever the machine
// running it happened to prefer. That is how a band drawn at 8% white — fainter
// than the 9% ruling it has to be told apart from — survived being looked at:
// on paper it read, and paper is the theme nobody designed against.
//
// `?harness=volume&theme=light` still gives the other one. The tokens are not
// copied here: this lifts the real `@media (prefers-color-scheme: dark)` block
// straight out of the loaded stylesheet and re-asserts it unconditionally, so
// the bench cannot drift from the palette it is meant to be testing.
function useForcedTheme(theme) {
  useEffect(() => {
    if (theme !== 'dark') return undefined
    const want = '(prefers-color-scheme: dark)'
    const out = []
    for (const sheet of document.styleSheets) {
      let rules
      try {
        rules = sheet.cssRules
      } catch {
        continue // a cross-origin sheet has no rules to read; none of ours are
      }
      for (const rule of rules) {
        if (rule.media?.mediaText?.includes(want)) out.push(rule.cssText)
      }
    }
    if (out.length === 0) return undefined
    const el = document.createElement('style')
    // Strip the wrapper so the rules inside apply regardless of the media query.
    el.textContent = out
      .map((css) => css.replace(/^@media[^{]*\{/, '').replace(/\}\s*$/, ''))
      .join('\n')
    document.head.appendChild(el)
    return () => el.remove()
  }, [theme])
}

export default function VolumeHarness() {
  const params = new URLSearchParams(location.search)
  useForcedTheme(params.get('theme') ?? 'dark')
  const fixture = CASES[params.get('caso') ?? params.get('case')] ?? days
  return (
    <div className="app">
      <PeriodSummary days={fixture} />
    </div>
  )
}

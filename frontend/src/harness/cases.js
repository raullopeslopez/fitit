// The weeks worth benching, named once so both benches agree on what
// `?caso=lunes` means.
//
// `llena` spreads every band state across nine rows at once, which is the only
// way to judge the row itself; `lunes` is the week five days out of seven
// actually look like; `vacia` and `nueva` have no rows to draw at all and are
// therefore almost entirely copy, which a static mock cannot be judged from;
// `intacto` is the one row RP puts a floor of zero under, where "never touched"
// and "trained enough" draw the same picture unless something is done about it
// — and no other case produces it, since `llena` gives Core 12.5 and `lunes`
// gives it 1.5.
//
// Two pieces arrived with two spellings — `?caso=` and `?case=` — so both keys
// are read and the Spanish values are canonical. `case=monday` is kept because
// it is written into briefs already in flight, and costs one line.
import {
  days,
  emptyWeekDays,
  mondayDays,
  noHistoryDays,
  quietCoreDays,
} from './fixture.js'

export const CASES = {
  llena: days,
  lunes: mondayDays,
  monday: mondayDays,
  vacia: emptyWeekDays,
  nueva: noHistoryDays,
  intacto: quietCoreDays,
}

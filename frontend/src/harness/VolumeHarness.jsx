// Dev-only bench for the per-muscle volume row: `?harness=volume`.
//
// The row has to be judgeable on its own, and on the real screen it is one of
// nine inside a card inside a tab bar inside a fetch. Here it is the only thing
// on the page, drawn against a fixture that holds every band state at once —
// so "can you tell under from inside from over in two seconds" is a question
// you can actually ask.
//
// Not shipped: `main.jsx` only mounts this when the query string asks for it.
import { PeriodSummary } from '../Progress.jsx'
import { days } from './fixture.js'

export default function VolumeHarness() {
  return (
    <div className="app">
      <PeriodSummary days={days} />
    </div>
  )
}

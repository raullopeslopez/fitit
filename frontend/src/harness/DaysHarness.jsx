// Dev-only bench for the whole of Días: `?harness=dias`.
//
// The volume bench (`?harness=volume`) answers "is the row readable". This one
// answers the question that decides the screen: **what is above the fold at
// 430x932**. That cannot be judged from the rows alone — it depends on the app
// header, the week rule, the day list underneath and the CTA pinned over the
// tab bar, which means the real `App` and not a component in isolation.
//
// So this mounts `App` and lies to it about the network instead: one `fetch`
// stub over the three endpoints the two tabs touch, answering `/days` with one
// of the same fixtures the volume bench uses. Nothing in `App`, `Days` or
// `Progress` knows it is on a bench, which is the point — a harness that needs
// a prop in the component is measuring the harness.
//
// A local backend does not exist (see CLAUDE.md), and the Chrome extension
// cannot inject into `localhost`, so this route is also how the critic looks at
// it: `npm run dev`, then `?harness=dias&caso=llena&theme=dark`.
//
// Not shipped: `main.jsx` only mounts this when the query string asks for it.
import App from '../App.jsx'
import { CASES } from './cases.js'
import { caseFrom, useForcedTheme } from './theme.js'

const params = new URLSearchParams(location.search)

// Installed at import time, before `App` mounts and fires its effects: `Days`
// asks for `/days` on its first render, and a stub installed inside a component
// would already have lost that race.
function stubNetwork(fixture) {
  const routes = {
    '/api/days': fixture,
    '/api/exercises': [],
    '/api/exercises/records': [],
  }
  window.fetch = async (input) => {
    const path = String(typeof input === 'string' ? input : input.url).split('?')[0]
    const body = routes[path.replace(/^https?:\/\/[^/]+/, '')] ?? []
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

// Without a token the app sits on the login screen; with a stale open-workout
// id it opens inside Entreno. Both are states this bench is not about.
localStorage.clear()
localStorage.setItem('fitit_token', 'harness')
stubNetwork(caseFrom(params, CASES, CASES.llena))

export default function DaysHarness() {
  useForcedTheme(params.get('theme') ?? 'dark')
  return <App />
}

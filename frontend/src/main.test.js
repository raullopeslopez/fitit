import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

// This one reads the source rather than running it, deliberately. What has to
// hold is a *build* property — that Vite can prove the harness branch is dead
// and drop the chunks — and there is no way to assert that from inside a test
// that Vite is not building. Shelling out to `npm run build` from a unit test
// would double the CI build to catch a two-line regression.
//
// The regression it guards is real and shipped once: `main.jsx` lazily
// `import()`ed the benches and a comment claimed that meant they "can never
// reach a real build". A dynamic import makes a chunk lazy, not absent.
// `npm run build` emitted `DaysHarness-*.js` containing `localStorage.clear()`
// and a `fetch` stub, reachable from the entry chunk — so on production
// `/?harness=dias` signed the user out, dropped any session in progress, and
// drew fixture data over the top.
// `import.meta.url` is not a file URL under the jsdom environment, so resolve
// from the vitest root instead — which is `frontend/`.
const source = readFileSync(join(process.cwd(), 'src', 'main.jsx'), 'utf8')

describe('main.jsx', () => {
  it('imports the dev benches only inside a statically-false production guard', () => {
    const imports = [...source.matchAll(/import\(['"]\.\/harness\//g)]
    expect(imports.length).toBeGreaterThan(0)

    const guard = source.indexOf('if (import.meta.env.DEV) {')
    expect(guard, 'the DEV guard must exist verbatim so Vite can fold it').toBeGreaterThan(-1)

    // Every bench import has to sit after the guard opens and before the
    // unguarded `return <App />` that closes it.
    const fallback = source.indexOf('return <App />')
    for (const match of imports) {
      expect(match.index).toBeGreaterThan(guard)
      expect(match.index).toBeLessThan(fallback)
    }
  })

  it('does not read the harness query parameter in a production build', () => {
    // Reading it is harmless on its own, but if the parameter is read outside
    // the guard the next person will reasonably wire a branch to it.
    const read = source.indexOf("get('harness')")
    expect(read).toBeGreaterThan(-1)
    expect(source.slice(0, read)).toContain('import.meta.env.DEV')
  })
})

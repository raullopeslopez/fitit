// Pin a dev bench to one theme, whatever the machine running it prefers.
//
// Dark is the design's primary target (DESIGN.md: "dark-first"), but the theme
// is chosen by `prefers-color-scheme`, so a bench showed whatever the laptop
// happened to be set to. That is how a band drawn at 8% white — fainter than
// the 9% ruling it has to be told apart from — survived being looked at: on
// paper it read, and paper is the theme nobody designed against.
//
// The tokens are not copied here: this lifts the real
// `@media (prefers-color-scheme: dark)` block straight out of the loaded
// stylesheet and re-asserts it unconditionally, so a bench cannot drift from
// the palette it is meant to be testing.
import { useEffect } from 'react'

export function useForcedTheme(theme) {
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

// The five weeks the volume work is benched against, by their query-string
// names. Shared by both benches so `?caso=lunes` means the same week whichever
// one you are looking at.
export function caseFrom(params, cases, fallback) {
  return cases[params.get('caso') ?? params.get('case')] ?? fallback
}

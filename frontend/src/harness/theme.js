// Pin a dev bench to one theme, whatever the machine running it prefers.
//
// Dark is the design's primary target (DESIGN.md: "dark-first"), and a bench
// that showed whatever the laptop happened to be set to is how a band drawn at
// 8% white — fainter than the 9% ruling it has to be told apart from — survived
// being looked at. The stylesheet paints `<html data-theme>`, so pinning is
// setting that attribute, the same thing Perfil → Apariencia does.
import { useEffect } from 'react'

import { applyTheme } from '../theme.js'

export function useForcedTheme(theme) {
  useEffect(() => {
    applyTheme(theme === 'dark' ? 'dark' : 'light')
    return () => applyTheme()
  }, [theme])
}

// The five weeks the volume work is benched against, by their query-string
// names. Shared by both benches so `?caso=lunes` means the same week whichever
// one you are looking at.
export function caseFrom(params, cases, fallback) {
  return cases[params.get('caso') ?? params.get('case')] ?? fallback
}

import { Haptics, ImpactStyle } from '@capacitor/haptics'

import { isNative } from './native.js'

// La vibración que confirma lo que hiciste (lienzo «Movimiento»): corta al
// registrar, doble en un récord. Nunca para llamarte. En el navegador, la de
// `navigator.vibrate` si la hay; si no, nada — no es un dato, es un acuse.
function vibrar(ms) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(ms)
}

export function tap() {
  if (isNative()) Haptics.impact({ style: ImpactStyle.Light }).catch(() => {})
  else vibrar(12)
}

export function doble() {
  if (isNative()) {
    Haptics.impact({ style: ImpactStyle.Medium })
      .then(() => new Promise((r) => setTimeout(r, 120)))
      .then(() => Haptics.impact({ style: ImpactStyle.Medium }))
      .catch(() => {})
  } else vibrar([16, 80, 16])
}

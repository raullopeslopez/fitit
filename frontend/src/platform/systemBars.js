import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { isNative } from './native.js'

// El color de los iconos de las barras del teléfono (hora, batería, la raya de
// gestos). La app se pinta debajo de ellas (`viewport-fit=cover`), así que
// tienen que contrastar con el tema que hay pintado, que puede no ser el del
// teléfono si se eligió uno en Perfil. `DARK` es «iconos claros sobre fondo
// oscuro». En el navegador no hay nada que hacer: ahí manda `theme-color`.
export function setSystemBarsTheme(theme) {
  if (!isNative()) return
  SystemBars.setStyle({
    style: theme === 'dark' ? SystemBarsStyle.Dark : SystemBarsStyle.Light,
  }).catch(() => {})
}

// ── La salida: dónde te deja el editor cuando lo dejas ─────────────────────
//
// El panel tiene cuatro puertas y las cuatro **guardan** igual. Esta suite
// comprueba la otra mitad de esa promesa, que no estaba comprobada en ningún
// sitio: que las cuatro también te **dejan** igual.
//
// Tres invariantes por puerta, y ninguno de los tres se puede medir en jsdom:
//
// 1. **La página no se ha movido.** El panel vive en un hueco de altura cero,
//    así que abrirlo y cerrarlo no puede cambiar ni el scroll ni el alto del
//    documento. En jsdom `scrollY` es siempre 0 y `scrollHeight` siempre 0: la
//    afirmación se puede escribir y no dice nada.
// 2. **El foco vuelve al disparador.** Esto sí se prueba en jsdom, con un
//    arnés; aquí se prueba con la app entera y el disparador de verdad, que es
//    el que puede haberse quedado `inert` debajo del panel.
// 3. **Sigues en la misma pantalla.** Ninguna salida navega: el gesto de atrás
//    de Android es el que estuvo a punto de llevarse la sesión entera por
//    delante, y es la única de las cuatro que puede.
import { beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { EPS, settle } from './geometry.js'
import { MAIN, mountEntreno, mountProgreso, openEditor } from './screen.jsx'

let user

beforeEach(() => {
  user = userEvent.setup()
})

const trigger = () => screen.getByRole('button', { name: `Editar ejercicio ${MAIN}` })

// El gesto de atrás del sistema. `history.back()` es asíncrono y no devuelve
// nada que esperar, así que se espera al propio `popstate` — sin esto la
// medición lee el estado de antes del gesto, que es el cepo que ya se comió a
// dos agentes en esta suite.
async function androidBack() {
  await new Promise((resolve) => {
    window.addEventListener('popstate', () => setTimeout(resolve, 0), { once: true })
    window.history.back()
  })
  await settle()
}

// Un toque en cualquier sitio que no sea el panel. `pointerdown` y no `click`,
// que es lo que el panel escucha: así el mismo toque cierra *y* llega a lo que
// apuntabas.
async function tapOutside() {
  const away = document.querySelector('main h1, main h2')
  away.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  await settle()
}

const EXITS = {
  'el aspa': async () => {
    await user.click(screen.getByRole('button', { name: 'Cerrar' }))
    await settle()
  },
  Escape: async () => {
    await user.keyboard('{Escape}')
    await settle()
  },
  'el gesto de atrás': androidBack,
  'tocar fuera': tapOutside,
}

for (const [screenName, mount] of Object.entries({
  Entreno: mountEntreno,
  Progreso: mountProgreso,
})) {
  describe(`${screenName} · las cuatro salidas dejan lo mismo`, () => {
    for (const [route, leave] of Object.entries(EXITS)) {
      it(`por ${route}: ni scroll, ni foco perdido, ni pantalla nueva`, async () => {
        const { restore } = await mount()
        try {
          // A media página: es donde el panel tiene que subirse para caber, o
          // sea donde una salida que reacomode algo se nota.
          window.scrollTo(0, 300)
          await settle()

          const before = {
            y: window.scrollY,
            height: document.documentElement.scrollHeight,
            path: window.location.pathname,
          }
          const opener = trigger()
          opener.focus()

          await openEditor(user)
          // Abrir tampoco mueve nada: el hueco no toma altura y el panel se
          // coloca contra el viewport, no contra el documento.
          expect(Math.abs(window.scrollY - before.y)).toBeLessThanOrEqual(EPS)
          expect(document.documentElement.scrollHeight).toBeCloseTo(before.height, 0)

          await leave()

          expect(screen.queryByRole('dialog')).toBeNull()
          expect(Math.abs(window.scrollY - before.y)).toBeLessThanOrEqual(EPS)
          expect(document.documentElement.scrollHeight).toBeCloseTo(before.height, 0)
          // El mismo botón, en el mismo sitio, con el foco dentro.
          expect(document.activeElement).toBe(trigger())
          expect(window.location.pathname).toBe(before.path)
          // Y la tarjeta sigue siendo la de este ejercicio: ninguna salida
          // cambia de ejercicio ni de pantalla.
          expect(trigger()).toBeInTheDocument()
        } finally {
          restore()
        }
      })
    }
  })
}

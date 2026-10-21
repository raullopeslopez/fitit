import { useEffect, useRef } from 'react'

// Mantener pulsado un − o un + repite (lienzo «Movimiento → fichas que
// ruedan»): a los 400 ms empieza, y luego cada 120 ms, con la cifra rodando en
// cada paso. Soltar para. El toque suelto sigue siendo un paso.
//
// Uno por pantalla basta: hay un solo dedo. `accion` tiene que leer el valor
// al día (setter funcional), porque se repite sin que React vuelva a pintar el
// botón entre medias.
const ESPERA = 400
const CADA = 120

export function useRepetir() {
  const reloj = useRef(null)
  const repitio = useRef(false)

  const parar = () => {
    clearTimeout(reloj.current)
    clearInterval(reloj.current)
    reloj.current = null
  }
  useEffect(() => parar, [])

  return (accion) => ({
    onClick: () => {
      // Al soltar tras repetir llega un click: los pasos ya están dados.
      if (repitio.current) {
        repitio.current = false
        return
      }
      accion()
    },
    onPointerDown: () => {
      parar()
      repitio.current = false
      reloj.current = setTimeout(() => {
        repitio.current = true
        accion()
        reloj.current = setInterval(accion, CADA)
      }, ESPERA)
    },
    onPointerUp: parar,
    onPointerLeave: parar,
    onPointerCancel: parar,
    // Que el dedo quieto no abra el menú del sistema.
    onContextMenu: (event) => event.preventDefault(),
  })
}

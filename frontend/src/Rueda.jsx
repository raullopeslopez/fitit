import { useEffect, useRef, useState } from 'react'

// Una cifra que rueda al cambiar (lienzo «Movimiento → Comido»: «lo que queda
// baja rodando»): hacia abajo si baja, hacia arriba si sube, 160 ms. Al montar
// no se mueve; sólo cuando el número cambia delante de ti.
export default function Rueda({ valor, children }) {
  const antes = useRef(valor)
  const vueltas = useRef(0)
  const [clase, setClase] = useState('')
  useEffect(() => {
    const previo = antes.current
    antes.current = valor
    if (typeof valor !== 'number' || typeof previo !== 'number' || valor === previo) return
    vueltas.current += 1
    setClase(` rueda-${valor > previo ? 'up' : 'down'}-${vueltas.current % 2 ? 'a' : 'b'}`)
  }, [valor])
  return <span className={`rueda${clase}`}>{children}</span>
}

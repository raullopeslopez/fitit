import { useEffect, useRef, useState } from 'react'

// Las píldoras de una pantalla hecha de secciones seguidas (Progreso, Semana):
// ya no esconden lo demás. Quedan pegadas arriba al desplazarte, marcan en
// tinta la sección por la que pasas y, tocadas, bajan hasta ella. `inicial`
// abre la pantalla ya en otra sección (el aviso de la revisión, en «La que
// viene»).
//
// La sección en la que estás es la última cuyo principio ya ha pasado bajo las
// píldoras; al fondo de la página, la última, que puede no llegar a subir.
export default function Indice({ label, secciones, inicial }) {
  const [activa, setActiva] = useState(() => {
    const i = secciones.findIndex((s) => s.id === inicial)
    return i < 0 ? 0 : i
  })
  const nav = useRef(null)
  // Mientras dura el salto suave, el scroll pasa por las secciones de en medio:
  // la píldora tocada se queda marcada hasta que acaba.
  const saltando = useRef(null)

  useEffect(() => {
    if (inicial && inicial !== secciones[0]?.id) document.getElementById(inicial)?.scrollIntoView?.({ block: 'start' })
    // Sólo al montar: después manda el scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function medir() {
      if (saltando.current) return
      const bajo = (nav.current?.getBoundingClientRect().bottom ?? 0) + 40
      let i = 0
      secciones.forEach((s, j) => {
        const el = document.getElementById(s.id)
        if (el && el.getBoundingClientRect().top <= bajo) i = j
      })
      const doc = document.documentElement
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= doc.scrollHeight - 2) i = secciones.length - 1
      setActiva(i)
    }
    window.addEventListener('scroll', medir, { passive: true })
    return () => window.removeEventListener('scroll', medir)
  }, [secciones])

  function ir(i) {
    setActiva(i)
    const el = document.getElementById(secciones[i].id)
    if (!el) return
    const quieto =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    clearTimeout(saltando.current)
    saltando.current = setTimeout(() => {
      saltando.current = null
    }, 700)
    el.scrollIntoView?.({ behavior: quieto ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <nav ref={nav} className="indice" aria-label={label}>
      <div className="indice-pildoras" style={{ '--n': secciones.length }}>
        {secciones.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`indice-btn${i === activa ? ' is-on' : ''}`}
            aria-current={i === activa ? 'true' : undefined}
            onClick={() => ir(i)}
          >
            {s.label}
          </button>
        ))}
      </div>
    </nav>
  )
}

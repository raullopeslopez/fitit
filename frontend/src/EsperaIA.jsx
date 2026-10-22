import { useEffect, useState } from 'react'

/**
 * La espera mientras piensa el modelo (lienzo «Comida simple», fila 6).
 *
 * Sobria a propósito: ni arcoíris ni una bola que late. Un texto que dice el
 * paso —los pasos de verdad del servidor, en su orden— con un barrido de luz
 * de la tinta sobre el gris, y debajo los huecos donde va a caer el resultado,
 * para que al llegar se rellenen en su sitio sin que nada salte.
 *
 * - Lo que contesta antes de `retraso` no enseña nada: un destello es peor que
 *   ninguna espera.
 * - Los pasos avanzan y se quedan en el último; nunca vuelven a empezar, que
 *   leería como «está atascado».
 * - A los `paciencia` ms, «Está tardando» con dos salidas. Nunca un giratorio
 *   infinito.
 * - Con «reducir movimiento», sin barrido: el texto cambia con un fundido
 *   (styles.css).
 */
export default function EsperaIA({
  pasos,
  filas = 4,
  onRendirse = null,
  retraso = 400,
  cadencia = 900,
  paciencia = 8000,
}) {
  const [visible, setVisible] = useState(retraso <= 0)
  const [paso, setPaso] = useState(0)
  const [tarda, setTarda] = useState(false)
  const [sigo, setSigo] = useState(false)

  useEffect(() => {
    const timers = [setTimeout(() => setVisible(true), retraso)]
    for (let i = 1; i < pasos.length; i++) {
      timers.push(setTimeout(() => setPaso(i), retraso + cadencia * i))
    }
    timers.push(setTimeout(() => setTarda(true), paciencia))
    return () => timers.forEach(clearTimeout)
  }, [pasos.length, retraso, cadencia, paciencia])

  if (!visible) return null

  return (
    <div className="espera-ia">
      <p className="espera-ia-paso" role="status" aria-live="polite">
        {/* La clave hace que cada paso entre de nuevo: el cambio se nota. */}
        <span key={paso} className="espera-brillo">
          {pasos[paso]}
        </span>
      </p>
      <div className="espera-ia-huecos" aria-hidden="true">
        {Array.from({ length: filas }, (_, i) => (
          <div key={i} className="espera-hueco-fila">
            <span className="espera-hueco-textos">
              <span className="espera-hueco is-nombre" style={{ width: `${[62, 78, 48, 56][i % 4]}%` }} />
              <span className="espera-hueco is-detalle" style={{ width: `${[38, 22, 30, 44][i % 4]}%` }} />
            </span>
            <span className="espera-hueco is-pildora" />
          </div>
        ))}
      </div>
      {tarda && !sigo && (
        <p className="espera-ia-tarda">
          <span>Está tardando</span>
          <button type="button" className="link-btn" onClick={() => setSigo(true)}>
            Seguir esperando
          </button>
          {onRendirse && (
            <button type="button" className="link-btn" onClick={onRendirse}>
              Escribirlo yo
            </button>
          )}
        </p>
      )}
    </div>
  )
}

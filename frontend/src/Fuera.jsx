import { useEffect, useState } from 'react'

import { estimateOut, listDishes } from './api.js'
import { formatMacro } from './food.js'
import { Linea } from './ImportarPlan.jsx'

// Lo que se guarda de lo revisado: cada línea con alimento y gramos. Una línea
// sin alimento o sin gramos no se guarda — NULL no es 0, y un gramaje que no se
// sabe no se convierte en uno inventado.
export function aGuardar(estados) {
  return estados
    .filter((l) => l.alimento != null && l.gramos != null && l.gramos > 0)
    .map((l) => ({ food_id: l.alimento, grams: l.gramos }))
}

// «Bar Paco · ~951 kcal». La virgulilla dice que es una cifra de fuera, no
// una pesada; sin cifra, `—` (NULL no es 0).
export function rotuloSitio(sitio) {
  const kcal = sitio.per_serving?.kcal
  return `${sitio.name} · ${kcal == null ? '—' : `~${formatMacro(kcal)}`} kcal`
}

const leerTusSitios = () => listDishes('', 'fuera')

function porQueNo(respuesta) {
  if (respuesta?.refusal === 'quota') {
    return respuesta.quota_scope === 'day'
      ? 'Se ha gastado la estimación de hoy. Prueba mañana.'
      : 'Demasiadas estimaciones seguidas. Espera un minuto y prueba otra vez.'
  }
  return 'No se ha podido entender. Cuéntalo de otra forma.'
}

/**
 * Comer fuera (registro sin huecos, fase 2): cuentas qué comiste, dices si
 * llevaba aceite o salsa, y revisas las líneas antes de guardar.
 *
 * El modelo sólo dice qué había en el plato y cuánto; las cifras salen del
 * catálogo, como al leer un plan. Lo del aceite lo contesta quien comió: es la
 * grasa que no se ve en una foto y por donde se quedan cortas las estimaciones.
 * Los gramos son de un modelo, así que esta pantalla es obligatoria (CLAUDE.md).
 */
export default function Fuera({
  estimar = estimateOut,
  guardar,
  guardarSitio,
  leerSitios = leerTusSitios,
  onGuardado,
  onClose,
}) {
  const [sitios, setSitios] = useState([])
  const [sitio, setSitio] = useState('')
  const [texto, setTexto] = useState('')
  const [aceite, setAceite] = useState(null)
  const [lineas, setLineas] = useState(null)
  const [estados, setEstados] = useState([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // Fase 3: tus sitios, del último en que comiste al primero. Si no llegan, se
  // cuenta como siempre: la lista es un atajo, no un paso.
  useEffect(() => {
    let vivo = true
    leerSitios()
      .then((lista) => vivo && setSitios(lista ?? []))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [leerSitios])

  async function apuntar(accion) {
    setBusy(true)
    setError(null)
    try {
      await accion()
      await onGuardado()
    } catch (err) {
      setError(err?.detail?.motivo ? `No se ha podido guardar: ${err.detail.motivo}.` : 'No se ha podido guardar.')
      setBusy(false)
    }
  }

  async function calcular() {
    setBusy(true)
    setError(null)
    try {
      const respuesta = await estimar(texto.trim(), aceite)
      if (respuesta?.refusal || !(respuesta?.lines ?? []).length) {
        setError(porQueNo(respuesta))
        return
      }
      setLineas(respuesta.lines)
      setEstados(respuesta.lines.map((l) => ({ alimento: l.food?.id ?? null, gramos: l.grams ?? null })))
    } catch (err) {
      setError(err?.status === 503 ? 'La estimación no está disponible.' : 'No se ha podido calcular. Prueba otra vez.')
    } finally {
      setBusy(false)
    }
  }

  function onGuardar() {
    return apuntar(() => guardar(aGuardar(estados), sitio.trim() || null))
  }

  const items = aGuardar(estados)

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Comer fuera">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Comer fuera</span>
          <span className="food-screen-slot">¿Qué comiste?</span>
        </p>
        <button type="button" className="link-btn" onClick={onClose}>
          Cerrar
        </button>
      </header>

      <div className="food-screen-body fuera">
        {lineas === null ? (
          <>
            {sitios.length > 0 && (
              <>
                <span className="card-eyebrow">Tus sitios</span>
                <ul className="fuera-sitios">
                  {sitios.map((s) => (
                    <li key={s.id}>
                      <button
                        type="button"
                        className="fuera-sitio"
                        disabled={busy}
                        onClick={() => apuntar(() => guardarSitio(s.id))}
                      >
                        {rotuloSitio(s)}
                      </button>
                    </li>
                  ))}
                </ul>
                <span className="card-eyebrow">Otro sitio</span>
              </>
            )}
            <textarea
              aria-label="Qué comiste"
              placeholder="Menú del día: lentejas, filete con patatas y flan"
              rows={3}
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
            <p className="fuera-pregunta">¿Llevaba aceite o salsa?</p>
            <div className="fuera-aceite" role="group" aria-label="Aceite o salsa">
              {[
                [true, 'Sí'],
                [false, 'No'],
              ].map(([valor, label]) => (
                <button
                  key={label}
                  type="button"
                  className={`chip${aceite === valor ? ' is-active' : ''}`}
                  aria-pressed={aceite === valor}
                  onClick={() => setAceite(valor)}
                >
                  {label}
                </button>
              ))}
            </div>
            {error && <p className="alert">{error}</p>}
            <button
              type="button"
              className="primary fuera-accion"
              disabled={busy || !texto.trim() || aceite === null}
              onClick={calcular}
            >
              {busy ? 'Calculando…' : 'Calcular'}
            </button>
          </>
        ) : (
          <>
            <p className="hint">Cifras estimadas: revisa los gramos antes de guardar.</p>
            <ul className="importar-lineas">
              {lineas.map((linea, i) => (
                <Linea
                  key={i}
                  linea={linea}
                  estado={estados[i]}
                  onCambio={(nuevo) => setEstados((todos) => todos.map((e, j) => (j === i ? nuevo : e)))}
                />
              ))}
            </ul>
            {/* La primera vez se le pone nombre; la siguiente sale arriba y
                cuesta un toque. Sin nombre, se apunta y no se guarda. */}
            <label className="fuera-pregunta" htmlFor="fuera-sitio">
              ¿Dónde? Para la próxima vez
            </label>
            <input
              id="fuera-sitio"
              className="fuera-nombre"
              autoComplete="off"
              placeholder="Bar Paco"
              value={sitio}
              onChange={(e) => setSitio(e.target.value)}
            />
            {error && <p className="alert">{error}</p>}
            <button
              type="button"
              className="primary fuera-accion"
              disabled={busy || items.length === 0}
              onClick={onGuardar}
            >
              Guardar
            </button>
          </>
        )}
      </div>
    </div>
  )
}

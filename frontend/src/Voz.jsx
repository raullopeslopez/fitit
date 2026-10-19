import { useEffect, useRef, useState } from 'react'

import { addMyPortion, hearVoice, logVoice, searchFoods } from './api.js'
import { MEAL_SLOTS, formatAmount, inferMealSlot, measureLabel, momentForDay } from './food.js'
import { startRecording } from './platform/recorder.js'

// «0:04».
function reloj(ms) {
  const s = Math.floor(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function porQueNo(respuesta) {
  if (respuesta?.refusal === 'quota') {
    return respuesta.quota_scope === 'day'
      ? 'Sin cuota de voz hasta mañana. Busca o escanea.'
      : 'Sin cuota de voz hasta dentro de un minuto.'
  }
  // El modelo saturado o caído: te ha oído, sólo que ahora no puede contestar.
  if (respuesta?.refusal === 'busy') return 'Gemini está saturado. Prueba en un minuto.'
  return 'No he entendido nada. Prueba otra vez.'
}

const numero = (raw) => {
  const value = Number(String(raw ?? '').replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? value : null
}

let siguiente = 0

// Una línea del servidor, con lo que la pantalla edita en texto: los gramos y,
// si es una pieza sin ración, cuánto pesa una (con lo que propuso el modelo).
function nueva(line) {
  siguiente += 1
  return {
    ...line,
    key: siguiente,
    grams: line.grams == null ? '' : String(line.grams),
    peso: line.unit_question?.suggested_grams == null ? '' : String(line.unit_question.suggested_grams),
    buscando: null,
  }
}

function resuelta(l) {
  if (!l.food) return false
  if (l.measure) return true
  if (l.unit_question) return numero(l.peso) != null
  return numero(l.grams) != null
}

/**
 * Dictar lo que has comido (docs/registro-por-voz.md). Se abre grabando: para
 * solo a los 2 s de silencio, o con «Listo». El audio va entero al servidor,
 * que contesta lo que oyó y las líneas casadas con tus alimentos; nada se
 * guarda hasta «Apuntar», y «Apuntar» no se deja tocar con algo sin resolver.
 */
export default function Voz({
  slot = null,
  dayIso,
  grabar = startRecording,
  oir = hearVoice,
  apuntar = logVoice,
  guardarRacion = addMyPortion,
  buscar = searchFoods,
  onDone,
  onClose,
}) {
  const [fase, setFase] = useState('escuchando')
  const [ms, setMs] = useState(0)
  const [oido, setOido] = useState([])
  const [lineas, setLineas] = useState([])
  const [error, setError] = useState(null)
  const [comida, setComida] = useState(slot ?? inferMealSlot())
  const [busy, setBusy] = useState(false)
  const control = useRef(null)
  const empezado = useRef(false)

  async function escuchar() {
    setError(null)
    setMs(0)
    setFase('escuchando')
    try {
      const grabacion = await grabar({ onTick: setMs })
      control.current = grabacion
      const audio = await grabacion.done
      setFase('entendiendo')
      const respuesta = await oir(audio)
      // Lo oído se enseña también cuando falla lo de después: dice que se te
      // entendió y que el problema es otro (Whisper oye; Gemini lee).
      if (respuesta?.transcript) setOido((o) => [...o, respuesta.transcript])
      if (respuesta?.refusal || !(respuesta?.lines ?? []).length) {
        setError(porQueNo(respuesta))
      } else {
        setLineas((ls) => [...ls, ...respuesta.lines.map(nueva)])
      }
    } catch (err) {
      setError(
        err?.status === 503
          ? 'La voz no está disponible.'
          : err?.name === 'NotAllowedError'
            ? 'Sin permiso para el micrófono.'
            : 'No se ha podido escuchar. Prueba otra vez.',
      )
    }
    setFase('revisar')
  }

  // Se abre grabando: es lo que pediste al tocar el micro. El ref evita la
  // segunda grabación del doble montaje de StrictMode.
  useEffect(() => {
    if (empezado.current) return
    empezado.current = true
    escuchar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function cambiar(key, cambio) {
    setLineas((ls) => ls.map((l) => (l.key === key ? { ...l, ...cambio } : l)))
  }

  async function abrirBusqueda(l) {
    cambiar(l.key, { buscando: { q: l.text, resultados: [] } })
    await buscarEn(l.key, l.text)
  }

  async function buscarEn(key, q) {
    cambiar(key, { buscando: { q, resultados: [] } })
    if (!q.trim()) return
    try {
      const resultados = (await buscar(q.trim())) ?? []
      setLineas((ls) => ls.map((l) => (l.key === key && l.buscando?.q === q ? { ...l, buscando: { q, resultados } } : l)))
    } catch {
      // Sin red, la lista se queda vacía y la línea sigue diciendo qué falta.
    }
  }

  async function onApuntar() {
    setBusy(true)
    try {
      for (const l of lineas) {
        if (l.unit_question) await guardarRacion(l.food.id, l.unit_question.label, numero(l.peso))
      }
      const entries = lineas.map((l) => {
        if (l.measure) return { food_id: l.food.id, measure: l.measure, quantity: l.measure_count, estimated: false }
        if (l.unit_question) {
          return { food_id: l.food.id, grams: numero(l.peso) * l.unit_question.count, estimated: false }
        }
        return { food_id: l.food.id, grams: numero(l.grams), estimated: Boolean(l.estimated) }
      })
      await apuntar({ entries, mealSlot: comida || null, loggedAt: momentForDay(dayIso) })
      await onDone()
    } catch {
      setError('No se ha podido apuntar. Prueba otra vez.')
      setBusy(false)
    }
  }

  const pendientes = lineas.filter((l) => !resuelta(l)).length

  if (fase !== 'revisar') {
    return (
      <div className="voz-grabando" role="status" aria-live="polite">
        {fase === 'escuchando' ? (
          <>
            <span className="voz-punto" aria-hidden="true" />
            <span className="voz-tiempo">Escuchando… {reloj(ms)}</span>
            <button type="button" className="primary voz-listo" onClick={() => control.current?.stop()}>
              Listo
            </button>
          </>
        ) : (
          <span className="voz-tiempo">Entendiendo…</span>
        )}
      </div>
    )
  }

  return (
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Revisa lo que has dicho">
      <header className="food-screen-head">
        <h2 className="food-screen-title">Revisa lo que has dicho</h2>
        <button type="button" className="link-btn" onClick={onClose} disabled={busy}>
          Cancelar
        </button>
      </header>
      <div className="food-screen-body voz-body">
        {oido.length > 0 && <p className="voz-oido">Has oído: {oido.join(', ')}</p>}

        {lineas.length > 0 && (
          <div className="food-slots" role="group" aria-label="Comida">
            {MEAL_SLOTS.map((s) => (
              <button
                type="button"
                key={s.key}
                className={`chip${comida === s.key ? ' is-active' : ''}`}
                aria-pressed={comida === s.key}
                onClick={() => setComida(s.key)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        <ul className="voz-lineas">
          {lineas.map((l) => (
            <Linea
              key={l.key}
              linea={l}
              onCambio={(cambio) => cambiar(l.key, cambio)}
              onQuitar={() => setLineas((ls) => ls.filter((x) => x.key !== l.key))}
              onBuscar={() => abrirBusqueda(l)}
              onTeclear={(q) => buscarEn(l.key, q)}
            />
          ))}
        </ul>

        {error && <p className="alert">{error}</p>}

        <div className="voz-acciones">
          <button type="button" className="link-btn" onClick={escuchar} disabled={busy}>
            {lineas.length ? 'Seguir hablando' : 'Probar otra vez'}
          </button>
          {lineas.length > 0 && (
            <button
              type="button"
              className="primary voz-apuntar"
              disabled={busy || pendientes > 0}
              onClick={onApuntar}
            >
              {pendientes > 0
                ? `Falta elegir ${pendientes}`
                : lineas.length === 1
                  ? 'Apuntar'
                  : `Apuntar las ${lineas.length}`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Linea({ linea: l, onCambio, onQuitar, onBuscar, onTeclear }) {
  const elegir = (food) => onCambio({ food, status: 'chosen', buscando: null })
  return (
    <li className="voz-linea">
      <div className="voz-linea-cabeza">
        {l.food ? (
          <span className="voz-linea-nombre">{l.food.name}</span>
        ) : l.status === 'ambiguous' ? (
          <span className="voz-linea-pregunta">¿Cuál?</span>
        ) : (
          <span className="voz-linea-falta">Falta: {l.text}</span>
        )}
        <button type="button" className="dish-ingredient-drop" aria-label={`Quitar ${l.text}`} onClick={onQuitar}>
          ✕
        </button>
      </div>
      {/* Lo dicho, debajo: con «¿Cuál?» es lo único que dice de qué línea se trata. */}
      {(l.food || l.status === 'ambiguous') && <p className="voz-linea-dicho">{l.text}</p>}

      {l.status === 'ambiguous' && (
        <div className="voz-elegir" role="group" aria-label={`¿Cuál es ${l.text}?`}>
          {l.candidates.map((c) => (
            <button
              type="button"
              key={c.id}
              className={`chip${l.food?.id === c.id ? ' is-active' : ''}`}
              aria-pressed={l.food?.id === c.id}
              onClick={() => elegir(c)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {l.status === 'missing' && !l.food && !l.buscando && (
        <button type="button" className="link-btn" onClick={onBuscar}>
          Buscar
        </button>
      )}
      {l.buscando && (
        <div className="voz-buscar">
          <input
            aria-label={`Buscar ${l.text}`}
            autoComplete="off"
            value={l.buscando.q}
            onChange={(e) => onTeclear(e.target.value)}
          />
          <div className="voz-elegir">
            {l.buscando.resultados.map((f) => (
              <button type="button" key={f.id} className="chip" onClick={() => elegir({ id: f.id, name: f.name })}>
                {f.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <Cantidad linea={l} onCambio={onCambio} />
    </li>
  )
}

function Cantidad({ linea: l, onCambio }) {
  if (l.measure) {
    return (
      <p className="voz-cantidad">
        <span className="voz-medida">{measureLabel(l.measure, l.measure_count)}</span> · ~
        {formatAmount(numero(l.grams))}
      </p>
    )
  }
  if (l.unit_question) {
    const etiqueta = `¿Cuánto pesa 1 ${l.unit_question.name}?`
    return (
      <div className="voz-cantidad voz-peso">
        <span aria-hidden="true">{etiqueta}</span>
        <input
          aria-label={etiqueta}
          inputMode="decimal"
          value={l.peso}
          onChange={(e) => onCambio({ peso: e.target.value })}
        />
        <span aria-hidden="true">g × {l.unit_question.count}</span>
      </div>
    )
  }
  return (
    <label className="voz-cantidad">
      <input
        aria-label={`Gramos de ${l.text}`}
        inputMode="decimal"
        placeholder="—"
        value={l.grams}
        onChange={(e) => onCambio({ grams: e.target.value, estimated: false })}
      />
      <span aria-hidden="true">g{l.estimated ? ' · estimado' : ''}</span>
    </label>
  )
}

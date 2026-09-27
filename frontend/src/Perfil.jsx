import { useCallback, useEffect, useState } from 'react'

import { getMe, setTargets } from './api.js'
import { formatMacro, kcalFromMacros } from './food.js'
import Objetivo from './Objetivo.jsx'
import {
  REST_OPTIONS,
  getRestSeconds,
  getScreenAwake,
  setRestSeconds,
  setScreenAwake,
} from './prefs.js'
import Reglas from './Reglas.jsx'
import Weight from './Weight.jsx'

// Lo que se fija una vez y se corrige rara vez, en un solo sitio: el peso, de
// dónde salen las calorías, cómo se reparten, las reglas y las preferencias de
// Entreno. Antes vivía repartido —el objetivo en un cajón de Comida, el peso en
// Progreso, el descanso en el menú de Entreno— y Comida mezclaba registrar con
// ajustar. Comida se queda con el registro; las cifras que compara salen de aquí.
export default function Perfil({ onLogout }) {
  const [me, setMe] = useState(null)
  const [reglasOpen, setReglasOpen] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setMe((await getMe()) ?? {})
    } catch {
      // Sin perfil, el reparto sale vacío y se puede rellenar igual.
      setMe({})
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  return (
    <div className="perfil">
      <Weight />

      <section className="card perfil-card" aria-labelledby="perfil-objetivo">
        <h2 id="perfil-objetivo">Objetivo</h2>
        {/* Aceptar la propuesta cambia las kcal del perfil, y con ellas lo que
            el reparto de abajo dice que falta por repartir. */}
        <Objetivo onAccepted={cargar} />
      </section>

      <section className="card perfil-card" aria-labelledby="perfil-macros">
        <h2 id="perfil-macros">Macros</h2>
        <p className="hint perfil-hint">
          Cuántos gramos de proteína, hidratos y grasa suman tus kcal.
        </p>
        {/* La clave son los gramos guardados: aceptar la propuesta de arriba los
            cambia en el servidor, y el formulario arranca otra vez de ellos en
            vez de quedarse con lo que había antes. */}
        {me && <Reparto key={claveMacros(me)} me={me} onSaved={setMe} />}
      </section>

      <section className="card perfil-card" aria-labelledby="perfil-reglas">
        <h2 id="perfil-reglas">Reglas</h2>
        <button type="button" className="secondary" onClick={() => setReglasOpen(true)}>
          Tus reglas
        </button>
      </section>

      <section className="card perfil-card" aria-labelledby="perfil-entreno">
        <h2 id="perfil-entreno">Entreno</h2>
        <PreferenciasEntreno />
      </section>

      {/* Lo más raro que se hace, al final. */}
      <p className="perfil-salir">
        <button type="button" className="link-btn" onClick={onLogout}>
          Salir
        </button>
      </p>

      {reglasOpen && <Reglas onChanged={() => {}} onClose={() => setReglasOpen(false)} />}
    </div>
  )
}

const claveMacros = (me) =>
  [me.objetivo_proteina, me.objetivo_hidratos, me.objetivo_grasa].join('/')

// Los macros: gramos por macro, y las kcal como consecuencia. Aceptar la
// propuesta de Objetivo los rellena (2 g de proteína por kilo, un cuarto de las
// kcal en grasa, el resto hidratos); aquí se retocan.
//
// Antes se fijaban las kcal y la proteína, cada una por su lado, y eso dejaba
// guardar un total que sus propios macros no daban —2.600 kcal con 160 g de
// proteína, 300 de hidratos y 80 de grasa son 2.560— con las dos cifras en
// pantalla y nada que dijera cuál mandaba. Ahora se reparte en gramos y el total
// sale de ahí: una sola cifra que no se puede contradecir.
//
// El total se recalcula al teclear, antes de guardar nada, porque el reparto es
// justo lo que hay que ver mientras se decide. La cuenta es la misma que hace el
// servidor al guardar (`atwater_kcal`), y hay una prueba que ata las dos.
function Reparto({ me, onSaved }) {
  const show = (value) => (value != null ? String(value) : '')
  const [values, setValues] = useState({
    protein: show(me.objetivo_proteina),
    carbs: show(me.objetivo_hidratos),
    fat: show(me.objetivo_grasa),
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const number = (raw) => {
    const value = Number(String(raw).replace(',', '.'))
    return String(raw).trim() === '' || !Number.isFinite(value) ? null : value
  }
  const macros = {
    protein: number(values.protein),
    carbs: number(values.carbs),
    fat: number(values.fat),
  }
  // Sin un solo macro repartido no hay total, y `null` se imprime `—`. Un 0 aquí
  // diría «tu objetivo es no comer», que es otra afirmación — y además es la que
  // el servidor se niega a guardar.
  const derived = Object.values(macros).some((v) => v != null) ? kcalFromMacros(macros) : null
  const objetivo = me.objetivo_kcal ?? null
  const set = (key) => (e) => setValues({ ...values, [key]: e.target.value })

  async function guardar(e) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      // Sin kcal: las deriva el servidor del reparto (`atwater_kcal`). Vaciar
      // es una instrucción («bórralo»), así que van los tres siempre.
      const saved = await setTargets(macros)
      if (saved) onSaved(saved)
    } catch {
      setError('No se han podido guardar los macros.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="food-goals" onSubmit={guardar}>
      <div className="field">
        <label htmlFor="target-protein">Proteína (g)</label>
        <input
          id="target-protein"
          inputMode="decimal"
          placeholder="p. ej. 160"
          value={values.protein}
          onChange={set('protein')}
        />
      </div>
      <div className="row">
        <div className="field stepper-field">
          <label htmlFor="target-carbs">Hidratos (g)</label>
          <input
            id="target-carbs"
            inputMode="numeric"
            placeholder="300"
            value={values.carbs}
            onChange={set('carbs')}
          />
        </div>
        <div className="field stepper-field">
          <label htmlFor="target-fat">Grasa (g)</label>
          <input
            id="target-fat"
            inputMode="numeric"
            placeholder="80"
            value={values.fat}
            onChange={set('fat')}
          />
        </div>
      </div>

      {/* Sólo lectura, y por eso no es un campo: es lo que sale de lo de arriba,
          no otra cosa que decidir. */}
      <p className="card food-goals-total">
        <span className="food-detail-label">Total derivado</span>
        <span className="food-detail-value">{formatMacro(derived)} kcal</span>
      </p>

      {/* Dos cifras diciendo ser tu objetivo —la aceptada arriba y la que sale
          de repartir aquí— y nada que dijera cuál manda. Manda la de arriba: el
          objetivo da el total y esto lo reparte. Así que aquí se dice cuánto
          falta por repartir, que convierte la contradicción en una cuenta. */}
      {/* Por debajo de 10 kcal es el redondeo de los gramos, no un desfase. */}
      {objetivo != null && derived != null && Math.abs(objetivo - derived) >= 10 && (
        <p className="hint food-goals-gap">
          Tu objetivo son {formatMacro(objetivo)} kcal:{' '}
          {derived < objetivo
            ? `te faltan ${formatMacro(objetivo - derived)} por repartir.`
            : `te sobran ${formatMacro(derived - objetivo)}.`}
        </p>
      )}

      {error && (
        <p role="status" className="objetivo-falta">
          {error}
        </p>
      )}

      <button type="submit" className="primary btn-full" disabled={busy}>
        Guardar macros
      </button>
      <p className="hint food-goals-foot">
        Las kcal no se teclean: salen de repartir los gramos.
      </p>
    </form>
  )
}

// El descanso entre series y la pantalla encendida: se eligen una vez y valen
// para todas las sesiones. Vivían en el menú ⋯ de Entreno; Entreno sólo las lee.
function PreferenciasEntreno() {
  const [rest, setRest] = useState(getRestSeconds)
  const [awake, setAwake] = useState(getScreenAwake)

  return (
    <>
      <div className="menu-pref">
        <span className="prefs-label">Descanso</span>
        <div className="unit-toggle" role="group" aria-label="Descanso entre series">
          {REST_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className="unit-option"
              aria-pressed={rest === s}
              onClick={() => {
                setRestSeconds(s)
                setRest(s)
              }}
            >
              {s === 0 ? 'Sin' : `${s}s`}
            </button>
          ))}
        </div>
      </div>
      {/* La pantalla que no se apaga ahorra el viaje al bolsillo entre series. */}
      <div className="menu-pref">
        <span className="prefs-label">Pantalla activa</span>
        <div className="unit-toggle" role="group" aria-label="Mantener la pantalla encendida">
          {[
            [true, 'Sí'],
            [false, 'No'],
          ].map(([on, label]) => (
            <button
              key={label}
              type="button"
              className="unit-option"
              aria-pressed={awake === on}
              onClick={() => {
                setScreenAwake(on)
                setAwake(on)
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

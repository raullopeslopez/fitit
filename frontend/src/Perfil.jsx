import { useState } from 'react'

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
// dónde salen las calorías (y con ellas los macros), las reglas y las
// preferencias de Entreno. Antes vivía repartido —el objetivo en un cajón de Comida, el peso en
// Progreso, el descanso en el menú de Entreno— y Comida mezclaba registrar con
// ajustar. Comida se queda con el registro; las cifras que compara salen de aquí.
export default function Perfil({ onLogout }) {
  const [reglasOpen, setReglasOpen] = useState(false)
  // Cada pesada guardada: la propuesta de Objetivo sale de tu peso, así que se
  // vuelve a pedir en vez de quedarse con la del peso de antes.
  const [pesadas, setPesadas] = useState(0)

  return (
    <div className="perfil">
      <Weight onSaved={() => setPesadas((n) => n + 1)} />

      <section className="card perfil-card" aria-labelledby="perfil-objetivo">
        <h2 id="perfil-objetivo">Objetivo</h2>
        {/* Aceptar fija las kcal y sus gramos a la vez: los macros no se deciden
            aparte, y Comida compara con lo que se acepte aquí. */}
        <Objetivo onAccepted={async () => {}} refresh={pesadas} />
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

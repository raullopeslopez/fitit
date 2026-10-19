import { useCallback, useEffect, useState } from 'react'

import { getTargetProfile, getTargetProposal, saveTargetProfile } from './api.js'
import { currentWeek, isDeload, toggleDeload } from './deload.js'
import { formatRange } from './format.js'
import ObjetivoSheet, { conMiles, procedencia, ritmo } from './Objetivo.jsx'
import {
  REST_OPTIONS,
  getRestSeconds,
  getScreenAwake,
  setRestSeconds,
  setScreenAwake,
} from './prefs.js'
import Reglas from './Reglas.jsx'
import TusPlatos from './TusPlatos.jsx'
import TusSitios from './TusSitios.jsx'
import { applyTheme, getThemePref, setThemePref } from './theme.js'
import { Chip, ListRow, Sheet } from './ui'
import { publishStepsGoal } from './widgetSummary.js'

const SEXOS = [
  ['male', 'Hombre'],
  ['female', 'Mujer'],
]

// Vacío o ilegible es `null`, nunca cero: sin dato no es dato.
function numero(raw) {
  const value = Number(String(raw ?? '').replace(',', '.'))
  return String(raw ?? '').trim() === '' || !Number.isFinite(value) ? null : value
}

// Pasos: un entero, con o sin punto de miles («10.000» son diez mil, no diez).
// Vacío es sin objetivo (null), nunca cero.
function pasos(raw) {
  const text = String(raw ?? '').replace(/[.\s]/g, '')
  if (text === '') return null
  return /^\d+$/.test(text) ? Number(text) : NaN
}

// Los cuatro datos del cuerpo, cada uno con lo que lo distingue: cómo se
// teclea, cómo se lee en el campo y qué se manda. `campo` es la columna que
// PATCH /targets recibe: se manda **ella sola**, que el servidor acepta
// parciales, y así editar la altura no puede pisar lo que otro dispositivo
// cambió en el sexo.
const DATOS = {
  altura: {
    titulo: 'Altura',
    campo: 'height_cm',
    label: 'Altura (cm)',
    inputMode: 'decimal',
    valor: (p) => (p.height_cm == null ? null : `${p.height_cm} cm`),
    texto: (p) => (p.height_cm == null ? '' : String(p.height_cm).replace('.', ',')),
    parsear: numero,
  },
  nacimiento: {
    titulo: 'Año de nacimiento',
    campo: 'birth_year',
    label: 'Año de nacimiento',
    inputMode: 'numeric',
    valor: (p) => (p.birth_year == null ? null : String(p.birth_year)),
    texto: (p) => (p.birth_year == null ? '' : String(p.birth_year)),
    parsear: numero,
  },
  pesoMeta: {
    titulo: 'Peso meta',
    campo: 'goal_weight_kg',
    label: 'Peso meta (kg)',
    inputMode: 'decimal',
    placeholder: '97,5',
    valor: (p) => (p.goal_weight_kg == null ? null : `${String(p.goal_weight_kg).replace('.', ',')} kg`),
    texto: (p) => (p.goal_weight_kg == null ? '' : String(p.goal_weight_kg).replace('.', ',')),
    parsear: numero,
    // El servidor sólo acepta 30–300 kg; callarlo sería un error sin frase.
    valido: (v) => v === null || (v >= 30 && v <= 300),
    error: 'Entre 30 y 300 kg.',
  },
  pasos: {
    titulo: 'Meta de pasos',
    campo: 'steps_goal',
    label: 'Pasos al día',
    inputMode: 'numeric',
    placeholder: '10.000',
    valor: (p) => (p.steps_goal == null ? null : conMiles(p.steps_goal)),
    texto: (p) => (p.steps_goal == null ? '' : String(p.steps_goal)),
    parsear: pasos,
    // El servidor sólo acepta 1.000–100.000 pasos; mandarle otra cosa sería un
    // error callado en vez de una frase.
    valido: (v) => v === null || (v >= 1000 && v <= 100000),
    error: 'Entre 1.000 y 100.000 pasos.',
  },
}

// Lo que se fija una vez y se corrige rara vez, en un solo sitio: el peso, de
// dónde salen las calorías (y con ellas los macros), tus datos, las reglas y
// las preferencias de Entreno. Antes vivía repartido —el objetivo en un cajón
// de Comida, el peso en Progreso, el descanso en el menú de Entreno— y Comida
// mezclaba registrar con ajustar. Comida se queda con el registro; las cifras
// que compara salen de aquí.
//
// Cada ajuste es una fila y se edita en su hoja (DESIGN.md → Sistema v2): nada
// de un «Guardar» al pie de un formulario de seis campos.
export default function Perfil({ onLogout }) {
  const [reglasOpen, setReglasOpen] = useState(false)
  const [perfil, setPerfil] = useState(null)
  const [propuesta, setPropuesta] = useState(null)
  // Qué hoja está abierta: 'objetivo', una clave de `DATOS`, 'sexo', 'platos' o 'sitios'.
  const [hoja, setHoja] = useState(null)

  const pedirPerfil = useCallback(async () => {
    try {
      // `?? {}` y no a pelo: un perfil que no llega deja la pantalla
      // utilizable —las filas en «—» y la propuesta diciendo qué falta— en
      // vez de caerse sobre `undefined`.
      setPerfil((await getTargetProfile()) ?? {})
    } catch {
      setPerfil((actual) => actual ?? {})
    }
  }, [])

  const pedirPropuesta = useCallback(async () => {
    try {
      setPropuesta((await getTargetProposal()) ?? null)
    } catch {
      setPropuesta(null)
    }
  }, [])

  // Todo lo que depende de lo que acabas de guardar: el perfil y la cifra que
  // sale de él.
  const recargar = useCallback(
    () => Promise.all([pedirPerfil(), pedirPropuesta()]),
    [pedirPerfil, pedirPropuesta],
  )

  useEffect(() => {
    recargar()
  }, [recargar])

  const p = perfil ?? {}
  const kcal = propuesta?.kcal ?? null
  const falta = kcal == null && propuesta?.missing?.length > 0
  const cerrar = () => setHoja(null)

  return (
    <div className="perfil">
      {/* El peso vive en Progreso → Cuerpo (Marcador). Volver aquí vuelve a
          pedir la propuesta, así que una pesada nueva ya sale en ella. */}
      <h1 className="perfil-title">Tú</h1>

      <section className="perfil-seccion" aria-labelledby="perfil-objetivo">
        <h2 id="perfil-objetivo">Tu objetivo</h2>
        <div className="perfil-card">
          <ListRow
            label="Objetivo diario"
            hint={p.objetivo_kcal == null ? 'Sin aceptar' : undefined}
            value={p.objetivo_kcal == null ? null : `${conMiles(p.objetivo_kcal)} kcal`}
            onClick={() => setHoja('objetivo')}
          />
          <ListRow
            label="Propuesta"
            hint={falta ? `Falta: ${propuesta.missing.join(', ')}` : procedencia(propuesta)}
            value={kcal == null ? null : `${conMiles(kcal)} kcal`}
            onClick={() => setHoja('objetivo')}
          />
          <ListRow
            label="Ritmo"
            hint={propuesta?.plan ? `Semana ${propuesta.plan.week} de ${propuesta.plan.weeks}` : undefined}
            value={ritmo(p)}
            onClick={() => setHoja('objetivo')}
          />
          <ListRow
            label="Peso meta"
            value={DATOS.pesoMeta.valor(p)}
            onClick={() => setHoja('pesoMeta')}
          />
        </div>
      </section>

      <section className="perfil-seccion" aria-labelledby="perfil-datos">
        <h2 id="perfil-datos">Tus datos</h2>
        <div className="perfil-card">
          <ListRow label="Altura" value={DATOS.altura.valor(p)} onClick={() => setHoja('altura')} />
          <ListRow
            label="Año de nacimiento"
            value={DATOS.nacimiento.valor(p)}
            onClick={() => setHoja('nacimiento')}
          />
          <ListRow
            label="Sexo"
            value={SEXOS.find(([value]) => value === p.sex)?.[1] ?? null}
            onClick={() => setHoja('sexo')}
          />
          <ListRow label="Meta de pasos" value={DATOS.pasos.valor(p)} onClick={() => setHoja('pasos')} />
        </div>
      </section>

      {/* Lo tuyo de comer, junto (reorganización del 17 oct): Tus platos
          vivía en Plan, y Plan es para la semana. Tus sitios —donde comes
          fuera, que se guardan solos al ponerles nombre en «Fuera»— y tus
          reglas ya estaban aquí, cada uno en su sección. */}
      <section className="perfil-seccion" aria-labelledby="perfil-comida">
        <h2 id="perfil-comida">Tu comida</h2>
        <div className="perfil-card">
          <ListRow label="Tus platos" value="Ver" onClick={() => setHoja('platos')} />
          <ListRow label="Tus sitios" value="Ver" onClick={() => setHoja('sitios')} />
          <ListRow label="Tus reglas" value="Ver" onClick={() => setReglasOpen(true)} />
        </div>
      </section>

      <section className="perfil-seccion" aria-labelledby="perfil-entreno">
        <h2 id="perfil-entreno">Entreno</h2>
        <div className="perfil-card perfil-card-pad">
          <PreferenciasEntreno />
        </div>
      </section>

      <section className="perfil-seccion" aria-labelledby="perfil-apariencia">
        <h2 id="perfil-apariencia">Apariencia</h2>
        <div className="perfil-card perfil-card-pad">
          <PreferenciaTema />
        </div>
      </section>

      {/* Lo más raro que se hace, al final. */}
      <p className="perfil-salir">
        <button type="button" className="link-btn" onClick={onLogout}>
          Salir
        </button>
      </p>

      {hoja === 'objetivo' && (
        <ObjetivoSheet
          perfil={p}
          propuesta={propuesta}
          onClose={cerrar}
          onSaved={recargar}
          onAccepted={async () => {
            cerrar()
            await pedirPerfil()
          }}
        />
      )}
      {DATOS[hoja] && (
        <HojaDato dato={DATOS[hoja]} perfil={p} onClose={cerrar} onSaved={recargar} />
      )}
      {hoja === 'sexo' && <HojaSexo perfil={p} onClose={cerrar} onSaved={recargar} />}

      {hoja === 'platos' && <TusPlatos onClose={cerrar} />}
      {hoja === 'sitios' && <TusSitios onClose={cerrar} />}
      {reglasOpen && <Reglas onChanged={() => {}} onClose={() => setReglasOpen(false)} />}
    </div>
  )
}

// Una hoja, un campo. Se monta al abrirse, así que el borrador arranca del
// valor de ahora y cancelar no deja nada a medias.
function HojaDato({ dato, perfil, onClose, onSaved }) {
  const [texto, setTexto] = useState(dato.texto(perfil))
  const [mal, setMal] = useState(false)
  const [busy, setBusy] = useState(false)

  async function guardar(event) {
    event.preventDefault()
    const valor = dato.parsear(texto)
    if (dato.valido && !dato.valido(valor)) {
      setMal(true)
      return
    }
    setMal(false)
    setBusy(true)
    try {
      await saveTargetProfile({ [dato.campo]: valor })
      // El widget de Android dibuja la barra contra este número.
      if (dato.campo === 'steps_goal') publishStepsGoal(valor)
      onClose()
      // Y se vuelve a preguntar: la cifra depende de lo que se acaba de guardar.
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open title={dato.titulo} onClose={onClose}>
      <form onSubmit={guardar}>
        <div className="field">
          <label htmlFor="perfil-dato">{dato.label}</label>
          <input
            id="perfil-dato"
            inputMode={dato.inputMode}
            autoComplete="off"
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={dato.placeholder}
            aria-describedby={mal ? 'perfil-dato-error' : undefined}
          />
          {mal && (
            <p id="perfil-dato-error" className="perfil-aviso">
              {dato.error}
            </p>
          )}
        </div>
        <Acciones busy={busy} onCancel={onClose} />
      </form>
    </Sheet>
  )
}

// El sexo son dos opciones y se eligen, no se teclean: dos chips. Tocar el que
// está puesto lo quita, que «sin decir» es una respuesta válida.
function HojaSexo({ perfil, onClose, onSaved }) {
  const [sex, setSex] = useState(perfil.sex ?? null)
  const [busy, setBusy] = useState(false)

  async function guardar() {
    setBusy(true)
    try {
      await saveTargetProfile({ sex })
      onClose()
      await onSaved()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Sheet open title="Sexo" onClose={onClose}>
      <div className="perfil-chips" role="group" aria-label="Sexo">
        {SEXOS.map(([value, label]) => (
          <Chip key={value} selected={sex === value} onClick={() => setSex(sex === value ? null : value)}>
            {label}
          </Chip>
        ))}
      </div>
      <Acciones busy={busy} onCancel={onClose} onSave={guardar} />
    </Sheet>
  )
}

// `Cancelar` / `Guardar`. Con `onSave` es un botón; sin él, envía el formulario
// que lo contiene.
function Acciones({ busy, onCancel, onSave }) {
  return (
    <div className="perfil-acciones">
      <button type="button" className="secondary" onClick={onCancel}>
        Cancelar
      </button>
      <button
        type={onSave ? 'button' : 'submit'}
        className="primary"
        disabled={busy}
        onClick={onSave}
      >
        Guardar
      </button>
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
      <PreferenciaDescarga />
    </>
  )
}

// Una semana de cada seis u ocho entrenas a un tercio de tu volumen, con el
// mismo peso. Sólo la semana en curso: una descarga se planea, no se archiva
// después. Series por músculo la lee y cambia su referencia mientras dure.
function PreferenciaDescarga() {
  const week = currentWeek()
  const [on, setOn] = useState(() => isDeload(week.start))

  return (
    <div className="menu-pref">
      <span className="prefs-label">Semana de descarga</span>
      <div className="unit-toggle" role="group" aria-label="Semana de descarga">
        {[
          [true, 'Sí'],
          [false, 'No'],
        ].map(([value, label]) => (
          <button
            key={label}
            type="button"
            className="unit-option"
            aria-pressed={on === value}
            onClick={() => {
              if (value !== on) toggleDeload(week.start)
              setOn(value)
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="hint prefs-hint">
        {formatRange(week.start, week.end)}: 1/3 de tu volumen típico, mismo peso.
      </p>
    </div>
  )
}

// Claro u oscuro, o lo que diga el teléfono. Se aplica al tocarlo: no hay
// nada que guardar aparte.
const TEMAS = [
  ['system', 'Sistema'],
  ['light', 'Claro'],
  ['dark', 'Oscuro'],
]

function PreferenciaTema() {
  const [pref, setPref] = useState(getThemePref)

  return (
    <div className="menu-pref">
      <span className="prefs-label">Tema</span>
      <div className="unit-toggle" role="group" aria-label="Tema">
        {TEMAS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className="unit-option"
            aria-pressed={pref === value}
            onClick={() => {
              setThemePref(value)
              applyTheme(value)
              setPref(value)
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'

import { getMe, getTargetProfile, getTargetProposal, saveTargetProfile } from './api.js'
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
import TusSitios from './TusSitios.jsx'
import { applyTheme, getThemePref, setThemePref } from './theme.js'
import { Chip, ListRow, Sheet } from './ui'
import { publishStepsGoal } from './widgetSummary.js'

const SEXOS = [
  ['male', 'Hombre'],
  ['female', 'Mujer'],
]

// Vacío es `null`, nunca cero: sin dato no es dato. Ilegible es `NaN`, que no
// es vacío: no se guarda, y la hoja lo dice (HojaDato).
function numero(raw) {
  if (String(raw ?? '').trim() === '') return null
  return Number(String(raw).replace(',', '.'))
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
// de un «Guardar» al pie de un formulario de seis campos, ni en la hoja: cerrarla
// guarda. La excepción es «Tu objetivo», donde aceptar la cifra es la decisión.
// Dos letras: la inicial de cada palabra (raul.lopez → RL), o las dos primeras
// si es una sola.
export function iniciales(nombre) {
  const partes = String(nombre ?? '')
    .split(/[\s._-]+/)
    .filter(Boolean)
  if (partes.length === 0) return ''
  const dos = partes.length > 1 ? partes[0][0] + partes[1][0] : partes[0].slice(0, 2)
  return dos.toUpperCase()
}

export default function Perfil({ onLogout }) {
  // Tu nombre de usuario, sólo para las iniciales junto al titular.
  const [usuario, setUsuario] = useState(null)
  useEffect(() => {
    let vivo = true
    Promise.resolve()
      .then(() => getMe())
      .then((me) => vivo && setUsuario(me?.username ?? null))
      .catch(() => {})
    return () => {
      vivo = false
    }
  }, [])
  const [perfil, setPerfil] = useState(null)
  const [propuesta, setPropuesta] = useState(null)
  // Qué hoja está abierta: 'objetivo', una clave de `DATOS`, 'sexo' o 'sitios'.
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
      <header className="tu-head">
        <h1 className="perfil-title">Tú</h1>
        {iniciales(usuario) && (
          <span className="tu-avatar" aria-hidden="true">
            {iniciales(usuario)}
          </span>
        )}
      </header>

      {/* Marcador: el objetivo es la banda de la pantalla, a sangre y en
          amarillo, con la cifra en grande; sus filas, dentro y en tinta negra. */}
      <section className="tu-objetivo" aria-labelledby="perfil-objetivo" data-seccion>
        <h2 id="perfil-objetivo" className="tu-objetivo-sello">Tu objetivo</h2>
        <p className="tu-objetivo-cifra">
          <span className="tu-objetivo-kcal">
            {p.objetivo_kcal == null ? '—' : conMiles(p.objetivo_kcal)}
          </span>
          <span className="tu-objetivo-unidad">kcal / día</span>
        </p>
        {(ritmo(p) || DATOS.pesoMeta.valor(p)) && (
          <p className="tu-objetivo-linea">
            {[ritmo(p), DATOS.pesoMeta.valor(p) && `meta ${DATOS.pesoMeta.valor(p)}`].filter(Boolean).join(' · ')}
          </p>
        )}
        {/* La cuenta de la que sale la cifra: la hoja de «Tu objetivo». */}
        <button type="button" className="tu-cuenta" onClick={() => setHoja('objetivo')}>
          Ver la cuenta
        </button>
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

      <section className="perfil-seccion" data-seccion aria-labelledby="perfil-datos">
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

      {/* Tus sitios: donde comes fuera, que se guardan solos al ponerles
          nombre en «Fuera». Tus platos vive en Semana, donde se planifica con
          ellos; aquí era una segunda puerta a la misma lista (2026-10-24). Las
          reglas salieron de la vista con comida simple (2026-10-22): siguen en
          el planificador, sin pantalla. */}
      <section className="perfil-seccion" data-seccion aria-labelledby="perfil-comida">
        <h2 id="perfil-comida">Tu comida</h2>
        <div className="perfil-card">
          <ListRow label="Tus sitios" value="Ver" onClick={() => setHoja('sitios')} />
        </div>
      </section>

      <section className="perfil-seccion" data-seccion aria-labelledby="perfil-entreno">
        <h2 id="perfil-entreno">Entreno</h2>
        <div className="perfil-card perfil-card-pad">
          <PreferenciasEntreno />
        </div>
      </section>

      <section className="perfil-seccion" data-seccion aria-labelledby="perfil-apariencia">
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

      {hoja === 'sitios' && <TusSitios onClose={cerrar} />}
    </div>
  )
}

// Una hoja, un campo, y sin «Guardar» ni «Cancelar»: salir es guardar, como en
// el editor de ejercicio. Las salidas de la hoja —el fondo, Escape (que es el
// Atrás de Android) e Intro en el teclado— pasan todas por `salir`: si una
// guardase y otra no, el resultado dependería de dónde aterrizó el pulgar. Se
// monta al abrirse, así que el borrador arranca del valor de ahora.
//
// Qué manda cada salida:
// - lo mismo que había (o abrir para mirar): nada;
// - el campo vacío: `null`, «sin dato», nunca cero. Vaciar es la forma de
//   quitar un dato, y es una decisión que se ve en el campo;
// - algo que no se puede guardar (ilegible, o fuera de lo que el servidor
//   acepta): nada, y la hoja se queda diciendo por qué. Callarlo sería tirar lo
//   tecleado sin frase; borrarlo a `null`, convertir un error de dedo en un
//   «sin dato» que nadie pidió. Salir otra vez con lo mismo escrito cierra y
//   deja lo que había: la hoja no te encierra hasta que la cifra sea buena.
function HojaDato({ dato, perfil, onClose, onSaved }) {
  const [texto, setTexto] = useState(dato.texto(perfil))
  // El texto sobre el que ya se dijo que no valía, o `null`.
  const [avisado, setAvisado] = useState(null)

  const valido = (v) => v === null || (Number.isFinite(v) && (!dato.valido || dato.valido(v)))

  function salir() {
    const valor = dato.parsear(texto)
    if (!valido(valor)) {
      if (avisado === texto) onClose()
      else setAvisado(texto)
      return
    }
    onClose()
    if (valor === (perfil[dato.campo] ?? null)) return
    guardar(valor)
  }

  async function guardar(valor) {
    try {
      await saveTargetProfile({ [dato.campo]: valor })
      // El widget de Android dibuja la barra contra este número.
      if (dato.campo === 'steps_goal') publishStepsGoal(valor)
    } finally {
      // Y se vuelve a preguntar: la cifra depende de lo que se acaba de
      // guardar, y si no llegó, la fila vuelve a decir lo que hay de verdad.
      await onSaved()
    }
  }

  const mal = avisado !== null && avisado === texto

  return (
    <Sheet open title={dato.titulo} onClose={salir}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          salir()
        }}
      >
        <div className="field">
          <label htmlFor="perfil-dato">{dato.label}</label>
          <input
            id="perfil-dato"
            inputMode={dato.inputMode}
            enterKeyHint="done"
            autoComplete="off"
            autoFocus
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder={dato.placeholder}
            aria-describedby={mal ? 'perfil-dato-error' : undefined}
          />
          {mal && (
            <p id="perfil-dato-error" className="perfil-aviso">
              {dato.error ?? 'Escribe un número.'}
            </p>
          )}
        </div>
      </form>
    </Sheet>
  )
}

// El sexo son dos opciones y se eligen, no se teclean: dos chips, y tocar uno
// es la decisión entera — guarda y cierra, sin «Guardar». Tocar el que está
// puesto lo quita, que «sin decir» es una respuesta válida. Salir sin tocar
// ninguno no manda nada.
function HojaSexo({ perfil, onClose, onSaved }) {
  const sex = perfil.sex ?? null

  async function elegir(value) {
    onClose()
    try {
      await saveTargetProfile({ sex: sex === value ? null : value })
    } finally {
      await onSaved()
    }
  }

  return (
    <Sheet open title="Sexo" onClose={onClose}>
      <div className="perfil-chips" role="group" aria-label="Sexo">
        {SEXOS.map(([value, label]) => (
          <Chip key={value} selected={sex === value} onClick={() => elegir(value)}>
            {label}
          </Chip>
        ))}
      </div>
    </Sheet>
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

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

import ColdStart from './ColdStart.jsx'
import Comida from './Comida.jsx'
import Perfil from './Perfil.jsx'
import PlanPantalla from './PlanPantalla.jsx'
import Days from './Days.jsx'
import Login from './Login.jsx'
import Progress from './Progress.jsx'
import Register from './Register.jsx'
import Workout from './Workout.jsx'
import Wordmark from './Wordmark.jsx'
import { clearToken, getToken, setToken, setUnauthorizedHandler, setUpdateRequiredHandler } from './auth.js'
import { CLIENT_VERSION } from './platform/http.js'
import { useColdStart } from './coldstart.js'
import { startNativeQueue, stopNativeQueue } from './offline.js'
import { session } from './platform/session.js'
import { getOpenWorkout, setOpenWorkout } from './prefs.js'
import { onResume } from './platform/lifecycle.js'
import { salidaMuda } from './salidaMuda.js'
import { syncSteps } from './steps.js'
import { syncFood } from './widgetSummary.js'

// Donde vive la versión nueva del APK.
// El orden de la barra, de izquierda a derecha: por él se sabe hacia qué lado
// se va al cambiar de pestaña.
const ORDEN = ['food', 'plan', 'days', 'progress', 'profile']

const UPDATE_URL = 'https://github.com/raullopeslopez/fitit/releases/latest'

export default function App() {
  const [updateRequired, setUpdateRequired] = useState(false)
  const [token, setTokenState] = useState(getToken())
  // Resume where you were: mid-workout, the app reopens inside the workout.
  const [openWorkoutId, setOpenWorkoutId] = useState(getOpenWorkout)
  // The workout Días already had, handed over so Entreno draws immediately.
  // Deliberately not persisted — a resume goes through the fetch, because a
  // seed from a previous launch would be an unknown number of sets out of date.
  const [openWorkoutSeed, setOpenWorkoutSeed] = useState(null)
  // Se abre en Hoy, la primera pestaña: lo de hoy, comer y entrenar.
  const [view, setViewState] = useState('food')
  // Por qué lado entra la pantalla (`adelante`: desde la derecha). Sólo lo
  // pone cambiar de pestaña; cualquier otro camino entra como siempre.
  const [dir, setDir] = useState(null)
  // «Empezar entreno» pulsado en el widget: Días hace lo mismo que su botón en
  // cuanto sabe si hoy ya hay entreno.
  const [startOnArrival, setStartOnArrival] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  // Con qué semana se abre Plan. El aviso de la revisión la abre en la que
  // viene; entrar por la pestaña, en la que estás viviendo.
  const [planInicial, setPlanInicial] = useState('esta')
  // Is the backend awake? Only asked once per launch, and only ever seen on the
  // launch that has to wake it.
  const boot = useColdStart({ enabled: Boolean(token) })

  function openWorkout(id, seed = null) {
    if (id) setDir(null)
    setOpenWorkoutId(id)
    setOpenWorkoutSeed(seed)
  }

  // Entreno es un modo y se nota (lienzo «Movimiento → entrar en Entreno»): al
  // entrar, la barra de abajo se hunde; al salir con «‹», la pantalla se encoge
  // hacia su franja de Hoy (320 ms, acelera) y la barra vuelve a subir. Sin
  // motor de animaciones (jsdom) o con «reducir movimiento», todo es inmediato.
  const navRef = useRef(null)
  const mainRef = useRef(null)
  const [saliendoEntreno, setSaliendoEntreno] = useState(false)
  const [navSube, setNavSube] = useState(false)
  const animable = () =>
    typeof Element.prototype.animate === 'function' &&
    !(typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

  function salirDelEntreno() {
    if (!animable()) return openWorkout(null)
    if (saliendoEntreno) return undefined
    setSaliendoEntreno(true)
    setTimeout(() => {
      setSaliendoEntreno(false)
      openWorkout(null)
      setNavSube(true)
      setTimeout(() => setNavSube(false), 320)
    }, 320)
  }

  function setView(target) {
    setDir(null)
    setViewState(target)
  }

  // Cambiar de pestaña (lienzo «Movimiento → cambiar de pestaña»): la barra es
  // una fila, Hoy a la izquierda y Tú a la derecha, y la pantalla se mueve por
  // ella. Ir a la derecha empuja la vieja 32 px a la izquierda mientras se
  // funde (120 ms, acelera) y la nueva entra desde 32 px a la derecha (240 ms,
  // frena, en CSS); a la izquierda, al revés. La vieja ya no está en el árbol
  // cuando la nueva entra: sale una copia muda (salidaMuda.js).
  function cambiarDePestana(target) {
    const desde = ORDEN.indexOf(view)
    const hacia = ORDEN.indexOf(target)
    if (desde === hacia) return undefined
    if (openWorkoutId || desde < 0 || hacia < 0) return setView(target)
    const sentido = hacia > desde ? 'adelante' : 'atras'
    const vieja = mainRef.current?.firstElementChild
    if (vieja && animable()) salidaMuda(vieja, `translateX(${sentido === 'adelante' ? -32 : 32}px)`, 120)
    setDir(sentido)
    setViewState(target)
  }

  const habiaEntreno = useRef(openWorkoutId)
  useLayoutEffect(() => {
    const antes = habiaEntreno.current
    habiaEntreno.current = openWorkoutId
    const nav = navRef.current
    if (antes || !openWorkoutId || !nav || !animable()) return
    // La barra ya está oculta (`.is-workout`): se hunde una copia muda.
    const copia = nav.cloneNode(true)
    copia.setAttribute('aria-hidden', 'true')
    copia.inert = true
    copia.style.pointerEvents = 'none'
    document.body.appendChild(copia)
    const quitar = () => copia.remove()
    copia
      .animate([{ transform: 'none' }, { transform: 'translateY(calc(100% + 40px))' }], {
        duration: 320,
        easing: 'cubic-bezier(0.3, 0, 1, 1)',
        fill: 'forwards',
      })
      .finished.then(quitar, quitar)
    setTimeout(quitar, 380)
  }, [openWorkoutId])

  useEffect(() => {
    // A 401 from any API call drops us back to the login screen.
    setUnauthorizedHandler(() => setTokenState(null))
    setUpdateRequiredHandler(() => setUpdateRequired(true))
    return () => {
      setUnauthorizedHandler(null)
      setUpdateRequiredHandler(null)
    }
  }, [])

  // Los pasos del teléfono y la comida de hoy para el widget, al entrar y cada
  // vez que la app vuelve a primer plano. Fuera del APK no hacen nada.
  useEffect(() => {
    if (!token) return undefined
    syncSteps()
    syncFood()
    return onResume(() => {
      syncSteps()
      syncFood()
    })
  }, [token])

  // En el APK la cola de series la envía el nativo, también con la app cerrada,
  // y para eso necesita el token: al entrar, y en cada arranque con la sesión
  // ya iniciada (un token renovado, o el APK recién actualizado). Le entrega
  // también la cola que la página tuviera. En la web no hace nada.
  useEffect(() => {
    if (token) startNativeQueue(token)
  }, [token])

  // Abierta desde el widget o la notificación (docs/widgets-entreno.md, fase 3):
  // «abre este entreno», o «empieza el de hoy» con la regla de siempre, que es
  // la del botón de Días y no se repite aquí. Sólo con sesión: sin ella la orden
  // espera en el nativo a que entres. En la web no llega nunca.
  useEffect(() => {
    if (!token) return undefined
    return session.onLaunch(({ action, workoutId } = {}) => {
      if (action === 'open' && workoutId) {
        openWorkout(workoutId)
      } else if (action === 'start') {
        openWorkout(null)
        setView('days')
        setStartOnArrival(true)
      } else if (action === 'review') {
        // El aviso de la revisión semanal: la revisión es el primer paso de
        // planificar la semana que viene, y eso vive en Plan.
        openWorkout(null)
        setPlanInicial('viene')
        setView('plan')
      } else if (action === 'food') {
        // La pantalla Comida del widget. Si había un entreno abierto se
        // cierra, o taparía la vista.
        openWorkout(null)
        setView('food')
      }
    })
  }, [token])

  // Runs on mount too, which is the point: every relaunch restamps the open
  // workout, so a long session doesn't age out from under you.
  useEffect(() => {
    setOpenWorkout(openWorkoutId)
  }, [openWorkoutId])

  function handleAuthenticated(newToken) {
    setToken(newToken)
    setTokenState(newToken)
  }

  function handleLogout() {
    clearToken()
    stopNativeQueue()
    setTokenState(null)
    openWorkout(null)
    setView('food')
  }

  // «Entrenar» desde Hoy: lo mismo que «Empezar entreno» del widget.
  function train() {
    openWorkout(null)
    setView('days')
    setStartOnArrival(true)
  }

  // «Hacer el plan» desde Hoy sin plan: Semana, en la que viene, que es donde
  // se genera.
  function planificar() {
    openWorkout(null)
    setPlanInicial('viene')
    setView('plan')
  }

  function go(target) {
    openWorkout(null)
    if (target === 'plan') setPlanInicial('esta')
    cambiarDePestana(target)
  }

  // Estados (Marcador): la única pantalla entera en mandarina. Una versión que
  // el servidor ya no acepta no puede hacer nada útil, así que no se finge.
  if (updateRequired) {
    return (
      <div className="container update-required" role="alert">
        <p className="update-required-sello">Versión {CLIENT_VERSION}</p>
        <h1 className="update-required-titulo">Esta versión ya no habla con el servidor</h1>
        <p className="update-required-texto">Tus datos están a salvo. Instala la nueva y sigue donde lo dejaste.</p>
        <a className="update-required-boton" href={UPDATE_URL} target="_blank" rel="noreferrer">
          Actualizar
        </a>
      </div>
    )
  }

  if (!token) {
    return showRegister ? (
      <Register
        onAuthenticated={handleAuthenticated}
        onSwitchToLogin={() => setShowRegister(false)}
      />
    ) : (
      <Login
        onAuthenticated={handleAuthenticated}
        onSwitchToRegister={() => setShowRegister(true)}
      />
    )
  }

  // The launch gate. `probing` is the first 800 ms — nothing is drawn, because a
  // screen that flashes for the length of a normal request is worse than none.
  // Past that the wait is real and gets said out loud; `local` and `ready` both
  // hand over to the app, one with a backend behind it and one without.
  if (boot.phase === 'probing') {
    return <div className="container cold-blank" aria-hidden="true" />
  }
  if (boot.phase === 'waiting' || boot.phase === 'failed') {
    return (
      <ColdStart
        phase={boot.phase}
        attempt={boot.attempt}
        onRetry={boot.retry}
        onLocal={boot.goLocal}
      />
    )
  }

  // Días is active whenever we're in the days list or inside a workout opened
  // from it; Progreso only on its own screen.
  const daysActive = view === 'days'
  const progressActive = view === 'progress' && !openWorkoutId
  const foodActive = view === 'food' && !openWorkoutId
  const planActive = view === 'plan' && !openWorkoutId
  const profileActive = view === 'profile' && !openWorkoutId

  // El orden del lienzo Marcador: lo de hoy, la semana, lo hecho, cómo vas y tú.
  const tabs = [
    { key: 'food', label: 'Hoy', active: foodActive, icon: <IconoHoy /> },
    { key: 'plan', label: 'Semana', active: planActive, icon: <IconoSemana /> },
    { key: 'days', label: 'Historial', active: daysActive, icon: <IconoHistorial /> },
    { key: 'progress', label: 'Progreso', active: progressActive, icon: <IconoProgreso /> },
    { key: 'profile', label: 'Tú', active: profileActive, icon: <IconoTu /> },
  ]

  return (
    // Con un entreno abierto, Entreno ocupa la pantalla: sin marca ni barra.
    <div
      className={`container${openWorkoutId ? ' is-workout' : ''}${saliendoEntreno ? ' is-saliendo-entreno' : ''}`}
    >
      <header className="app-header">
        <Wordmark />
      </header>
      <main ref={mainRef} className="app-main" data-dir={dir ?? undefined}>
        {openWorkoutId ? (
          <Workout
            workoutId={openWorkoutId}
            initialWorkout={openWorkoutSeed}
            onExit={salirDelEntreno}
          />
        ) : view === 'progress' ? (
          <Progress initialTab="evolucion" />
        ) : view === 'food' ? (
          <Comida onTrain={train} onPlan={planificar} />
        ) : view === 'plan' ? (
          <PlanPantalla key={planInicial} inicial={planInicial} />
        ) : view === 'profile' ? (
          // Lo que se fija una vez: objetivo, reparto, reglas, peso y las
          // preferencias de Entreno. «Salir» vive al final, no en la cabecera.
          <Perfil onLogout={handleLogout} />
        ) : (
          <Days
            onOpenWorkout={openWorkout}
            startOnArrival={startOnArrival}
            onStarted={() => setStartOnArrival(false)}
          />
        )}
      </main>
      {/* Barra flotante, al alcance del pulgar: la pestaña activa es una píldora
          mandarina con su nombre; las demás, sólo el icono. */}
      <nav ref={navRef} className={`bottom-nav${navSube ? ' is-sube' : ''}`} aria-label="Navegación principal">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`tab${tab.active ? ' is-active' : ''}`}
            aria-current={tab.active ? 'page' : undefined}
            onClick={() => go(tab.key)}
          >
            <span className="tab-ind" aria-hidden="true">
              {tab.icon}
            </span>
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}

// Iconos de trazo para la barra de pestañas. Inline y en `currentColor`: toman
// la tinta de la pestaña, apagada o activa, sin una hoja de iconos aparte.
function Trazo({ children }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

function IconoHoy() {
  return (
    <Trazo>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
    </Trazo>
  )
}

function IconoSemana() {
  return (
    <Trazo>
      <rect x="3.5" y="5" width="17" height="15" rx="3" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </Trazo>
  )
}

function IconoHistorial() {
  return (
    <Trazo>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.5-6M3.5 4v4h4M12 8v4.5l3 2" />
    </Trazo>
  )
}

function IconoProgreso() {
  return (
    <Trazo>
      <path d="M3.5 17 9 11.5l4 4L20.5 8M15 8h5.5v5.5" />
    </Trazo>
  )
}

function IconoTu() {
  return (
    <Trazo>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M4.5 20c1.2-3.6 4-5.2 7.5-5.2s6.3 1.6 7.5 5.2" />
    </Trazo>
  )
}

import { useEffect, useState } from 'react'

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
import { clearToken, getToken, setToken, setUnauthorizedHandler } from './auth.js'
import { useColdStart } from './coldstart.js'
import { startNativeQueue, stopNativeQueue } from './offline.js'
import { session } from './platform/session.js'
import { getOpenWorkout, setOpenWorkout } from './prefs.js'
import { onResume } from './platform/lifecycle.js'
import { syncSteps } from './steps.js'
import { syncFood } from './widgetSummary.js'

export default function App() {
  const [token, setTokenState] = useState(getToken())
  // Resume where you were: mid-workout, the app reopens inside the workout.
  const [openWorkoutId, setOpenWorkoutId] = useState(getOpenWorkout)
  // The workout Días already had, handed over so Entreno draws immediately.
  // Deliberately not persisted — a resume goes through the fetch, because a
  // seed from a previous launch would be an unknown number of sets out of date.
  const [openWorkoutSeed, setOpenWorkoutSeed] = useState(null)
  // Se abre en Hoy, la primera pestaña: lo de hoy, comer y entrenar.
  const [view, setView] = useState('food')
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
    setOpenWorkoutId(id)
    setOpenWorkoutSeed(seed)
  }

  useEffect(() => {
    // A 401 from any API call drops us back to the login screen.
    setUnauthorizedHandler(() => setTokenState(null))
    return () => setUnauthorizedHandler(null)
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

  function go(target) {
    openWorkout(null)
    if (target === 'plan') setPlanInicial('esta')
    setView(target)
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
    <div className={`container${openWorkoutId ? ' is-workout' : ''}`}>
      <header className="app-header">
        <Wordmark />
      </header>
      <main className="app-main">
        {openWorkoutId ? (
          <Workout
            workoutId={openWorkoutId}
            initialWorkout={openWorkoutSeed}
            onExit={() => openWorkout(null)}
          />
        ) : view === 'progress' ? (
          <Progress initialTab="evolucion" />
        ) : view === 'food' ? (
          <Comida onTrain={train} />
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
      <nav className="bottom-nav" aria-label="Navegación principal">
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

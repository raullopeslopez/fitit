import { useEffect, useState } from 'react'

import ColdStart from './ColdStart.jsx'
import Comida from './Comida.jsx'
import Perfil from './Perfil.jsx'
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

export default function App() {
  const [token, setTokenState] = useState(getToken())
  // Resume where you were: mid-workout, the app reopens inside the workout.
  const [openWorkoutId, setOpenWorkoutId] = useState(getOpenWorkout)
  // The workout Días already had, handed over so Entreno draws immediately.
  // Deliberately not persisted — a resume goes through the fetch, because a
  // seed from a previous launch would be an unknown number of sets out of date.
  const [openWorkoutSeed, setOpenWorkoutSeed] = useState(null)
  // Whether the workout being opened was just created with no name, so Entreno
  // can offer naming it immediately instead of after a trip to the rename tap.
  const [openWorkoutAutoRename, setOpenWorkoutAutoRename] = useState(false)
  const [view, setView] = useState('days')
  // «Empezar entreno» pulsado en el widget: Días hace lo mismo que su botón en
  // cuanto sabe si hoy ya hay entreno.
  const [startOnArrival, setStartOnArrival] = useState(false)
  const [showRegister, setShowRegister] = useState(false)
  // Is the backend awake? Only asked once per launch, and only ever seen on the
  // launch that has to wake it.
  const boot = useColdStart({ enabled: Boolean(token) })

  function openWorkout(id, seed = null, autoRename = false) {
    setOpenWorkoutId(id)
    setOpenWorkoutSeed(seed)
    setOpenWorkoutAutoRename(autoRename)
  }

  useEffect(() => {
    // A 401 from any API call drops us back to the login screen.
    setUnauthorizedHandler(() => setTokenState(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  // Los pasos del teléfono, al entrar y cada vez que la app vuelve a primer
  // plano. Fuera del APK `syncSteps` no hace nada.
  useEffect(() => {
    if (!token) return undefined
    syncSteps()
    return onResume(() => syncSteps())
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
        // El aviso de la revisión semanal: la tarjeta está en Comida. Si había
        // un entreno abierto se cierra, o taparía la vista.
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
    setView('days')
  }

  function go(target) {
    openWorkout(null)
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
  const profileActive = view === 'profile' && !openWorkoutId

  return (
    <div className="container">
      <header className="app-header">
        <Wordmark />
      </header>
      <main className="app-main">
        {openWorkoutId ? (
          <Workout
            workoutId={openWorkoutId}
            initialWorkout={openWorkoutSeed}
            autoRename={openWorkoutAutoRename}
            onExit={() => openWorkout(null)}
          />
        ) : view === 'progress' ? (
          <Progress />
        ) : view === 'food' ? (
          <Comida />
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
      {/* Bottom bar puts navigation in thumb reach for one-handed gym use. */}
      <nav className="bottom-nav" aria-label="Navegación principal">
        <button
          type="button"
          className={`tab${daysActive ? ' is-active' : ''}`}
          aria-current={daysActive ? 'page' : undefined}
          onClick={() => go('days')}
        >
          <span className="tab-icon" aria-hidden="true">▮▮</span>
          Días
        </button>
        <button
          type="button"
          className={`tab${progressActive ? ' is-active' : ''}`}
          aria-current={progressActive ? 'page' : undefined}
          onClick={() => go('progress')}
        >
          <span className="tab-icon" aria-hidden="true">↗</span>
          Progreso
        </button>
        <button
          type="button"
          className={`tab${foodActive ? ' is-active' : ''}`}
          aria-current={foodActive ? 'page' : undefined}
          onClick={() => go('food')}
        >
          <span className="tab-icon" aria-hidden="true">◒</span>
          Comida
        </button>
        <button
          type="button"
          className={`tab${profileActive ? ' is-active' : ''}`}
          aria-current={profileActive ? 'page' : undefined}
          onClick={() => go('profile')}
        >
          <span className="tab-icon" aria-hidden="true">◍</span>
          Perfil
        </button>
      </nav>
    </div>
  )
}

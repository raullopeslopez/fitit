import { useEffect, useState } from 'react'

import Days from './Days.jsx'
import Login from './Login.jsx'
import Progress from './Progress.jsx'
import Register from './Register.jsx'
import Workout from './Workout.jsx'
import { clearToken, getToken, setToken, setUnauthorizedHandler } from './auth.js'
import { getOpenWorkout, setOpenWorkout } from './prefs.js'

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
  const [showRegister, setShowRegister] = useState(false)

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

  // Días is active whenever we're in the days list or inside a workout opened
  // from it; Progreso only on its own screen.
  const daysActive = view === 'days'
  const progressActive = view === 'progress' && !openWorkoutId

  return (
    <div className="container">
      <header className="app-header">
        <h1 className="wordmark">
          <img src="/mark.png" alt="" className="wordmark-icon" />
          <span className="wordmark-text">
            fit<span className="wordmark-swap">I</span>t
          </span>
        </h1>
        {/* Salir is a rare action. Framed, it was the second-loudest thing on
            the screen you open mid-set; it reads as a quiet text link now. */}
        <button type="button" className="link-btn" onClick={handleLogout}>
          Salir
        </button>
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
        ) : (
          <Days onOpenWorkout={openWorkout} />
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
      </nav>
    </div>
  )
}

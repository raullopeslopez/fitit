import { useEffect, useState } from 'react'

import Days from './Days.jsx'
import Login from './Login.jsx'
import Progress from './Progress.jsx'
import Workout from './Workout.jsx'
import { clearToken, getToken, setToken, setUnauthorizedHandler } from './auth.js'

export default function App() {
  const [token, setTokenState] = useState(getToken())
  const [openWorkoutId, setOpenWorkoutId] = useState(null)
  const [view, setView] = useState('days')

  useEffect(() => {
    // A 401 from any API call drops us back to the login screen.
    setUnauthorizedHandler(() => setTokenState(null))
    return () => setUnauthorizedHandler(null)
  }, [])

  function handleAuthenticated(newToken) {
    setToken(newToken)
    setTokenState(newToken)
  }

  function handleLogout() {
    clearToken()
    setTokenState(null)
    setOpenWorkoutId(null)
    setView('days')
  }

  function go(target) {
    setOpenWorkoutId(null)
    setView(target)
  }

  if (!token) {
    return <Login onAuthenticated={handleAuthenticated} />
  }

  return (
    <div className="container">
      <header className="app-header">
        <h1>Fitit</h1>
        <nav className="app-nav">
          <button
            className={view === 'days' && !openWorkoutId ? '' : 'secondary'}
            onClick={() => go('days')}
          >
            Días
          </button>
          <button
            className={view === 'progress' && !openWorkoutId ? '' : 'secondary'}
            onClick={() => go('progress')}
          >
            Progreso
          </button>
          <button className="secondary" onClick={handleLogout}>
            Salir
          </button>
        </nav>
      </header>
      {openWorkoutId ? (
        <Workout workoutId={openWorkoutId} onExit={() => setOpenWorkoutId(null)} />
      ) : view === 'progress' ? (
        <Progress />
      ) : (
        <Days onOpenWorkout={setOpenWorkoutId} />
      )}
    </div>
  )
}

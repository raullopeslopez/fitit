import { useEffect, useState } from 'react'

import History from './History.jsx'
import Login from './Login.jsx'
import Workout from './Workout.jsx'
import { clearToken, getToken, setToken, setUnauthorizedHandler } from './auth.js'

export default function App() {
  const [token, setTokenState] = useState(getToken())
  const [view, setView] = useState('log')

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
            className={view === 'log' ? '' : 'secondary'}
            onClick={() => setView('log')}
          >
            Log
          </button>
          <button
            className={view === 'history' ? '' : 'secondary'}
            onClick={() => setView('history')}
          >
            History
          </button>
          <button className="secondary" onClick={handleLogout}>
            Log out
          </button>
        </nav>
      </header>
      {view === 'log' ? <Workout /> : <History />}
    </div>
  )
}

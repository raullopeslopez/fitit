import { useEffect, useState } from 'react'

import Login from './Login.jsx'
import Workout from './Workout.jsx'
import { clearToken, getToken, setToken, setUnauthorizedHandler } from './auth.js'

export default function App() {
  const [token, setTokenState] = useState(getToken())

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
        <button className="secondary" onClick={handleLogout}>
          Log out
        </button>
      </header>
      <Workout />
    </div>
  )
}

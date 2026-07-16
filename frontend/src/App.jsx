import { useEffect, useState } from 'react'

import Login from './Login.jsx'
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
    <main
      style={{
        fontFamily: 'system-ui, sans-serif',
        maxWidth: 600,
        margin: '4rem auto',
        padding: '0 1rem',
        lineHeight: 1.5,
      }}
    >
      <h1>Fitit</h1>
      <p>You're logged in. The workout screen is coming next.</p>
      <button onClick={handleLogout}>Log out</button>
    </main>
  )
}

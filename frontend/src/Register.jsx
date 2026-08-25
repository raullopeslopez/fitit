import { useState } from 'react'

import { register } from './api.js'
import GoogleSignIn from './GoogleSignIn.jsx'
import Wordmark from './Wordmark.jsx'

export default function Register({ onAuthenticated, onSwitchToLogin }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const token = await register(username, password)
      onAuthenticated(token)
    } catch (err) {
      setError(
        err.status === 409
          ? 'Ese usuario ya existe.'
          : 'No se pudo crear la cuenta. La contraseña debe tener al menos 8 caracteres, sin pasarse de larga.'
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <Wordmark />
        {/* Same button as on the login screen, and deliberately so: with
            Google there is no difference between creating an account and
            opening one, so making the user pick the right screen first would
            be a step invented by this app. */}
        <GoogleSignIn onAuthenticated={onAuthenticated} />
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="username">Usuario</label>
            <input
              id="username"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          <button type="submit" className="primary btn-full" disabled={busy}>
            {busy ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>
        <button type="button" className="link-btn" onClick={onSwitchToLogin}>
          Ya tengo cuenta
        </button>
      </div>
    </div>
  )
}

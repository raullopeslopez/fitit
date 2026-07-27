import { useState } from 'react'

import { login } from './api.js'

export default function Login({ onAuthenticated, onSwitchToRegister }) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const token = await login(username, password)
      onAuthenticated(token)
    } catch {
      setError('Usuario o contraseña incorrectos.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <div className="card login-card">
        <h1 className="wordmark">
          <img src="/mark.png" alt="" className="wordmark-icon" />
          <span className="wordmark-text">
            fit<span className="wordmark-swap">I</span>t
          </span>
        </h1>
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
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && (
            <p role="alert" className="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn-full" disabled={busy}>
            {busy ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
        <button type="button" className="link-btn" onClick={onSwitchToRegister}>
          Crear cuenta
        </button>
      </div>
    </div>
  )
}

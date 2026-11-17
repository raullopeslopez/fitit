import { useEffect, useRef, useState } from 'react'

import { googleLogin } from './api.js'
import { showGoogleSignIn } from './platform/googleIdentity.js'

/**
 * The "Continuar con Google" button, plus the One Tap card Google shows by
 * itself to anyone already signed in on the device.
 *
 * Renders nothing when `VITE_GOOGLE_CLIENT_ID` is unset. That is the honest
 * state of a build that cannot talk to Google — a dev server, a preview, a
 * deploy where the variable was forgotten — and it is better than a button
 * that looks alive and fails on the tap.
 */
export default function GoogleSignIn({ onAuthenticated }) {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
  const slot = useRef(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!clientId) return undefined
    let live = true

    const hide = showGoogleSignIn({
      clientId,
      slot: () => slot.current,
      isLive: () => live,
      onCredential: async (credential) => {
        setError('')
        try {
          // `null` es el selector nativo diciendo que no pudo: mismo aviso.
          if (!credential) throw new Error('no credential')
          onAuthenticated(await googleLogin(credential))
        } catch (err) {
          // 403: el servidor no abre cuentas nuevas a este email (producción,
          // ALLOWED_EMAILS). Reintentar no lo arregla, y decirlo es lo honesto.
          setError(
            err?.status === 403
              ? 'Esta cuenta de Google no tiene acceso a Fitit.'
              : 'No se pudo entrar con Google. Inténtalo otra vez.',
          )
        }
      },
    })

    return () => {
      live = false
      hide()
    }
  }, [clientId, onAuthenticated])

  if (!clientId) return null

  return (
    <div className="google-signin">
      <div ref={slot} className="google-signin-slot" />
      {error && (
        <p role="alert" className="alert">
          {error}
        </p>
      )}
      <div className="google-signin-or">
        <span>o</span>
      </div>
    </div>
  )
}

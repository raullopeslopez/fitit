import { useEffect, useRef, useState } from 'react'

import { googleLogin } from './api.js'
import { describeFailure, showGoogleSignIn } from './platform/googleIdentity.js'

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
  const [detail, setDetail] = useState(null)

  useEffect(() => {
    if (!clientId) return undefined
    let live = true

    const hide = showGoogleSignIn({
      clientId,
      slot: () => slot.current,
      isLive: () => live,
      onCredential: async (credential, reason) => {
        setError('')
        setDetail(null)
        try {
          // `null` es el selector nativo diciendo que no pudo: mismo aviso.
          if (!credential) throw new Error(reason || 'no credential')
          onAuthenticated(await googleLogin(credential))
        } catch (failure) {
          setError('No se pudo entrar con Google. Inténtalo otra vez.')
          setDetail(describeFailure(failure))
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
      {error && detail && <p className="hint google-signin-detail">Detalle: {detail}</p>}
      <div className="google-signin-or">
        <span>o</span>
      </div>
    </div>
  )
}

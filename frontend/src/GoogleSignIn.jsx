import { useEffect, useRef, useState } from 'react'

import { googleLogin } from './api.js'

const GIS_SRC = 'https://accounts.google.com/gsi/client'

// Module-level so a screen that mounts twice (login → registro → login) asks
// for the script once and reuses the same load.
let gisLoading = null

function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (gisLoading) return gisLoading
  gisLoading = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.onload = resolve
    // A blocked or offline script must not leave the promise hanging: the
    // password form below is still a way in, and a spinner that never resolves
    // would be the only thing on screen saying otherwise.
    script.onerror = () => {
      gisLoading = null
      reject(new Error('google identity services failed to load'))
    }
    document.head.appendChild(script)
  })
  return gisLoading
}

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

    loadGis()
      .then(() => {
        if (!live || !slot.current) return
        const id = window.google.accounts.id
        id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            setError('')
            try {
              onAuthenticated(await googleLogin(credential))
            } catch {
              setError('No se pudo entrar con Google. Inténtalo otra vez.')
            }
          },
        })
        id.renderButton(slot.current, {
          theme: 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          locale: 'es',
          // Google sizes to content unless told otherwise, which leaves this
          // narrower than the Entrar button right under it.
          width: slot.current.offsetWidth || 320,
        })
        // The card that appears unprompted for anyone with a live Google
        // session — the whole "no tap at all" case.
        id.prompt()
      })
      .catch(() => {
        // Deliberately silent. Nothing was promised on screen yet, and the
        // password form is intact; an alert here would be an error about a
        // feature the user never asked for.
      })

    return () => {
      live = false
      window.google?.accounts?.id?.cancel()
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

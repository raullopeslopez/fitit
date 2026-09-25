// Entrar con Google en el navegador: Google Identity Services.
//
// Todo lo que sabe de `window.google` vive aquí. Dentro del APK Google no deja
// usar este login —bloquea su página dentro de un WebView—, así que la versión
// nativa será otra implementación de `showGoogleSignIn` con el selector de
// cuenta del sistema (`@capgo/capacitor-social-login`). Lo que devuelve es lo
// mismo en los dos casos: un ID token que el backend canjea en `/auth/google`.

import { SocialLogin } from '@capgo/capacitor-social-login'

import { isNative } from './native.js'

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
 * Pinta el botón de Google en `slot` y lanza el One Tap. `onCredential` recibe
 * el ID token cuando alguien elige cuenta. Devuelve la función que lo retira.
 *
 * `isLive` lo consulta al terminar de cargar el script: si la pantalla ya se
 * fue, no pinta nada.
 */
export function showGoogleSignIn({ clientId, slot, isLive, onCredential }) {
  if (isNative()) return showNativeButton({ clientId, slot, onCredential })

  loadGis()
    .then(() => {
      if (!isLive() || !slot()) return
      const id = window.google.accounts.id
      id.initialize({
        client_id: clientId,
        callback: ({ credential }) => onCredential(credential),
      })
      id.renderButton(slot(), {
        theme: 'outline',
        size: 'large',
        text: 'continue_with',
        shape: 'rectangular',
        locale: 'es',
        // Google sizes to content unless told otherwise, which leaves this
        // narrower than the Entrar button right under it.
        width: slot().offsetWidth || 320,
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

  return () => window.google?.accounts?.id?.cancel()
}

// En el APK: nuestro propio botón, y al tocarlo el selector de cuentas de
// Android. `webClientId` es el mismo ID de cliente **web** que usa la PWA, así
// que el ID token que devuelve lleva la audiencia que el backend ya comprueba
// y `/auth/google` no distingue de dónde vino.
//
// El selector exige además un cliente OAuth de tipo Android en Google Cloud con
// el paquete y la huella SHA-1 del certificado del APK (docs/app-nativa.md).
// Sin él, el login falla con un error y la contraseña sigue siendo la entrada.
let nativeReady = null

function showNativeButton({ clientId, slot, onCredential }) {
  const host = slot()
  if (!host) return () => {}

  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'secondary btn-full google-native'
  button.textContent = 'Continuar con Google'
  button.addEventListener('click', async () => {
    try {
      nativeReady ??= SocialLogin.initialize({ google: { webClientId: clientId } })
      await nativeReady
      const { result } = await SocialLogin.login({ provider: 'google', options: {} })
      if (result?.idToken) onCredential(result.idToken)
    } catch (error) {
      nativeReady = null
      // Cerrar el selector no es un error que haya que contar.
      if (error?.code === 'USER_CANCELLED') return
      onCredential(null, error?.message ?? String(error))
    }
  })
  host.replaceChildren(button)

  return () => button.remove()
}

// Qué contar debajo del aviso cuando el login falla. Sólo en el APK: ahí un
// fallo puede venir de la huella, del proyecto de Google Cloud o de que el
// cliente Android aún no se ha propagado, y sin el motivo no hay forma de
// saber cuál desde el teléfono. En la web el aviso sigue siendo el de siempre.
export function describeFailure(error) {
  if (!isNative()) return null
  if (error?.status) return `el servidor rechazó la cuenta (${error.status})`
  return error?.message || null
}

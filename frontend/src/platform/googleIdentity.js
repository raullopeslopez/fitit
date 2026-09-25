// Entrar con Google en el navegador: Google Identity Services.
//
// Todo lo que sabe de `window.google` vive aquí. Dentro del APK Google no deja
// usar este login —bloquea su página dentro de un WebView—, así que la versión
// nativa será otra implementación de `showGoogleSignIn` con el selector de
// cuenta del sistema (`@capgo/capacitor-social-login`). Lo que devuelve es lo
// mismo en los dos casos: un ID token que el backend canjea en `/auth/google`.

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

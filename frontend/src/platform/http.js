import { version } from '../../package.json'

// A qué servidor habla la app, y quién le dice que es.
//
// En el navegador la página y la API comparten origen —Render las sirve juntas,
// y en desarrollo Vite proxea `/api`—, así que la base es vacía y las rutas
// quedan relativas, como siempre. Dentro del APK la página sale del propio
// teléfono y la API no: ahí `VITE_API_BASE` lleva el origen del backend
// (`https://fitit-n4q0.onrender.com`) y el servidor tiene que aceptarlo por CORS.
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

export function apiUrl(path) {
  return `${API_BASE}/api${path}`
}

// La versión de este build, en cada petición. Una web se actualiza sola al
// recargar; una app instalada puede quedarse semanas atrás, y es la única forma
// de que el servidor sepa que tiene delante un cliente que ya no entiende y le
// pida actualizar en vez de fallar a medias.
export const CLIENT_VERSION = version

export function clientHeaders() {
  return { 'X-Client-Version': CLIENT_VERSION }
}

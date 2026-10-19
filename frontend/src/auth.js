import { storage } from './platform/storage.js'

const TOKEN_KEY = 'fitit_token'

let unauthorizedHandler = null

export function getToken() {
  return storage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  storage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  storage.removeItem(TOKEN_KEY)
}

// Let the app react when a request comes back 401 (e.g. token expired) by
// dropping back to the login screen.
export function setUnauthorizedHandler(handler) {
  unauthorizedHandler = handler
}

export function notifyUnauthorized() {
  if (unauthorizedHandler) {
    unauthorizedHandler()
  }
}

// Una versión que el servidor ya no acepta (426). La app pasa a la pantalla
// de actualizar en cuanto lo sabe.
let updateHandler = null

export function setUpdateRequiredHandler(handler) {
  updateHandler = handler
}

export function notifyUpdateRequired() {
  if (updateHandler) updateHandler()
}

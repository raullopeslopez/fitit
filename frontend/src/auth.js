const TOKEN_KEY = 'fitit_token'

let unauthorizedHandler = null

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
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

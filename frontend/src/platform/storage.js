// Dónde guarda la app lo que tiene que sobrevivir a cerrarla: el token, las
// preferencias, la cola de series sin enviar.
//
// En el navegador es `localStorage`, y la forma de este módulo es la suya
// —`getItem`, `setItem`, `removeItem`, síncronos y con cadenas— para que
// cambiar de sitio no cambie ninguna llamada. En Android el token irá a un
// almacén cifrado y el resto a `Preferences`, que iOS y Android no vacían
// cuando les falta espacio; eso será otra implementación de este archivo.
//
// Se lee `localStorage` en cada llamada y no una vez al cargar: los tests lo
// limpian y lo rellenan entre casos, y una referencia guardada apuntaría al de
// antes.

export const storage = {
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => localStorage.setItem(key, value),
  removeItem: (key) => localStorage.removeItem(key),
}

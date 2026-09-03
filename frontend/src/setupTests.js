import '@testing-library/jest-dom'

// jsdom no implementa `PointerEvent` (https://github.com/jsdom/jsdom/issues/2527):
// sin este relleno, `fireEvent.pointerDown/Move/Up` de Testing Library caen a
// un `Event` genérico sin `clientX`, y un gesto que dependa de la posición del
// dedo —deslizar una fila para borrarla, en Comida— no se puede probar.
// `MouseEvent` ya trae todo lo que hace falta (clientX/Y); sólo le faltan el
// nombre y `pointerId`/`pointerType`.
if (typeof window.PointerEvent === 'undefined') {
  class PointerEvent extends MouseEvent {
    constructor(type, params = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 1
      this.pointerType = params.pointerType ?? 'touch'
      this.isPrimary = params.isPrimary ?? true
    }
  }
  window.PointerEvent = PointerEvent
}

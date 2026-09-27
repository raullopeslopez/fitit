import { Component } from 'react'

/**
 * La red que impide que un fallo se convierta en una pantalla negra.
 *
 * ── Por qué hacía falta ────────────────────────────────────────────────────
 *
 * React desmonta el árbol entero cuando una excepción sale de un render, de un
 * efecto o de un efecto de layout y nadie la recoge. Esta app no tenía ni una
 * sola barrera, así que lo que quedaba después de cualquier fallo era
 * `<div id="root">` vacío: sin mensaje, sin control y sin pista de qué había
 * pasado. Y como `body` lleva el fondo del tema, en oscuro eso no se lee como
 * «se ha roto» — se lee como que el teléfono se ha apagado. `--bg` en oscuro era
 * entonces `#0B0C0E` (hoy `#1A1918`, igual de oscuro).
 *
 * Medido en Chromium a 430×932, abriendo `Editar ejercicio` con una API de
 * geometría rota: `root.children.length` a 0, `body.innerText` a cero
 * caracteres y `background-color: rgb(11, 12, 14)`. La excepción estaba en la
 * consola del navegador, que es exactamente donde no la va a ver nadie a media
 * serie en un gimnasio.
 *
 * ── Qué se pone en su lugar ───────────────────────────────────────────────
 *
 * Tres cosas, y ninguna de adorno:
 *
 * 1. **Que se ha roto la app**, dicho en una línea. Es lo que distingue un
 *    fallo de un teléfono muerto, y es lo único que la pantalla negra no decía.
 * 2. **Que lo registrado sigue guardado.** Es la primera pregunta real —«¿he
 *    perdido la sesión?»— y la respuesta es que no: las series se mandan al
 *    servidor cuando se registran, no al salir. Una pantalla de fallo que no
 *    contesta eso obliga a recargar a ciegas para averiguarlo.
 * 3. **El mensaje del fallo**, impreso. En una app de una persona no hay
 *    telemetría ni un canal de incidencias: este texto es literalmente el único
 *    camino entre «se puso en negro» y saber qué arreglar. Va en la mono de la
 *    casa y apagado, porque es una pieza de evidencia, no una frase que leer.
 *
 * Y una salida, `Recargar`, que es la única que siempre funciona: el estado del
 * árbol que ha reventado no es de fiar, así que ofrecer un «reintentar» que sólo
 * vuelve a montar sería ofrecer la misma pantalla negra con otro nombre.
 *
 * ── Por qué es una clase ──────────────────────────────────────────────────
 * Es el único componente de la app que lo es. React no expone las barreras a
 * los hooks: `componentDidCatch` y `getDerivedStateFromError` no tienen
 * equivalente funcional, y las librerías que lo aparentan traen una clase
 * dentro. Una dependencia para envolver treinta líneas no se paga sola.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    this.props.onCatch?.(error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    const reload = this.props.onReload ?? (() => window.location.reload())

    return (
      // `role="alert"` y no un diálogo: no hay nada que decidir aquí y no hay
      // nada detrás a lo que volver. Un lector de pantalla tiene que enterarse
      // de que la pantalla ha cambiado entera bajo sus pies.
      <div className="container">
        <div className="alert app-crash" role="alert">
          <p className="app-crash-title">Algo se ha roto</p>
          <p className="app-crash-body">Lo que ya habías registrado está guardado.</p>
          {/* La evidencia. Se desborda en horizontal dentro de su propia caja
              en vez de estirar la página: un `stack` largo no puede empujar el
              único botón que hay fuera de la pantalla. */}
          <pre className="app-crash-detail">{String(error?.message || error)}</pre>
          <button type="button" className="secondary" onClick={reload}>
            Recargar
          </button>
        </div>
      </div>
    )
  }
}

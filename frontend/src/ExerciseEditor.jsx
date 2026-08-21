import { useEffect, useLayoutEffect, useRef } from 'react'

/**
 * Cuál de las dos cajas se usa, leído de la barra de direcciones.
 *
 * Esto es un banco de pruebas, no una preferencia: existe para poner la hoja y
 * la edición en sitio una al lado de la otra en el mismo navegador, sin volver
 * a compilar, y desaparecerá en cuanto una de las dos gane. Por eso vale un
 * parámetro de consulta y por eso está atado a `import.meta.env.DEV`, igual
 * que los bancos de `main.jsx`: en producción `?editor=inline` no hace nada.
 *
 * Un valor que no conocemos cae en la hoja en vez de romperse. Un interruptor
 * de desarrollo que deja la app en blanco por una errata en la URL cuesta más
 * de lo que ahorra.
 */
export function resolveEditorContainer(search) {
  if (!import.meta.env.DEV) return 'sheet'
  return new URLSearchParams(search).get('editor') === 'inline' ? 'inline' : 'sheet'
}

const DEFAULT_CONTAINER = resolveEditorContainer(
  typeof location === 'undefined' ? '' : location.search,
)

/**
 * El único sitio donde se edita un ejercicio, compartido por Entreno y Progreso.
 *
 * Había tres puertas a un solo concepto: `Editar ejercicio` dentro de la
 * tarjeta abierta en Entreno, `Corregir` al pie de la gráfica en Progreso y —
 * en la misma pantalla — tocar el título para renombrar. Tres puertas, tres
 * vocabularios y ninguna con el juego completo de cosas que se pueden decir de
 * un ejercicio. Este componente es la habitación a la que llevan todas ahora;
 * quien llama sólo es dueño del picaporte.
 *
 * ── Y aquí hay *dos* habitaciones, a propósito ──────────────────────────────
 *
 * `container` elige la caja, y hay dos porque no está decidido cuál es la
 * buena:
 *
 * - `sheet`: la hoja inferior fija que ya usa Días para retro-fechar. No le
 *   quita un píxel a la columna de contenido (`position: fixed`), pero se
 *   planta sobre el tercio inferior de la pantalla y apaga el resto al 55 %
 *   para cambiar una palabra, cuando aquí no hay nada destructivo que decidir.
 * - `inline`: el panel nace del propio botón, dentro de la tarjeta, colgado de
 *   un hueco `position: relative` de altura cero. Tampoco mueve la columna,
 *   pero no apaga nada y sólo cubre la tarjeta que has abierto — el registro
 *   que estás corrigiendo sigue siendo lo que tienes delante.
 *
 * Lo que **no** cambia entre las dos: la cabecera, el cuerpo, el foco, el
 * gesto de atrás y el teclado. Si sólo se compara la caja, sólo puede variar
 * la caja.
 *
 * El cuerpo sigue viniendo de fuera como `children` mientras las piezas
 * siguientes lo reconstruyen; es lo que mantiene la app entera entre una pieza
 * y la siguiente.
 */
export function ExerciseEditor({
  name,
  open,
  onClose,
  children,
  container = DEFAULT_CONTAINER,
}) {
  const panelRef = useRef(null)
  const slotRef = useRef(null)

  // `onClose` llega como una lambda nueva en cada render de quien llama, así
  // que un efecto que dependa de ella se desmonta y se vuelve a montar cada
  // vez que la pantalla se repinta. Para el listener de Escape eso sólo era
  // trabajo de más; para el del historial sería una entrada nueva por render,
  // y «atrás» dejaría de funcionar. La identidad se congela aquí.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // De dónde veniste, para poder devolverte ahí. Se captura en cuanto se abre
  // (el foco sigue en el botón que acaba de recibir el toque) y se restituye
  // al cerrar. Sin esto el foco cae en `body` y quien navega con teclado o con
  // lector vuelve al principio de la página cada vez que arregla una letra.
  //
  // Va declarado *antes* del efecto que enfoca el primer campo, porque los
  // efectos corren en orden: primero apuntar de dónde vienes, después moverte.
  const openerRef = useRef(null)
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement
      return
    }
    const opener = openerRef.current
    openerRef.current = null
    // `document.contains` porque el disparador puede haberse ido con el cambio
    // que acabas de guardar; enfocar un nodo huérfano no hace nada bueno.
    if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
      opener.focus()
    }
  }, [open])

  // Abrir *es* empezar a editar. El botón se llama «Editar ejercicio», así que
  // si al abrirse el cursor sigue en el botón, el toque no ha editado nada:
  // hace falta un segundo toque para meterse en el campo, y la puerta miente
  // sobre lo que hace. Aquí y no en las dos pantallas, porque es una promesa
  // del editor, no de quien lo abre.
  //
  // Al final del texto, no seleccionado entero: lo normal es arreglar una
  // errata en un nombre que quieres conservar («Press de banca»), no escribir
  // otro encima. Un select-all convierte la primera tecla en borrarlo todo.
  //
  // El primer campo de texto del panel, no un id concreto: hoy ese campo es
  // `Nombre` en las dos pantallas, y cuando las piezas siguientes rehagan el
  // cuerpo lo seguirá siendo — lo que se promete es «el primer campo», que es
  // lo que ve el pulgar. Si no hay ninguno, no se toca el foco: mejor que no
  // pase nada a que salte a un sitio que no esperabas.
  //
  // Sí, esto levanta el teclado en el móvil. Es el precio, y es el barato: el
  // teclado se baja con un gesto que no rompe nada, mientras que el cursor que
  // falta cuesta un toque *cada vez*. Lo que sí hay que pagar de verdad está
  // más abajo: que el teclado no entierre el botón que confirma la edición.
  useEffect(() => {
    if (!open) return
    const field = panelRef.current?.querySelector('input')
    if (!field) return
    // `setSelectionRange` sólo existe en los inputs de texto; en un `number` o
    // un `date` lanza. Enfocar sí, colocar el cursor sólo donde hay cursor.
    field.focus()
    const value = field.value ?? ''
    try {
      field.setSelectionRange(value.length, value.length)
    } catch {
      // Un campo sin selección (number, date): con el foco basta.
    }
  }, [open])

  // Escape cierra. Registrado sólo mientras está abierto, para que nada de la
  // página tenga que saber que este componente existe cuando no lo está.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // El gesto de atrás de Android. Sin esto, «atrás» con el editor abierto se
  // lleva por delante la sesión entera: sales del entreno —de la app, incluso—
  // para cerrar un cuadro de diálogo que se cierra con el aspa. Un editor
  // abierto es un estado, así que se marca en el historial como tal.
  //
  // La entrada hay que devolverla al cerrar por el aspa, el velo o Escape, o
  // se queda ahí de fantasma y el siguiente «atrás» no hace nada visible. La
  // bandera distingue los dos cierres: si vino de `popstate`, el navegador ya
  // la consumió y llamar a `back()` nos sacaría de la pantalla.
  useEffect(() => {
    if (!open) return undefined
    window.history.pushState({ fititEditor: true }, '')
    let poppedByUser = false
    const onPop = () => {
      poppedByUser = true
      onCloseRef.current()
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (!poppedByUser) window.history.back()
    }
  }, [open])

  // ── El teclado ────────────────────────────────────────────────────────────
  // En Android Chrome el reparto por defecto es `resizes-visual`: el teclado
  // se dibuja *encima* sin encoger el viewport de maquetación, así que un
  // elemento `fixed` anclado abajo se queda debajo del teclado. Medido, con la
  // hoja abierta `Guardar nombre` cae en y 723–762 y el selector de grupo en
  // 770–806 — dentro de la banda que se come un IME de ~330 px. El botón que
  // confirma la edición estaba literalmente detrás del teclado.
  //
  // El arreglo de raíz es `interactive-widget=resizes-content` en el `meta` de
  // `index.html`, y sirve para las dos cajas. Esto de aquí es el cinturón: en
  // los navegadores que ignoran esa directiva (iOS), `visualViewport` sí dice
  // cuánto tapa el teclado, y la hoja se sube esa cantidad.
  useEffect(() => {
    if (!open || container !== 'sheet') return undefined
    const vv = window.visualViewport
    if (!vv) return undefined
    const apply = () => {
      const hidden = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      panelRef.current?.parentElement?.style.setProperty(
        '--kb-inset',
        `${Math.round(hidden)}px`,
      )
    }
    apply()
    vv.addEventListener('resize', apply)
    vv.addEventListener('scroll', apply)
    return () => {
      vv.removeEventListener('resize', apply)
      vv.removeEventListener('scroll', apply)
    }
  }, [open, container])

  // ── Que el panel en sitio quepa, y que quepa sin mover nada ───────────────
  // El panel es `position: absolute` dentro de un hueco de altura cero, así
  // que no le quita ni un píxel a la columna: lo que había debajo del botón
  // sigue exactamente donde estaba, sólo que tapado mientras editas. Ésa es la
  // promesa entera de esta caja, y sólo vale si se cumple siempre.
  //
  // El primer intento se hacía sitio por abajo —alargaba el documento y
  // desplazaba la página hasta que la cola del panel entraba en pantalla— y eso
  // es exactamente el defecto que la hoja vino a arreglar, sólo que más
  // pequeño: medido en Progreso, el documento pasaba de 1789 a 2064 px y la
  // página daba un salto de 119 px al abrir. La columna se movía. Así que no:
  // cuando el panel no cabe entre el botón y el borde útil, **sube el panel**,
  // no baja la página. Es la diferencia entre un desplegable y un empujón.
  //
  // Y el borde útil no es el borde de la pantalla. La barra de pestañas es
  // `fixed` a 875–932 con `z-index: 10` y este panel vive a 3, así que todo lo
  // que caiga de 875 para abajo está tapado aunque esté «en pantalla»: medido
  // en Entreno, el panel acababa en 896 y `Guardar nota` en 840–879, con la
  // cola por debajo de la barra. Es el mismo fallo que el teclado —el botón que
  // confirma, enterrado bajo algo fijo— y se arregla contando lo que tapa. El
  // viewport *visual* entra en la misma cuenta, que es lo que hace que esto
  // sirva también cuando el teclado sube.
  //
  // Lo que sobre después de subir se desplaza dentro del propio panel
  // (`max-height` + `overflow-y: auto` en la hoja de estilos), porque subir sin
  // tope acabaría sacando la cabecera por arriba.
  useLayoutEffect(() => {
    if (!open || container !== 'inline') return undefined
    const slot = slotRef.current
    const panel = panelRef.current
    if (!slot || !panel) return undefined

    // Ocho píxeles de aire por arriba: lo bastante para que el canto del panel
    // no se coma el borde de la pantalla, y lo bastante poco para no regalar
    // sitio cuando el panel es alto.
    const TOP_GAP = 8

    const fit = () => {
      // Se mide con el panel en su sitio natural y sin tope de altura, porque
      // las dos cosas que aplicamos —`top` y `max-height`— cambian justo lo que
      // hay que medir. `offsetHeight` y no el rectángulo: el rectángulo trae la
      // animación de entrada (`translateY(-8px)`) dentro, y medir a media
      // animación deja el cálculo 8 px corto.
      panel.style.top = '0px'
      panel.style.maxHeight = 'none'
      const slotTop = slot.getBoundingClientRect().top
      const height = panel.offsetHeight

      const vv = window.visualViewport
      const viewportBottom = vv ? vv.offsetTop + vv.height : window.innerHeight
      // Cualquier barra fija de abajo, no una clase concreta: hoy es
      // `.bottom-nav` y mañana puede ser otra cosa, y lo que importa no es cómo
      // se llame sino que esté delante y tape.
      const bars = document.querySelectorAll('.bottom-nav, .days-cta')
      let usableBottom = viewportBottom
      for (const bar of bars) {
        const top = bar.getBoundingClientRect().top
        if (top > 0 && top < usableBottom) usableBottom = top
      }

      const room = usableBottom - slotTop
      const lift = Math.max(0, Math.min(Math.ceil(height - room), Math.floor(slotTop - TOP_GAP)))
      panel.style.top = `${-lift}px`
      panel.style.maxHeight = `${Math.max(0, Math.floor(usableBottom - (slotTop - lift)))}px`
    }

    fit()
    // El hueco no toma altura nunca. Se deja escrito en vez de darlo por
    // supuesto para que un cambio futuro tenga que borrar esta línea a mano.
    slot.style.height = '0px'

    const vv = window.visualViewport
    vv?.addEventListener('resize', fit)
    window.addEventListener('resize', fit)
    // Sólo el panel: su alto cambia solo cuando aparece un aviso de nombre
    // repetido o el deshacer del reetiquetado. `fit` no depende de lo que él
    // mismo aplica —mide con el tope quitado—, así que la segunda vuelta
    // calcula lo mismo y ahí se para.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    ro?.observe(panel)
    return () => {
      vv?.removeEventListener('resize', fit)
      window.removeEventListener('resize', fit)
      ro?.disconnect()
    }
  }, [open, container])

  if (!open) return null

  // La cabecera es el ejercicio, dicho una vez. El panel de propiedades de
  // Linear nunca imprime el nombre del campo al lado del valor, y la misma
  // lógica corre un nivel más arriba: esto va de este ejercicio, así que el
  // nombre es el título y nada de dentro lo repite.
  //
  // Idéntica en las dos cajas, y eso es deliberado: la comparación va de la
  // caja. Si además cambiase la cabecera, lo que se estaría comparando serían
  // dos cosas a la vez y el resultado no diría cuál de ellas ganó.
  const head = (
    <div className="editor-head">
      <h2 className="editor-name">{name}</h2>
      {/* Una salida explícita, al lado de la entrada. El velo también cierra
          —cuando hay velo—, pero un velo es un gesto que hay que saberse ya;
          esto es el que encuentra un pulgar. 44 px, como todo aquí. */}
      <button type="button" className="editor-close" aria-label="Cerrar" onClick={onClose}>
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )
  const body = children ?? (
    <p className="hint editor-placeholder">Aquí irán los ajustes del ejercicio.</p>
  )

  // ── En sitio ──────────────────────────────────────────────────────────────
  // Sin velo y sin `aria-modal`, porque no es modal: el resto de la pantalla
  // sigue viva y no hay nada que decidir que justifique apagarla. Sigue siendo
  // un `dialog` —el disparador anuncia `aria-haspopup="dialog"` y esa promesa
  // se cumple—, pero uno no modal.
  if (container === 'inline') {
    return (
      <div className="editor-inplace-slot" ref={slotRef}>
        <div
          ref={panelRef}
          className="editor-inplace"
          role="dialog"
          aria-label={`Editar ${name}`}
        >
          {head}
          {body}
        </div>
      </div>
    )
  }

  // ── La hoja ───────────────────────────────────────────────────────────────
  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        ref={panelRef}
        className="sheet exercise-editor"
        role="dialog"
        aria-modal="true"
        aria-label={`Editar ${name}`}
        onClick={(e) => e.stopPropagation()}
      >
        {head}
        {body}
      </div>
    </div>
  )
}

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

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
 * ── Una sola caja, y es ésta ────────────────────────────────────────────────
 *
 * Hubo dos: una hoja inferior con velo y este panel en sitio. La hoja está
 * retirada, y no por empate estético. Declaraba `aria-modal="true"` y no lo
 * respaldaba con nada —ni `inert`, ni `aria-hidden`, ni trampa de foco—, así
 * que tabulando desde dentro se llegaba a 29 de los 35 controles que había
 * detrás del velo: enfocables, invisibles y no pulsables. Una promesa de
 * modalidad incumplida es peor que no prometerla. Y apagar el 55 % de la
 * pantalla para arreglar una errata era, además, demasiada ceremonia.
 *
 * El panel nace del propio botón, dentro de la tarjeta, colgado de un hueco
 * `position: relative` de altura cero: no le quita un píxel a la columna de
 * contenido, no apaga nada, y lo único que tapa es el trozo de tarjeta que
 * ocupa. No es modal y no lo finge — pero lo que tapa sí sale del orden de
 * tabulación, que es la parte de la modalidad que aquí sí hay que cumplir.
 *
 * ── Por qué el panel es tan bajo, y por qué hay un segundo paso ─────────────
 *
 * Medido en Progreso a 430×932: el hueco cae en y765, la tarjeta acaba en y784
 * y la gráfica ocupa 502–647. Entre el pie de la gráfica y el pie de la tarjeta
 * hay **137 px**, y ése es todo el sitio que la tarjeta puede dar legalmente.
 * El panel medía **294** — 2,1 veces el presupuesto —, así que no había ninguna
 * posición que no destruyese algo: puesto abajo sobresalía 91 px y enterraba
 * `Exportar CSV` bajo una superficie opaca; subido para caber dentro de la
 * tarjeta tapaba el 100 % de la gráfica; tal como iba, el 46 %.
 *
 * La causa era el cuerpo, no la caja. El panel llevaba cuatro trabajos sin
 * relación en el sitio que abres para corregir una errata: el campo del nombre,
 * su botón, el selector de grupo y un `Eliminar ejercicio` en rojo. Dos cortes:
 *
 * 1. **El título es el campo.** El nombre se imprimía dos veces —de titular en
 *    un `h2` y otra vez dentro del `input` que lo edita, con un rótulo `Nombre`
 *    encima por si acaso—. Eso son 53 px de cabecera y 17 de rótulo gastados en
 *    repetir lo que el campo ya dice. Es la misma regla que el panel de
 *    propiedades de Linear: esto *es* este ejercicio, así que el nombre titula
 *    y no se repite dentro.
 * 2. **El grupo, la nota y el borrado pasan a un segundo paso**, detrás de
 *    `Más ajustes`. No desaparecen y no se esconden: la puerta lleva su nombre
 *    escrito, está a un toque, y lo que hay detrás es exactamente lo que
 *    DESIGN.md llama acciones raras —reetiquetar y borrar— que por regla de la
 *    casa no llevan controles con peso de contenido.
 *
 * Lo que **no** se movió: la fusión al chocar con un nombre existente y la
 * queja del renombrado se quedan pegadas al campo. No son un segundo paso, son
 * la respuesta a lo que acabas de intentar.
 */
export function ExerciseEditor({
  name,
  open,
  onClose,
  nameDraft,
  onNameDraftChange,
  onSubmitName,
  nameError,
  nameExtra,
  more,
}) {
  const panelRef = useRef(null)
  const slotRef = useRef(null)
  const [moreOpen, setMoreOpen] = useState(false)

  // `onClose` llega como una lambda nueva en cada render de quien llama, así
  // que un efecto que dependa de ella se desmonta y se vuelve a montar cada
  // vez que la pantalla se repinta. Para el listener de Escape eso sólo era
  // trabajo de más; para el del historial sería una entrada nueva por render,
  // y «atrás» dejaría de funcionar. La identidad se congela aquí.
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  })

  // Abrir es empezar de cero. Si el segundo panel se quedase abierto de la vez
  // pasada, el editor volvería a nacer con los 294 px que este cambio quita.
  useEffect(() => {
    if (open) setMoreOpen(false)
  }, [open])

  // De dónde veniste, para poder devolverte ahí. Se captura en cuanto se abre
  // (el foco sigue en el botón que acaba de recibir el toque) y se restituye
  // al cerrar. Sin esto el foco cae en `body` y quien navega con teclado o con
  // lector vuelve al principio de la página cada vez que arregla una letra.
  //
  // Va declarado *antes* del efecto que enfoca el nombre, porque los efectos
  // corren en orden: primero apuntar de dónde vienes, después moverte.
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
  // sobre lo que hace.
  //
  // Al final del texto, no seleccionado entero: lo normal es arreglar una
  // errata en un nombre que quieres conservar («Press de banca»), no escribir
  // otro encima. Un select-all convierte la primera tecla en borrarlo todo.
  //
  // Sí, esto levanta el teclado en el móvil. Es el precio, y es el barato: el
  // teclado se baja con un gesto que no rompe nada, mientras que el cursor que
  // falta cuesta un toque *cada vez*. Lo que sí hay que pagar de verdad es que
  // el teclado no entierre el botón que confirma, y de eso se ocupa `fit`.
  useEffect(() => {
    if (!open) return
    const field = panelRef.current?.querySelector('.editor-name-field')
    if (!field) return
    field.focus()
    const value = field.value ?? ''
    field.setSelectionRange(value.length, value.length)
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
  // La entrada hay que devolverla al cerrar por el aspa o por Escape, o se
  // queda ahí de fantasma y el siguiente «atrás» no hace nada visible. La
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

  // ── Que el panel quepa, y que quepa sin mover ni tapar nada ───────────────
  // El panel es `position: absolute` dentro de un hueco de altura cero, así
  // que no le quita ni un píxel a la columna: lo que había debajo del botón
  // sigue exactamente donde estaba. Ésa es la promesa entera de esta caja, y
  // sólo vale si se cumple siempre.
  //
  // El primer intento se hacía sitio por abajo —alargaba el documento y
  // desplazaba la página hasta que la cola del panel entraba en pantalla— y eso
  // es exactamente el defecto que la hoja vino a arreglar, sólo que más
  // pequeño: en Progreso el documento pasaba de 1789 a 2064 px y la página daba
  // un salto de 119. Así que cuando el panel no cabe entre el botón y el borde
  // útil, **sube el panel**, no baja la página.
  //
  // ── Dónde para el panel ───────────────────────────────────────────────────
  // Tres bordes, y el segundo es el que cierra la queja gorda del crítico:
  //
  // - **El borde útil de la pantalla** no es el borde de la pantalla. La barra
  //   de pestañas es `fixed` a 875–932 con `z-index: 10` y este panel vive a 3,
  //   así que todo lo que caiga de 875 para abajo está tapado aunque esté «en
  //   pantalla». El viewport *visual* entra en la misma cuenta, que es lo que
  //   hace que esto sirva también cuando sube el teclado.
  // - **El pie de su propia tarjeta. El panel no sale nunca de ella.** Ésta es
  //   la regla que impide tapar lo que no es suyo: en Progreso el disparador es
  //   el último hijo de la tarjeta de la gráfica, la tarjeta acaba en y784 y
  //   `Exportar CSV` —44 px vivos de *otra* tarjeta— empieza en y800. Un panel
  //   que cuelgue del hueco (y765) lo entierra entero bajo una superficie
  //   opaca: no parece tapado, parece borrado. Encerrado en su tarjeta no puede
  //   llegar: lo que tape será de la tarjeta que abriste.
  // - **Ocho píxeles de aire por arriba**, para que el canto no se coma el
  //   borde de la pantalla.
  //
  // Y una regla por encima de los tres, sobre el disparador: **o no se toca, o
  // se tapa entero**. La queja del crítico no era «has tapado el botón», era
  // «has tapado los 9 últimos píxeles de un objetivo de 44» — un control cortado
  // por una superficie opaca no se lee como tapado, se lee como roto. Así que
  // se sube lo que haga falta y, si eso dejaría el disparador partido, se sube
  // hasta taparlo del todo. En Progreso pasa siempre y no es opinión, es
  // aritmética: entre el pie de la gráfica (y647) y el techo de `Exportar CSV`
  // (y800) hay 153 px, el disparador ocupa 709–753 en medio, y eso deja huecos
  // de 62 y 47 px para un panel de 130. Cuando el panel lo tapa entero, la
  // puerta deja de existir: está en `aria-expanded="true"`, sale del orden de
  // tabulación y no hace nada mientras el panel esté abierto. La puerta se
  // convierte en la habitación.
  //
  // Lo que sobre después de subir se desplaza dentro del propio panel
  // (`overflow-y: auto`), porque subir sin tope acabaría sacando la cabecera.
  useLayoutEffect(() => {
    if (!open) return undefined
    const slot = slotRef.current
    const panel = panelRef.current
    if (!slot || !panel) return undefined

    const TOP_GAP = 8
    // Lo que el panel tapa y hemos sacado del orden de tabulación, para poder
    // devolverlo. Un `Set` porque `fit` corre muchas veces y lo que tapaba hace
    // dos vueltas puede haber dejado de estar tapado.
    const muted = new Set()

    const release = () => {
      for (const el of muted) el.removeAttribute('inert')
      muted.clear()
    }

    // No se puede tabular hasta un botón que no se ve y no se puede pulsar.
    // Esto no convierte el panel en modal —el resto de la pantalla sigue viva y
    // sigue siendo alcanzable— sino que retira exactamente lo que el panel
    // esconde, calculado por solapamiento real y no por adivinar quién está
    // debajo. El criterio es el centro del control: uno tapado a medias todavía
    // se ve y se apunta; uno cuyo centro está bajo una superficie opaca, no.
    const hideCovered = (panelRect) => {
      const stale = new Set(muted)
      const candidates = document.querySelectorAll(
        'a[href], button, input, select, textarea, [tabindex]',
      )
      for (const el of candidates) {
        // Lo de dentro del panel, no. Las barras fijas tampoco: viven por
        // encima (`z-index: 10` contra 3), así que solapar con ellas no
        // significa que el panel las tape — significa que ellas tapan al panel.
        if (panel.contains(el) || el.closest('.bottom-nav, .days-cta')) continue
        const r = el.getBoundingClientRect()
        const cx = r.left + r.width / 2
        const cy = r.top + r.height / 2
        const covered =
          cy > panelRect.top &&
          cy < panelRect.bottom &&
          cx > panelRect.left &&
          cx < panelRect.right
        if (covered) {
          el.setAttribute('inert', '')
          muted.add(el)
          stale.delete(el)
        }
      }
      for (const el of stale) {
        el.removeAttribute('inert')
        muted.delete(el)
      }
    }

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

      // El pie de la tarjeta a la que pertenece el panel. Sin tarjeta —en una
      // prueba, o si un día esto cuelga de otra cosa— no acota nada.
      const card = slot.closest('.card')
      const cardBottom = card ? card.getBoundingClientRect().bottom : Infinity

      // El disparador es el hermano de justo antes del hueco: el panel cuelga
      // literalmente de él.
      const trigger = slot.previousElementSibling
      const triggerRect = trigger?.getBoundingClientRect()
      const triggerBottom = triggerRect ? triggerRect.bottom : -Infinity

      // La cuenta de la pantalla sólo tiene sentido mientras se vea la puerta.
      // Si la tarjeta entera se ha ido del viewport —la página se ha movido
      // debajo de un editor abierto— no hay nada que mantener a la vista, y
      // medir contra el borde útil de todas formas arranca el panel de su
      // tarjeta: se planta a media pantalla, sobre contenido que no es suyo, o
      // se queda con 0 px de alto. Fuera de pantalla manda la tarjeta y nada
      // más.
      const doorOnScreen = triggerRect
        ? triggerRect.top < usableBottom && triggerRect.bottom > 0
        : true
      const limit = doorOnScreen ? Math.min(usableBottom, cardBottom) : cardBottom

      // Lo que hay que subir para que el panel entero esté a la vista: contra
      // los dos bordes a la vez, porque el que se pase por alto es el que
      // recorta. Aquí estaba el fallo que ninguna prueba de jsdom podía ver:
      // esto se medía sólo contra el pie de la tarjeta, así que con una tarjeta
      // que baja más que la barra de pestañas la subida se quedaba corta y el
      // panel salía cortado por abajo. Medido en Progreso con la página a 735:
      // subía 111 en vez de 142 y los 11 últimos píxeles de `Guardar nombre`
      // quedaban fuera del panel y detrás de la barra.
      const needed = Math.ceil(height - (limit - slotTop))

      // ── El disparador: o no se toca, o se tapa entero ───────────────────
      // La queja del crítico no era «has tapado el botón», era «has tapado los
      // 9 últimos píxeles de un objetivo de 44»: un control cortado por una
      // superficie opaca no se lee como tapado, se lee como roto. Lo que hay
      // que prohibir, entonces, no es cruzar la puerta sino cruzarla a medias.
      //
      // Así que de las subidas posibles sólo valen dos familias: quedarse en o
      // por debajo del canto inferior del disparador (`capTrigger`, no lo toca)
      // o llegar hasta su canto superior (`coverTrigger`, lo tapa entero). Se
      // sube lo que haga falta y, si eso cae justo en medio, se redondea hacia
      // arriba hasta taparlo del todo. Cuando el panel lo tapa entero la puerta
      // deja de existir: está en `aria-expanded="true"`, sale del orden de
      // tabulación y no hace nada mientras el panel esté abierto. La puerta se
      // convierte en la habitación.
      //
      // La versión anterior de esta regla era un tope duro en `capTrigger`, y
      // el tope duro es lo que rompe con el teclado delante: medido en Entreno
      // con el viewport a 430×602 (un IME de ~330 px), el hueco cae en 549, la
      // barra de pestañas sube a 545 y el panel se quedaba con **8 px de alto**
      // — `Guardar nombre` en y606, fuera de la pantalla entera. El botón que
      // confirma la edición, otra vez detrás del teclado. Con esta regla sube
      // los 134 que hacen falta y se ve el panel completo.
      const capTrigger = Math.floor(slotTop - triggerBottom)
      const coverTrigger = triggerRect
        ? Math.ceil(slotTop - triggerRect.top)
        : capTrigger
      const maxLift = Math.floor(slotTop - TOP_GAP)
      let lift = Math.max(0, Math.min(needed, maxLift))
      if (lift > capTrigger && lift < coverTrigger) lift = Math.min(coverTrigger, maxLift)
      panel.style.top = `${-lift}px`
      panel.style.maxHeight = `${Math.max(0, Math.floor(limit - (slotTop - lift)))}px`

      hideCovered(panel.getBoundingClientRect())
    }

    fit()
    // El hueco no toma altura nunca. Se deja escrito en vez de darlo por
    // supuesto para que un cambio futuro tenga que borrar esta línea a mano.
    slot.style.height = '0px'

    const vv = window.visualViewport
    vv?.addEventListener('resize', fit)
    window.addEventListener('resize', fit)
    // El cuerpo, no sólo la caja. El panel crece solo cuando aparece el aviso
    // de nombre repetido, la oferta de fusión, el deshacer del reetiquetado o
    // el segundo paso — y en cuanto `fit` le ha puesto un tope de altura, su
    // caja ya no cambia de tamaño cuando el contenido crece: se limita a
    // desbordar por dentro. Un observador colgado sólo del panel no vuelve a
    // dispararse nunca. Medido en Progreso: al chocar el nombre con uno
    // existente entraban 103 px de aviso y de `Fusionar con…` en un panel
    // clavado en 130, y quedaban por debajo del corte, invisibles y sin ninguna
    // pista de que hubiera algo más. Vigilando también a los hijos —el
    // formulario y el segundo panel—, que sí crecen de verdad, se entera.
    //
    // `fit` no depende de lo que él mismo aplica —mide con el tope quitado—,
    // así que la segunda vuelta calcula lo mismo y ahí se para.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    ro?.observe(panel)
    for (const child of panel.children) ro?.observe(child)
    return () => {
      vv?.removeEventListener('resize', fit)
      window.removeEventListener('resize', fit)
      ro?.disconnect()
      release()
    }
  }, [open, moreOpen])

  if (!open) return null

  return (
    <div className="editor-inplace-slot" ref={slotRef}>
      <div
        ref={panelRef}
        className="editor-inplace"
        role="dialog"
        aria-label={`Editar ${name}`}
      >
        <form className="editor-name" onSubmit={onSubmitName}>
          {/* El campo *es* el título. Lleva la cara de display y el cuerpo del
              nombre de un ejercicio en cualquier otra pantalla, porque es el
              mismo dato; lo que lo delata como editable es el marco, no un
              rótulo encima repitiendo la palabra «Nombre». */}
          <div className="editor-head">
            <input
              className="editor-name-field"
              // El nombre del ejercicio va dentro de la etiqueta hablada porque
              // en un superset hay varias tarjetas abiertas y un «Nombre» a
              // secas no dice de cuál.
              aria-label={`Nombre de ${name}`}
              value={nameDraft}
              onChange={(e) => onNameDraftChange(e.target.value)}
              maxLength={120}
            />
            {/* Una salida explícita, al lado de la entrada, y 44 px como todo
                aquí. Escape y el gesto de atrás también cierran, pero los dos
                son gestos que hay que saberse ya; éste es el que encuentra un
                pulgar. */}
            <button
              type="button"
              className="editor-close"
              aria-label="Cerrar"
              onClick={onClose}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          <div className="editor-commit">
            <button type="submit" className="secondary editor-save">
              Guardar nombre
            </button>
            {more && (
              // La puerta al segundo paso, en el vocabulario que la casa ya usa
              // para las puertas: tinta en la etiqueta, `›` apagado, y el
              // nombre del ejercicio en la etiqueta hablada por lo mismo que el
              // campo de arriba. `aria-expanded` porque no lleva a otra
              // pantalla: despliega ésta.
              <button
                type="button"
                className="editor-more"
                aria-label={`Más ajustes de ${name}`}
                aria-expanded={moreOpen}
                aria-controls="editor-more-pane"
                onClick={() => setMoreOpen((v) => !v)}
              >
                Más ajustes
              </button>
            )}
          </div>
          {nameError && (
            <p role="alert" className="alert rename-alert">
              {nameError}
            </p>
          )}
          {nameExtra}
        </form>
        {more && moreOpen && (
          <div className="editor-more-pane" id="editor-more-pane">
            {more}
          </div>
        )}
      </div>
    </div>
  )
}

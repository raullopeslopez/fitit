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
 * ── El segundo paso sustituye al primero; no se despliega debajo ───────────
 *
 * El segundo paso nació como un pliegue, y el pliegue no ganó. Medido en
 * Entreno: abrirlo llevaba el panel de **130 a 314 px (+141 %)** y tapaba
 * enteros **nueve controles** —la fila de peso y reps completa, `Registrar
 * serie`, `Repetir serie` y `Editar serie 1`—, todos marcados `inert`. En
 * Progreso tapaba el **100 % de la gráfica** (16,8 % con el pliegue cerrado).
 * Cero controles partidos, sí, pero conseguido creciendo hasta que lo que iba a
 * partir cupiera entero dentro de la sombra, que no es lo mismo que caber.
 *
 * Ahora los dos pasos son dos caras del mismo panel: entrar en el segundo
 * retira el primero. El panel pasa de **128 a 164 px** —una fila de 44 más, no
 * cuatro—, y esos 164 caben en el hueco que dejan la gráfica por arriba y la
 * barra por abajo en Progreso, y entre el disparador y la fila de peso y reps
 * en Entreno. El coste es que el nombre no está a la vista dentro del segundo
 * paso, y se paga en la fila de la vuelta, que hay que dibujar igualmente: la
 * vuelta lleva el nombre escrito.
 *
 * ── El cuerpo del cajón es una rejilla, no un formulario ───────────────────
 *
 * Cada propiedad es **una fila y la fila es el control**: el valor a tamaño de
 * lectura, sin caja, sin borde y sin un rótulo al lado repitiendo cómo se llama
 * el campo. El grupo se lee `● Pecho ›` porque el nombre del músculo ya dice
 * que eso es un grupo muscular; la nota se lee sola en cuanto tiene algo
 * escrito, y cuando no, su marcador de posición nombra el campo. El paso de la
 * casa no puede ser el de 32 px de la referencia: DESIGN.md pone el suelo en 44
 * y aquí no se negocia, así que lo que se copia es la idea —cero cromo— y no el
 * número.
 *
 * Lo que **sí** se movió, y es una vuelta atrás deliberada: la queja del
 * renombrado y la oferta de fusión ya no están pegadas al campo. Estaban aquí
 * con el argumento —bueno— de que son la respuesta a lo que acabas de intentar.
 * El argumento se cayó al quitar el botón de guardar: desde entonces el
 * renombrado también sale al cerrar, y en las cuatro salidas la petición viaja
 * mientras este componente se desmonta, así que la respuesta llega a algo que
 * ya no existe. Medido: por el aspa, Escape, atrás y tocar fuera, ni un fallo
 * de red ni un 409 decían absolutamente nada, aunque la petición salía y el
 * servidor contestaba. Un aviso en la única superficie que desaparece es un
 * aviso que no se da. Vive ahora en la tarjeta, encima de la puerta que abre
 * este panel; ver `EditTrouble.jsx`.
 *
 * ── Aquí no hay botón de guardar ────────────────────────────────────────────
 *
 * Ni uno. El grupo se guarda al elegirlo —eso ya era así—, y el nombre y la
 * nota se guardan cuando dejas de mirarlos: al pulsar Intro, al cambiar de
 * paso y al cerrar el panel por cualquiera de sus cuatro puertas (el aspa,
 * Escape, el gesto de atrás y tocar fuera). Eso es `onCommit`, y quien llama es
 * el que sabe qué significa guardar cada campo.
 *
 * El panel tenía `Guardar nombre` de ancho completo y, en la fila de la nota,
 * un `Guardar` que se llamaba `Borrar` cuando el borrador estaba vacío. Dos
 * argumentos para quitarlos, y el segundo es el que decide:
 *
 * 1. **Un botón cuya etiqueta tiene que cambiar para no mentir es un botón que
 *    está haciendo dos cosas.** `Guardar`/`Borrar` era la confesión: el control
 *    no representaba un acto, representaba «manda el campo», y el acto se leía
 *    del contenido. Sin botón, el acto es el que siempre fue —dejar la nota
 *    vacía es no tener nota— y no hay ninguna palabra que se pueda equivocar.
 * 2. **Cuesta el ancho de su fila, y el panel no lo tiene.** Medido a 430×932:
 *    el primer paso sigue midiendo 130 px de alto sin él —compartía los 44 de
 *    su fila con la puerta al cajón, así que no había altura que ganar— pero se
 *    llevaba `flex: 1` de esa fila y dejaba `Grupo y nota` arrinconado a la
 *    derecha. Ahora la puerta es la fila. En la de la nota es más gordo: el
 *    botón se comía el ancho del propio campo donde escribes la nota.
 *
 * Lo que se pierde es la señal de «no lo he pulsado, así que no cuenta». Sin
 * botón esa lectura no existe: lo único que queda es lo que escribiste, así que
 * salir es confirmar. La promesa que sí se conserva —que un borrador
 * abandonado no se quede fingiendo estar guardado— se cumple ahora por el otro
 * lado: no queda ningún borrador sin guardar, porque cada salida lo guarda. Y
 * abrir sigue resembrando desde el ejercicio, que ahora es una tautología y por
 * eso mismo es la comprobación de que esto está bien: lo que ves al abrir es lo
 * que hay guardado, siempre.
 *
 * Guardar con un temporizador mientras tecleas —lo que hace la referencia— se
 * consideró y se descartó: esto se usa a media sesión, con el móvil en una
 * mano, y una interrupción a mitad de palabra dejaría `Press de` guardado como
 * el nombre del ejercicio. El teclado que abandonas no es una decisión; el
 * campo que dejas atrás sí.
 */
/**
 * El rótulo de la puerta al segundo paso. Es una constante otra vez porque el
 * cajón vuelve a llevar lo mismo en las dos pantallas: el grupo, la nota y el
 * borrado. Mientras llevó cosas distintas, la puerta tenía dos nombres — y ésa
 * era la señal visible de que «un editor compartido» eran dos.
 */
export const MORE_LABEL = 'Grupo, nota y eliminar'

export function ExerciseEditor({
  name,
  open,
  onClose,
  // Manda al servidor lo que haya escrito en los campos de texto. Se llama
  // antes de cada salida y antes de cada cambio de paso, o sea siempre que un
  // campo va a dejar de estar delante. Tiene que ser idempotente: dos salidas
  // seguidas —Intro y después el aspa— no pueden valer por dos renombrados.
  onCommit,
  nameDraft,
  onNameDraftChange,
  onSubmitName,
  more,
  moreLabel,
}) {
  const panelRef = useRef(null)
  const slotRef = useRef(null)
  const [moreOpen, setMoreOpen] = useState(false)
  // ¿Queda algo en pantalla que diga qué ejercicio es esto? Lo mide `fit`,
  // porque es él quien sabe lo que el panel tapa. Empieza en `true` para que
  // el primer pintado no traiga un rótulo que a lo mejor sobra: `fit` corre en
  // un efecto de layout, o sea antes de que se pinte nada.
  const [nameOnScreen, setNameOnScreen] = useState(true)

  // `onClose` llega como una lambda nueva en cada render de quien llama, así
  // que un efecto que dependa de ella se desmonta y se vuelve a montar cada
  // vez que la pantalla se repinta. Para el listener de Escape eso sólo era
  // trabajo de más; para el del historial sería una entrada nueva por render,
  // y «atrás» dejaría de funcionar. La identidad se congela aquí.
  const onCloseRef = useRef(onClose)
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCloseRef.current = onClose
    onCommitRef.current = onCommit
  })

  // Salir por cualquier puerta guarda primero. Es una sola función y no cuatro
  // porque las cuatro salidas tienen que valer lo mismo: si tocar fuera
  // descartase y el aspa guardase, el resultado de un gesto dependería de dónde
  // aterrizó el pulgar. Sólo lee refs, así que no hace falta congelarla: la que
  // capturó el primer efecto se comporta como la de este render.
  const leave = () => {
    onCommitRef.current?.()
    onCloseRef.current()
  }

  // Abrir es empezar de cero. Si el segundo panel se quedase abierto de la vez
  // pasada, el editor volvería a nacer con los 294 px que este cambio quita.
  useEffect(() => {
    if (open) {
      setMoreOpen(false)
      setNameOnScreen(true)
    }
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

  // Ir y volver entre los dos pasos es navegar, y navegar sin llevarse el foco
  // deja a quien usa teclado o lector en una página que ha cambiado entera
  // debajo de un cursor que sigue donde estaba —o, peor, en `body`, porque el
  // control que tenía el foco acaba de desmontarse—. Al entrar, el foco cae en
  // la vuelta, que es el primer control del paso y además dice dónde estás; al
  // salir, en la puerta por la que entraste. La primera vuelta no cuenta: al
  // abrir manda el campo del nombre, y de eso se ocupa el efecto de arriba.
  const firstRender = useRef(true)
  useEffect(() => {
    if (!open) {
      firstRender.current = true
      return
    }
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const panel = panelRef.current
    if (!panel) return
    const target = moreOpen
      ? panel.querySelector('.editor-back')
      : panel.querySelector('.editor-more')
    target?.focus()
  }, [open, moreOpen])

  // Escape cierra. Registrado sólo mientras está abierto, para que nada de la
  // página tenga que saber que este componente existe cuando no lo está.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') leave()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Tocar fuera cierra. El crítico lo midió: tocando el campo de otra tarjeta
  // el foco se iba allí y el editor se quedaba abierto detrás, con un
  // renombrado sin confirmar dentro. Un panel que no es modal y que tampoco se
  // va cuando dejas de mirarlo no es ninguna de las dos cosas: se queda de
  // capa fantasma tapando el registro mientras tú ya estás en otra cosa.
  //
  // Cierra **guardando**, que es lo que hacen también el aspa, Escape y el
  // gesto de atrás. Antes tiraba el borrador, y era coherente mientras hubo un
  // botón de guardar: no haberlo pulsado era una respuesta. Sin botón no hay
  // ninguna forma de decir «he escrito esto pero no cuenta», y de las dos
  // lecturas que quedan —«lo que escribiste es lo que quieres» y «lo que
  // escribiste se tira si sales por la puerta equivocada»— sólo la primera se
  // puede adivinar sin que te lo cuenten. Lo que no puede pasar es que las
  // cuatro salidas hagan cosas distintas: eso sí sería el tercer estado.
  //
  // `pointerdown` y no `click`: así el toque cierra el panel *y* llega a lo que
  // apuntabas, que sigue en su sitio porque el hueco no ocupa flujo. Un toque,
  // una cosa.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      const panel = panelRef.current
      const slot = slotRef.current
      if (!panel || panel.contains(e.target)) return
      // El disparador se apaña solo: su `onClick` alterna, así que cerrarlo
      // también desde aquí haría que un toque valiese por dos y el panel
      // volviese a abrirse en el mismo gesto.
      if (slot?.previousElementSibling?.contains(e.target)) return
      // Los diálogos que este panel abre —confirmar el reetiquetado, confirmar
      // el borrado— se pintan fuera de él. Cerrar el editor al tocarlos dejaría
      // a alguien confirmando algo cuyo origen acaba de desaparecer.
      if (e.target.closest?.('[role="dialog"], .dialog-backdrop')) return
      // Y el aviso del renombrado, que también se pinta fuera. Es la respuesta
      // a lo que este panel acaba de mandar, así que tocarlo no es irse a otra
      // cosa: es seguir en la misma. Sin esto, el `pointerdown` sobre
      // `Fusionar` cerraba el panel y volvía a mandar el renombrado *antes* de
      // que llegase el `click`, que entonces encontraba la oferta ya retirada —
      // medido: `mergeExercise` no se llamaba ni una vez.
      if (e.target.closest?.('[data-editor-answer]')) return
      leave()
    }
    document.addEventListener('pointerdown', onDown, true)
    return () => document.removeEventListener('pointerdown', onDown, true)
  }, [open])

  // La quinta salida, y en un móvil es la más común de todas: irse de la app.
  // Bloquear la pantalla, cambiar de aplicación, recargar, que el sistema mate
  // la pestaña. Las otras cuatro guardan; ésta era la única que no, así que la
  // forma más normal de dejar el editor era también la única que se llevaba el
  // borrador por delante — sin decirlo, y sin que la pestaña se cierre siquiera.
  //
  // `visibilitychange → hidden` y `pagehide`, los dos, y no `beforeunload`:
  // `beforeunload` no se dispara en el descarte de una pestaña de móvil, que es
  // exactamente el caso. `pagehide` cubre la recarga y la navegación fuera;
  // `hidden` cubre el bloqueo de pantalla y el cambio de app, y es el único que
  // llega a tiempo cuando el sistema decide congelar la página.
  //
  // No cierra el panel. Si vuelves, vuelves a lo que estabas mirando; lo único
  // que ha pasado es que lo escrito ya está mandado. `onCommit` tiene que poder
  // llamarse de más —lo dice su contrato— y aquí se usa esa promesa entera: una
  // pantalla que se apaga y se enciende son dos avisos para un solo acto.
  useEffect(() => {
    if (!open) return undefined
    const onAway = () => {
      if (document.visibilityState === 'hidden') onCommitRef.current?.()
    }
    const onHide = () => onCommitRef.current?.()
    document.addEventListener('visibilitychange', onAway)
    window.addEventListener('pagehide', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onAway)
      window.removeEventListener('pagehide', onHide)
    }
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
      leave()
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

    // Todo lo que el panel puede llegar a partir o a tapar. Se recorre entero
    // porque la regla de abajo no distingue quién es quién: el disparador no
    // tiene ningún privilegio sobre la fila de peso y reps.
    const INTERACTIVE = 'a[href], button, input, select, textarea, [tabindex]'
    // ¿Se pueden medir renglones aquí? En jsdom no: no hay motor de
    // maquetación y su `Range` no implementa `getClientRects`. No se pierde
    // nada — allí los rectángulos son ceros de todas formas y los cortes se
    // miden en la suite de navegador, que existe exactamente por eso — pero sin
    // esta pregunta el editor revienta al montarse en las 632 pruebas de la
    // otra suite.
    let canMeasureLines = false
    try {
      const probe = document.createRange()
      canMeasureLines = typeof probe.getClientRects === 'function' && !!probe.getClientRects().length >= 0
      canMeasureLines = canMeasureLines && Symbol.iterator in Object(probe.getClientRects())
    } catch {
      canMeasureLines = false
    }
    const crossables = () => {
      const out = []
      for (const el of document.querySelectorAll(INTERACTIVE)) {
        // Lo de dentro del panel, no. Las barras fijas tampoco: viven por
        // encima (`z-index: 10` contra 3), así que solapar con ellas no
        // significa que el panel las tape — significa que ellas tapan al panel.
        // Y nada que *contenga* al hueco: un contenedor con `tabindex` que
        // abarque media página cruzaría los dos cantos siempre y el panel se
        // pasaría la vida subiendo para esquivar su propio abuelo.
        if (panel.contains(el) || el.contains(slot)) continue
        if (el.closest('.bottom-nav, .days-cta')) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        out.push(r)
      }
      // ── Y cada renglón de prosa, que se parte igual de mal ──────────────
      // La regla de la casa nunca fue sobre controles, era sobre cantos: «un
      // canto opaco cruzando un control no se lee como tapado, se lee como
      // roto». Una frase cortada por la mitad de sus letras se lee igual de
      // rota y encima no hay nada que tocar que devuelva el trozo que falta.
      //
      // Se coló al ir el panel a lo ancho de la tarjeta —lo que acabó con el
      // chip `Tríceps` partido de Progreso— sin aplicar el mismo razonamiento
      // en vertical: el canto de arriba pasó a cruzar `.exercise-note`, la
      // frase que se lee antes de la primera repetición, 8,0 px de sus 18,3 y
      // en todas las paradas del barrido. Con el cajón abierto esa misma nota
      // sale entera 126 px más abajo, así que la pantalla llevaba el dato dos
      // veces con una de las dos copias rota.
      //
      // La unidad es **el renglón**, no el elemento: un párrafo cortado entre
      // dos líneas no tiene ni una letra partida y dice lo que dice cualquier
      // lista cortada, «hay más debajo». Por eso se miden los rectángulos que
      // el navegador le da a un rango de texto.
      //
      // Se salta lo que vive dentro de un control, que ya está arriba con un
      // listón más duro. Y se recorre por nodos de texto y no por elementos:
      // son bastantes menos, y esto corre en el rAF de cada scroll.
      const walker = canMeasureLines
        ? document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        : null
      for (let node = walker?.nextNode(); node; node = walker.nextNode()) {
        if (!node.data.trim()) continue
        const el = node.parentElement
        if (!el || panel.contains(el) || el.contains(slot)) continue
        if (el.closest(INTERACTIVE)) continue
        if (el.closest('.bottom-nav, .days-cta')) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        for (const r of range.getClientRects()) {
          if (r.width === 0 || r.height === 0) continue
          out.push(r)
        }
      }
      return out
    }

    // No se puede tabular hasta un botón que no se ve y no se puede pulsar.
    // Esto no convierte el panel en modal —el resto de la pantalla sigue viva y
    // sigue siendo alcanzable— sino que retira exactamente lo que el panel
    // esconde, calculado por solapamiento real y no por adivinar quién está
    // debajo.
    //
    // El criterio era el centro del control, y el centro es justo lo que falla
    // cuando algo queda tapado por su mitad de abajo: medido en Progreso, una
    // fila de siete chips tapada 35,1 px de 36 dejaba tres chips `inert` y un
    // cuarto vivo detrás de una astilla de 0,9 px. Con el solapamiento el
    // criterio es uno solo. Y como la regla de colocación de abajo ya garantiza
    // que nada quede partido, «solapa» y «está tapado entero» son la misma cosa
    // salvo en el caso residual en que el panel no puede subir más — y ahí
    // sigue mandando el solapamiento, porque un control cuya mitad útil está
    // bajo una superficie opaca no se puede pulsar.
    const hideCovered = (panelRect) => {
      const stale = new Set(muted)
      for (const el of document.querySelectorAll(INTERACTIVE)) {
        if (panel.contains(el) || el.contains(slot)) continue
        if (el.closest('.bottom-nav, .days-cta')) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        const covered =
          r.left < panelRect.right &&
          r.right > panelRect.left &&
          r.top < panelRect.bottom &&
          r.bottom > panelRect.top
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

    // ── Quién dice qué ejercicio es esto ──────────────────────────────────
    // El campo *es* el título, y eso se sostiene mientras el título de la
    // tarjeta siga a la vista detrás. Con el teclado arriba no sigue: medido en
    // Entreno, el panel tapa `Hombro / Press militar` entero (44 de 44) y la
    // nota del ejercicio entera, y lo único que queda en pantalla con el nombre
    // es tu propio borrador — que en cuanto le borras una letra ya no dice cuál
    // era. Así que el panel se pone el nombre encima, pero sólo entonces: con
    // el título a la vista, repetirlo dentro es exactamente el rótulo
    // redundante que este panel quitó.
    //
    // Se busca el nombre por el texto de la página en vez de por una clase
    // concreta, porque las dos pantallas lo escriben en sitios distintos y una
    // tercera lo escribiría en otro. Si no lo lleva nadie, esto no opina: el
    // panel no ha tapado ningún título, porque no había.
    //
    // «A la vista» no es «tiene un píxel dentro de la pantalla», pero tampoco
    // es «no le falta ni uno». El nombre es una línea de texto: cortarle dos
    // píxeles por arriba no le quita nada que se leyera, y partirlo por la
    // mitad lo deja en un renglón de palos. La regla anterior descartaba
    // cualquier caja con el `top` negativo, y medido en Entreno con la página
    // en 419 eso significaba dar por perdido un `SPAN.card-name` en −2,2..25,5
    // —el 92 % en pantalla, legible de sobra— y meter dentro del panel un
    // `Editando · Press militar` con el nombre a la vista justo encima: el
    // rótulo redundante que este panel quitó, devuelto por la puerta de atrás.
    // Así que se mide lo que queda en pie —dentro de la pantalla, por encima
    // del borde útil y fuera del panel— y con más de la mitad basta.
    const nameStillReadable = (panelRect, usableBottom) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
      let found = false
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.data.includes(name)) continue
        const el = node.parentElement
        if (!el || panel.contains(el)) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        found = true
        const top = Math.max(r.top, 0)
        const bottom = Math.min(r.bottom, usableBottom)
        let visible = bottom - top
        // El panel sólo tapa lo que tiene debajo, no lo que le pasa por el
        // lado: la resta se hace únicamente si comparten columna.
        if (r.left < panelRect.right && r.right > panelRect.left) {
          visible -= Math.max(
            0,
            Math.min(bottom, panelRect.bottom) - Math.max(top, panelRect.top),
          )
        }
        if (visible >= r.height / 2) return true
      }
      return !found
    }

    const fit = () => {
      // Se mide con el panel en su sitio natural y sin tope de altura, porque
      // las dos cosas que aplicamos —`top` y `max-height`— cambian justo lo que
      // hay que medir.
      //
      // El alto sale del rectángulo y no de `offsetHeight`, que redondea al
      // entero. Ese medio píxel es exactamente un canto que cae dentro de un
      // control en vez de fuera: medido en Progreso a 430×932 con la página en
      // 735 y el segundo panel abierto, la cuenta creía aterrizar en 874,9 —el
      // pie exacto del disparador, rozándolo sin tocarlo— mientras el panel de
      // verdad acababa en 874,5 y le partía 43,6 px de 44. Con el nombre en
      // colisión el mismo entero de más dejaba además una astilla de 0,2 px
      // *viva*, porque `hideCovered` medía con él.
      //
      // Lo que no se puede sacar del rectángulo es el `top`: ahí sí entra la
      // animación de entrada y medir a media animación deja la cuenta 8 px
      // corta. El alto no, porque `editor-unfold` sólo traslada — no escala—,
      // así que es el bueno desde el primer fotograma. Por eso el origen
      // vertical se sigue tomando del hueco, que no se anima.
      panel.style.top = '0px'
      panel.style.maxHeight = 'none'
      const slotTop = slot.getBoundingClientRect().top
      // El mismo rectángulo da el ancho, que es lo que decide qué controles
      // están en la columna del panel y cuáles pasan de largo por los lados.
      const box = panel.getBoundingClientRect()
      const height = box.height

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
      const cardRect = card ? card.getBoundingClientRect() : null
      const cardBottom = cardRect ? cardRect.bottom : Infinity

      // ── Lo que el panel no puede tapar, no sólo lo que no puede partir ────
      // El pacto de la casa: «cuando una acción rara y una acción por serie se
      // pelean por el mismo sitio, gana la de la serie, siempre» (DESIGN.md).
      // Hasta ahora el panel sólo se prohibía *partir* controles, y partir no
      // es lo que hacía daño: con el segundo paso abierto en Entreno el canto
      // de abajo aterrizaba limpiamente en el hueco entre dos series y el panel
      // se comía enteros —sin cortar ninguno— la fila de peso y reps,
      // `Registrar serie`, `Repetir serie` y `Editar serie 1`. Nueve controles
      // del aparato de la serie, tapados por el cajón donde se cambia una
      // etiqueta. Y en Progreso lo mismo con la gráfica, que es lo que esa
      // pantalla *es*: el 100 % tapado con el cajón abierto.
      //
      // Así que quien llama marca lo que no se toca con `data-editor-protect` y
      // aquí se convierte en dos topes duros — uno por banda, porque lo que
      // está debajo del hueco se esquiva bajando el pie del panel y lo que está
      // encima se esquiva no subiendo tanto:
      //
      // - protegido **debajo** del hueco → el panel no llega a su techo;
      // - protegido **encima** → el panel no sube por encima de su pie.
      //
      // Y una condición sobre las dos, que es lo que las hace honestas:
      // **valen mientras el panel quepa entre ellas, y sólo mientras**. Si no
      // cabe, se sueltan las dos y manda la cuenta de siempre. Medido en
      // Progreso a 430×932 con la página en 735, entre el pie de la gráfica
      // (769,9) y la barra de pestañas (875) hay **105 px** y el primer paso
      // mide 130: con el techo duro el panel se quedaba en 105 y `Guardar
      // nombre` —lo único que este panel viene a hacer— se iba debajo del
      // corte, alcanzable sólo desplazando por dentro de una caja de 105 px que
      // no parece desplazable. Un control que no se ve es peor defecto que unos
      // píxeles de gráfica tapados, y el panel es lo que estás usando.
      //
      // Lo que se conserva al soltarlas es que la subida sigue siendo la
      // mínima: el panel llega hasta donde necesita y ni un píxel más, así que
      // sobre la gráfica se posan los 25 px que le sobran al primer paso
      // (17,2 %) o los 61 del segundo (42 %) — nunca el 100 % que costaba el
      // pliegue. En Entreno no se sueltan nunca, porque entre el aire de arriba
      // y el techo del formulario de registro hay 456 px para un panel de 166.
      // Es la diferencia entre la barra de referencia y nosotros: ella llega a
      // cero controles partidos *atracando a un tamaño fijo sobre un carril
      // secundario*, y nosotros llegábamos creciendo hasta que lo que íbamos a
      // partir cupiera dentro de la sombra.
      let protectFloor = Infinity
      let protectCeil = TOP_GAP
      // El **techo** del bloque de arriba, no sólo su pie. Es la tercera
      // posición que faltaba, y se explica donde se usa.
      let protectTop = Infinity
      for (const el of document.querySelectorAll('[data-editor-protect]')) {
        if (panel.contains(el) || el.contains(slot)) continue
        const r = el.getBoundingClientRect()
        if (r.width === 0 || r.height === 0) continue
        // Sólo lo que comparte columna con el panel: lo que le pasa por el lado
        // no lo tapa nunca.
        if (r.left >= box.right || r.right <= box.left) continue
        if (r.top >= slotTop) protectFloor = Math.min(protectFloor, r.top)
        else if (r.bottom <= slotTop) {
          protectCeil = Math.max(protectCeil, r.bottom)
          protectTop = Math.min(protectTop, r.top)
        }
      }

      // La cuenta de la pantalla sólo tiene sentido mientras quede tarjeta a la
      // vista. Si la tarjeta entera se ha ido por debajo del borde útil —la
      // página se ha movido debajo de un editor abierto— el panel se va con
      // ella en vez de quedarse flotando a media pantalla sobre contenido que
      // no es suyo: no sube nada (`maxLift` a cero) y sólo lo acota su tarjeta.
      //
      // Lo que **no** puede volver a pasar es que el borde útil se caiga de la
      // cuenta mientras el panel sí se ve. Ése era el defecto medido: la regla
      // anterior soltaba el borde útil en cuanto el *disparador* se metía
      // detrás de la barra de pestañas, y entonces el pie del panel se medía
      // sólo contra la tarjeta, que baja más. En Progreso, abriendo con la
      // página en 735 y subiendo a 675 —60 px, un gesto— el panel pasaba de
      // acabar en 874,9 (rozando la barra) a acabar en 965,5, con 90 px suyos
      // detrás de una barra que está a `z-index: 10` contra su 3, **no** es
      // `inert`, y navega a Días: el `select` del grupo quedaba con 11,9 de sus
      // 44 px debajo, y tocar ahí no era tocar en el vacío, era tirar el
      // renombrado sin guardar. Eso no es un defecto visual, es pérdida de
      // datos.
      const cardOnScreen = cardRect ? cardRect.top < usableBottom : true
      const baseLimit = Math.min(cardOnScreen ? usableBottom : Infinity, cardBottom)
      // Las dos marcas de lo intocable, sueltas de golpe si el panel no cabe
      // entre ellas: o se respetan enteras o no se respetan, porque respetar
      // sólo una deja el panel recortado por el otro lado.
      const roomProtected = Math.min(baseLimit, protectFloor) - protectCeil
      const fitsProtected = roomProtected >= height
      // ── Y el cajón se recorta antes que posarse encima del registro ──────
      // Soltar las marcas de lo intocable se escribió para el **primer paso**,
      // y el argumento era el bueno: ahí vive el campo del nombre, que es lo
      // único que este panel viene a hacer, y un control que no se ve es peor
      // defecto que unos píxeles de gráfica tapados.
      //
      // El segundo paso no es eso. Dentro hay el grupo, la nota y el borrado —
      // lo que DESIGN.md llama acciones raras—, y la misma línea de DESIGN.md
      // dice que «cuando una acción rara y una acción por serie se pelean por
      // el mismo sitio, gana la de la serie, siempre». Soltar las marcas ahí
      // hace exactamente lo contrario.
      //
      // Y no era teórico, sólo era estrecho: con dos filas el cajón medía 166
      // y el hueco limpio de Entreno en lo alto del barrido mide 173,8, así que
      // cabía por 7,8 px. Al ganar el cajón su tercera fila —el borrado, que le
      // faltaba a esta pantalla— pasó a 223 y las marcas se soltaban: medido a
      // 430×932, en las paradas 400, 425 y 433 el canto de abajo caía dentro de
      // la fila de peso y reps y dejaba **seis controles partidos** hasta el
      // 85,5 %, más el `card-toggle`.
      //
      // Así que en el cajón el tope es duro y lo que sobra se desplaza dentro
      // del panel, que ya es `overflow-y: auto`. El contraargumento de la
      // vuelta anterior —«`Guardar nombre` se iba debajo del corte»— murió con
      // el botón de guardar: aquí no hay nada que confirmar, sólo tres filas de
      // ajustes, y la que se queda debajo del corte es la última.
      //
      // Con un suelo, que es lo que hace que esto no reviva el panel de 8 px
      // que producía el tope duro con el teclado delante: si entre las marcas
      // no caben ni tres filas, se sueltan como siempre.
      const MIN_DRAWER = 3 * 44
      const clampsProtected = !fitsProtected && moreOpen && roomProtected >= MIN_DRAWER

      // ── Y si no cabe debajo, se mira si cabe encima ──────────────────────
      // Faltaba una posición. Cuando lo protegido está arriba y entre su pie y
      // la barra de pestañas no caben los 166 px del cajón, la regla anterior
      // soltaba los dos topes y dejaba caer el panel justo encima: medido en
      // Progreso a 430×932 con el cajón abierto, la gráfica quedaba **tapada
      // al 100 % en un tramo de 25 px de scroll**, por encima del 90 % en 50,
      // y por encima del 50 % en 145 — un 36 % del recorrido entero.
      //
      // Y en esa pantalla eso no es acabado. La tercera fila del cajón es
      // `Eliminar ejercicio`, y con el campo del nombre tapado por el propio
      // panel la gráfica es la única prueba en pantalla de **qué ejercicio**
      // estás a punto de borrar. Tapar la identidad del registro cuyo botón de
      // borrado vive en el mismo panel de 166 px no es un problema de píxeles.
      //
      // La justificación de la vuelta anterior —que arreglarlo metería un
      // salto— era falsa y se puede medir: sin tocar nada, el panel ya **salta
      // de 674 a 708, 34 px dentro de un paso de scroll de 5**, entre sY 125 y
      // sY 130. El trato nunca fue «suave y tapada» contra «a saltos y
      // limpia»; era «un salto de 34 px *y* tapada» contra «un salto y
      // limpia».
      //
      // Cuando el panel ya ha abandonado su hueco —que es exactamente este
      // caso: el disparador está debajo de la barra de pestañas y el panel
      // flota— da igual por qué lado del bloque protegido flote. Así que
      // primero se prueba el sitio de siempre (debajo), y si ahí no cabe se
      // prueba **encima**: el pie del panel en el techo del bloque. No es una
      // tercera regla, es la misma —«no te poses encima de lo que la pantalla
      // *es*»— resuelta por el otro lado.
      //
      // Sigue sin haber tope duro que recorte el panel: `fitsAbove` sólo es
      // cierto si entre el aire de arriba y el techo del bloque cabe el panel
      // entero, así que esta rama nunca esconde `Guardar nombre` detrás de un
      // corte. Si tampoco cabe encima —el bloque ya asoma por el canto de
      // arriba— manda la cuenta de siempre y el panel se posa lo mínimo.
      const fitsAbove = !fitsProtected && !clampsProtected && protectTop - TOP_GAP >= height
      const limit =
        fitsProtected || clampsProtected
          ? Math.min(baseLimit, protectFloor)
          : fitsAbove
            ? Math.min(baseLimit, protectTop)
            : baseLimit
      const ceiling = fitsProtected || clampsProtected ? protectCeil : TOP_GAP

      // Lo que hay que subir para que el panel entero esté a la vista: contra
      // los dos bordes a la vez, porque el que se pase por alto es el que
      // recorta. Aquí estaba el fallo que ninguna prueba de jsdom podía ver:
      // esto se medía sólo contra el pie de la tarjeta, así que con una tarjeta
      // que baja más que la barra de pestañas la subida se quedaba corta y el
      // panel salía cortado por abajo. Medido en Progreso con la página a 735:
      // subía 111 en vez de 142 y los 11 últimos píxeles de `Guardar nombre`
      // quedaban fuera del panel y detrás de la barra.
      const needed = Math.ceil(height - (limit - slotTop))

      // ── Nada queda partido: ni el disparador ni lo que haya al otro lado ──
      // La queja del crítico no era «has tapado el botón», era «has tapado los
      // 9 últimos píxeles de un objetivo de 44»: un control cortado por una
      // superficie opaca no se lee como tapado, se lee como roto. Lo que hay
      // que prohibir, entonces, no es cruzar un control sino cruzarlo a medias.
      //
      // Eso valía sólo para el disparador —el hermano de justo antes del
      // hueco—, y el defecto gordo estaba en el otro canto y en todo lo demás.
      // Medido en Entreno a 430×932 con la página a 200 y a 419, el segundo
      // panel cerrado, sin que el usuario haya tocado nada: el canto de abajo
      // aterrizaba en 478,8 dentro de la fila de peso y reps (464,3–516,3) y
      // dejaba **seis controles vivos partidos a 14,5 de 52**, con los rótulos
      // `Peso · kg` y `Reps` comidos, de modo que la fila se leía
      // `− ▢ + − ▢ +`. Y en Progreso, al chocar el nombre con el segundo panel
      // abierto, el canto de arriba tapaba una fila de chips 35,1 de 36 y
      // dejaba una astilla viva de 0,9 px.
      //
      // La regla es la misma de siempre con el reparto ampliado: **ningún canto
      // del panel puede quedarse dentro de un control**. Y la corrección es una
      // sola cuenta para los dos cantos, porque son el mismo movimiento visto
      // desde dos sitios — *subir el panel hasta que el techo de la fila
      // ofendida quede en el canto o por encima de él*:
      //
      // - si el canto de **arriba** parte una fila, subir hasta su techo la
      //   tapa entera (lo que ya hacía `coverTrigger`);
      // - si el canto de **abajo** parte una fila, subir hasta su techo la deja
      //   intacta.
      //
      // Se sube y nunca se baja, porque bajar por debajo de `needed` recorta el
      // panel, y el panel es lo que estás usando. Dicho del derecho: de todas
      // las posiciones en las que el panel se ve entero, se toma la que tapa
      // menos y no parte nada. Se itera porque arreglar un canto puede meter al
      // otro en una fila nueva — en Entreno pasa siempre: los 15 px que salvan
      // la fila de peso y reps meten el canto de arriba dentro del disparador,
      // y de ahí salen los 56 que lo tapan entero.
      //
      // Cuando el panel tapa el disparador entero la puerta deja de existir:
      // sale del orden de tabulación y su segundo toque cierra, que es lo que
      // hace honesto el `aria-expanded`.
      //
      // Sin tope duro arriba: el tope duro es lo que rompía con el teclado
      // delante. Medido en Entreno con el viewport a 430×602 (un IME de ~330
      // px), el hueco cae en 549, la barra de pestañas sube a 545 y el panel se
      // quedaba con **8 px de alto** — `Guardar nombre` en y606, fuera de la
      // pantalla entera. Los únicos topes son el aire de arriba y lo que esté
      // marcado como intocable por encima del hueco (la gráfica de Progreso),
      // y ninguno de los dos depende de si el teclado está delante.
      const maxLift = cardOnScreen ? Math.floor(slotTop - ceiling) : 0
      let lift = Math.max(0, Math.min(needed, maxLift))

      const rects = crossables()
      const sliceBump = (candidate) => {
        const top = slotTop - candidate
        const bottom = Math.min(top + height, limit)
        let bump = 0
        for (const r of rects) {
          if (r.left >= box.right || r.right <= box.left) continue
          if (r.top < top && r.bottom > top) bump = Math.max(bump, top - r.top)
          if (r.top < bottom && r.bottom > bottom) bump = Math.max(bump, bottom - r.top)
        }
        return bump
      }
      // Ocho vueltas de sobra: cada una despeja al menos una fila y la subida
      // está acotada por el aire de arriba. El tope existe para que un layout
      // imposible no cuelgue la pantalla, no porque se espere llegar a él.
      for (let i = 0; i < 8; i += 1) {
        const bump = sliceBump(lift)
        if (bump <= 0) break
        const next = Math.min(maxLift, Math.ceil(lift + bump))
        if (next <= lift) break
        lift = next
      }

      const panelTop = slotTop - lift
      panel.style.top = `${-lift}px`
      panel.style.maxHeight = `${Math.max(0, Math.floor(limit - panelTop))}px`

      const panelRect = {
        top: panelTop,
        bottom: Math.min(panelTop + height, limit),
        left: box.left,
        right: box.right,
      }
      hideCovered(panelRect)
      setNameOnScreen(nameStillReadable(panelRect, usableBottom))
    }

    fit()
    // El hueco no toma altura nunca. Se deja escrito en vez de darlo por
    // supuesto para que un cambio futuro tenga que borrar esta línea a mano.
    slot.style.height = '0px'

    const vv = window.visualViewport
    vv?.addEventListener('resize', fit)
    window.addEventListener('resize', fit)

    // ── Y al desplazar la página ────────────────────────────────────────────
    // Todo lo que el panel puede partir cuelga del documento y se mueve con
    // él, así que los cantos aguantaban un scroll sin recalcular nada. El
    // borde útil no se mueve: la barra de pestañas y el teclado están clavados
    // al viewport, y en cuanto la tarjeta baja, el pie del panel se les mete
    // debajo. Medido en Progreso abriendo con la página en 857 y subiendo a
    // 735 sin tocar el editor: el panel conservaba la subida de antes, acababa
    // en 905,5 con el canto de la barra en 875, y `Eliminar ejercicio` —44 px,
    // el control más grave que hay aquí dentro— quedaba partido 13,5 px por
    // una superficie opaca. El mismo defecto de esta vuelta, producido por el
    // dedo en vez de por el primer pintado.
    //
    // Un fotograma como mucho: `fit` recorre todos los controles de la página
    // y todo su texto, y eso no puede ir una vez por evento de scroll. En
    // captura porque `scroll` no burbujea y la página puede desplazarse desde
    // un contenedor interior.
    //
    // Esto no mete un salto bajo el pulgar: cuando lo que ata al panel es el
    // canto de abajo, mover la página lo deja clavado donde estaba en pantalla
    // —lo que cambia es su distancia a una tarjeta que sí se ha movido—, y
    // cuando no lo está, es que le sobra sitio y no se mueve nadie.
    let frame = 0
    const hasFrames = typeof requestAnimationFrame === 'function'
    const onScroll = () => {
      if (!hasFrames) {
        fit()
        return
      }
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        fit()
      })
    }
    window.addEventListener('scroll', onScroll, { passive: true, capture: true })
    // El cuerpo, no sólo la caja. El panel crece solo cuando aparece el
    // deshacer del reetiquetado o el segundo paso — y en cuanto `fit` le ha
    // puesto un tope de altura, su
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
    // ── Y lo que crece *por encima* del panel ─────────────────────────────
    // El panel se coloca contra el hueco, y el hueco baja cuando algo aparece
    // más arriba en la columna. Eso pasa exactamente una vez y en el peor
    // momento: al chocar el nombre con uno existente, el bloque de la oferta
    // —156 px en su caso más largo, el de la fusión que además reetiqueta— se
    // pinta *encima* del disparador y empuja al panel hacia abajo con la
    // subida de antes todavía aplicada.
    //
    // Medido en Progreso a 430×932 con la página en 857: el panel pasaba a
    // ocupar 813–943 con `max-height` de 130 calculado para la maquetación
    // anterior, o sea **68 px suyos detrás de la barra de pestañas**, que está
    // a `z-index: 10` contra su 3 y no es `inert`. Ni el observador del panel
    // ni el de sus hijos se enteran: ninguno de los dos ha cambiado de tamaño.
    // El que sí cambia es el documento, así que se vigila el cuerpo.
    //
    // No hay bucle: `fit` sólo escribe `top` y `max-height` sobre una caja
    // absoluta dentro de un hueco de altura cero, así que nada de lo que hace
    // puede cambiar la altura del cuerpo.
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit)
    ro?.observe(panel)
    for (const child of panel.children) ro?.observe(child)
    ro?.observe(document.body)
    return () => {
      vv?.removeEventListener('resize', fit)
      window.removeEventListener('resize', fit)
      window.removeEventListener('scroll', onScroll, true)
      if (frame && hasFrames) cancelAnimationFrame(frame)
      ro?.disconnect()
      release()
    }
    // `nameOnScreen` está aquí a propósito, aunque lo escriba este mismo
    // efecto: el rótulo que aparece cuando el título queda tapado hace el panel
    // más alto, y eso cambia la cuenta. Volver a entrar la rehace antes de
    // pintar, en vez de esperar al `ResizeObserver` y regalar un salto de un
    // fotograma. No hay bucle porque el cambio sólo va en un sentido: el rótulo
    // sube el panel, subir el panel tapa más, y lo que ya estaba tapado no se
    // destapa.
  }, [open, moreOpen, name, nameOnScreen])

  if (!open) return null

  return (
    <div className="editor-inplace-slot" ref={slotRef}>
      <div
        ref={panelRef}
        className="editor-inplace"
        role="dialog"
        aria-label={`Editar ${name}`}
      >
        {/* ── Dos pasos, no un pliegue ──────────────────────────────────────
            El segundo paso **sustituye** al primero en vez de añadirse debajo.
            Medido en Entreno con `Grupo y nota` abierto, desplegándose en
            sitio: el panel pasaba de 130 a 314 px —un 141 % más— y tapaba
            enteros los nueve controles del aparato de la serie. En Progreso,
            el 100 % de la gráfica. Y eso es exactamente el reparto que
            DESIGN.md prohíbe: «cuando una acción rara y una acción por serie se
            pelean por el mismo sitio, gana la de la serie, siempre», con el
            grupo, la nota y el borrado clasificados ahí mismo como acciones
            raras que van «detrás del `⋯`… o a Progreso».

            Un cajón de acciones raras no tiene por qué crecer 184 px sobre los
            controles de la serie que estás entre medias de registrar. Cambiando
            de paso en vez de desplegar, el panel pasa de 128 a 164: dos filas
            de 44 en lugar de una, y ni una sola fila del registro tapada. El
            precio es que el nombre no se ve mientras estás en el segundo paso,
            y se paga poniéndolo en la vuelta, que hay que dibujar de todas
            formas. */}
        {!moreOpen ? (
        <form className="editor-name" onSubmit={onSubmitName}>
          {/* Sólo cuando el panel se ha llevado por delante el único sitio de
              la pantalla que decía qué ejercicio es esto. El campo de abajo
              lleva tu borrador, y un borrador a medio escribir no nombra nada;
              esto lleva el nombre guardado, que es contra lo que estás
              editando. Con el título a la vista no sale: sería el rótulo
              repetido que este panel quitó. */}
          {!nameOnScreen && <p className="editor-context">Editando · {name}</p>}
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
                pulgar.

                Y desde que no hay botón de guardar, éste es además el que
                confirma: cerrar es guardar. No cambia de nombre por eso —lo que
                hace es cerrar, y lo guardado se guarda solo—, pero sí explica
                por qué pasa por `leave` como las otras tres salidas. */}
            <button
              type="button"
              className="editor-close"
              aria-label="Cerrar"
              onClick={leave}
            >
              <span aria-hidden="true">×</span>
            </button>
          </div>
          {/* La fila que antes confirmaba. Ya no confirma nada —no queda nada
              que confirmar— y se queda porque sigue siendo la fila donde vive
              la puerta al segundo paso. Sin cajón no hay fila: un contenedor
              vacío aquí son 8 px de margen sobre el presupuesto de 137. */}
          {more && (
            <div className="editor-commit">
              {/* La puerta al segundo paso, en el vocabulario que la casa ya
                  usa para las puertas: tinta en la etiqueta, `›` apagado, y el
                  nombre del ejercicio en la etiqueta hablada por lo mismo que
                  el campo de arriba.

                  Ya no lleva `aria-expanded`: no despliega nada debajo, cambia
                  el panel de paso. Anunciar «desplegado» un control que en ese
                  momento ni siquiera está en pantalla era la mentira que este
                  panel se ha pasado tres vueltas quitando de otros sitios.

                  El rótulo nombra lo que hay dentro, no el contenedor: antes
                  ponía `Más ajustes`, que es el nombre más vago disponible. Y
                  durante tres vueltas lo escribió el llamante porque el cajón
                  no llevaba lo mismo en las dos pantallas — grupo y nota en
                  Entreno, grupo y borrado en Progreso —, que es precisamente el
                  defecto que se ha arreglado: el encargo pedía **un** editor
                  con los cinco actos en las dos pantallas. Ahora el cajón lleva
                  lo mismo en las dos y el rótulo vuelve a ser una constante
                  (`MORE_LABEL`). Sigue entrando por prop para que una tercera
                  pantalla con otro reparto no tenga que mentir.

                  Cambiar de paso retira el campo del nombre de la pantalla, así
                  que cuenta como dejar de mirarlo: se guarda antes de irse. Sin
                  esto, la única forma de perder un renombrado escrito sería
                  exactamente la que más se parece a seguir dentro del editor. */}
              <button
                type="button"
                className="editor-more"
                aria-label={`${moreLabel} de ${name}`}
                onClick={() => {
                  onCommitRef.current?.()
                  setMoreOpen(true)
                }}
              >
                {moreLabel}
              </button>
            </div>
          )}
        </form>
        ) : (
          <div className="editor-more-pane">
            {/* La cabecera del segundo paso hace tres cosas con una fila de 44:
                vuelve, dice en qué ejercicio estás —el campo del nombre no está
                a la vista aquí, así que alguien tiene que decirlo— y deja el
                aspa donde el pulgar ya la buscó en el primer paso. La flecha es
                la de la casa (`← Días` en la cabecera de un entreno), no el `›`
                de las puertas: aquí se sale, no se entra. */}
            <div className="editor-row editor-row-back">
              <button
                type="button"
                className="editor-back"
                aria-label={`Volver al nombre de ${name}`}
                onClick={() => {
                  // La vuelta se lleva la nota de la pantalla, igual que la ida
                  // se llevaba el nombre. Mismo trato.
                  onCommitRef.current?.()
                  setMoreOpen(false)
                }}
              >
                <span className="editor-back-arrow" aria-hidden="true">
                  ←
                </span>
                <span className="editor-back-name">{name}</span>
              </button>
              <button
                type="button"
                className="editor-close"
                aria-label="Cerrar"
                onClick={leave}
              >
                <span aria-hidden="true">×</span>
              </button>
            </div>
            {more}
          </div>
        )}
      </div>
    </div>
  )
}

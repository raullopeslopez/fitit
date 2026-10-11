import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { fold } from './format.js'
import { MUSCLE_GROUPS, muscleColor, UNGROUPED } from './muscles.js'

/**
 * El editor de un ejercicio: una hoja que sube desde abajo.
 *
 * ── Por qué una hoja, y no el panel en sitio ─────────────────────────────────
 *
 * El panel anterior se abría *dentro* de la tarjeta, sin tapar nada, y para
 * cumplirlo medía la página entera en cada scroll, cada cambio de tamaño y
 * cada cambio del cuerpo: subía, se encogía, marcaba `inert` lo que quedaba
 * debajo y lo devolvía. Era la respuesta correcta a una PWA en un navegador,
 * donde el teclado no avisa y la barra de pestañas tapa sin decirlo. En la APK
 * todo eso trabaja contra el sistema: el `<select>` del grupo abre un selector
 * nativo que cambia el viewport, el panel se recolocaba al cambiar, y el
 * selector se quedaba parpadeando.
 *
 * Una hoja no tiene esa pelea. Es de ancho completo, vive pegada al borde de
 * abajo —y con `interactive-widget=resizes-content` el borde de abajo es el
 * teclado cuando lo hay— y el fondo oscurecido dice que la sesión sigue ahí,
 * esperando. No hay nada que medir, así que no hay nada que se recoloque.
 *
 * ── Un solo paso ─────────────────────────────────────────────────────────────
 *
 * Los dos pasos del panel existían porque no cabía: cada fila de más tapaba una
 * fila del registro. La hoja tapa con el fondo, no con su altura, así que el
 * nombre, el grupo, la nota y eliminar van juntos y cada uno a un toque.
 *
 * ── Salir es guardar ─────────────────────────────────────────────────────────
 *
 * No hay botón de guardar. El fondo, el aspa, Escape, el gesto de atrás y
 * arrastrar la hoja hacia abajo cierran, y las cinco salidas pasan por
 * `leave`, que manda lo escrito antes de cerrar: si una guardase y otra no, el
 * resultado dependería de dónde aterrizó el pulgar. Irse de la app también
 * guarda, sin cerrar.
 */
export function ExerciseEditor({
  name,
  open,
  onClose,
  // Manda al servidor lo que haya escrito en los campos de texto. Se llama
  // antes de cada salida. Tiene que ser idempotente: dos salidas seguidas
  // —Intro y después el aspa— no pueden valer por dos renombrados.
  onCommit,
  nameDraft,
  onNameDraftChange,
  onSubmitName,
  // Las filas de debajo del nombre: grupo, nota y eliminar. Las pone quien
  // llama porque cada pantalla sabe qué hace «eliminar» en ella.
  more,
  // Los ejercicios que ya tienes, `{ name, muscle_group }`, sin el propio. Con
  // ellos el campo del nombre busca como el de Progreso, y elegir uno llama a
  // `onPick` con su nombre en vez de renombrar. Sin ellos, el campo sólo
  // renombra.
  candidates,
  onPick,
}) {
  const sheetRef = useRef(null)

  // `onClose` llega como una lambda nueva en cada render de quien llama; los
  // efectos de abajo la leen de aquí para no volver a montarse en cada uno —
  // el del historial metería una entrada por render y «atrás» dejaría de
  // funcionar.
  const onCloseRef = useRef(onClose)
  const onCommitRef = useRef(onCommit)
  useEffect(() => {
    onCloseRef.current = onClose
    onCommitRef.current = onCommit
  })

  const leave = () => {
    onCommitRef.current?.()
    onCloseRef.current()
  }

  // De dónde veniste, para devolverte ahí al cerrar. Sin esto el foco cae en
  // `body` y quien navega con teclado o lector vuelve al principio de la página.
  const openerRef = useRef(null)
  useEffect(() => {
    if (open) {
      openerRef.current = document.activeElement
      return
    }
    const opener = openerRef.current
    openerRef.current = null
    if (opener && typeof opener.focus === 'function' && document.contains(opener)) {
      opener.focus()
    }
  }, [open])

  // El foco entra en la hoja, pero no en el campo del nombre: enfocarlo
  // levantaría el teclado cada vez, y ahora la hoja es también la del grupo y
  // la nota — el teclado taparía justo lo que venías a tocar. Corregir el
  // nombre cuesta un toque más; cambiar el grupo no cuesta bajar un teclado.
  useEffect(() => {
    if (open) sheetRef.current?.focus()
  }, [open])

  // Escape cierra.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') leave()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  // Irse de la app —bloquear, cambiar de aplicación, que el sistema la mate—
  // guarda lo escrito sin cerrar. `hidden` es el único aviso que llega a tiempo
  // cuando el sistema congela la página; `pagehide` cubre recargar.
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

  // El gesto de atrás de Android cierra la hoja en vez de sacarte del entreno.
  // La entrada del historial se devuelve al cerrar por otra vía; si vino de
  // `popstate` el sistema ya la consumió y `back()` nos sacaría de la pantalla.
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

  // Modal de verdad, no sólo de palabra: `aria-modal` sin nada detrás que lo
  // respalde dejaba la sesión entera en el orden de tabulación bajo el fondo.
  // Todo lo que cuelga de `body` salvo la hoja queda `inert` mientras está
  // arriba. Y la página de detrás no se desplaza: el dedo que arrastra dentro
  // de la hoja no puede acabar moviendo la sesión.
  useEffect(() => {
    if (!open) return undefined
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    const muted = [...document.body.children].filter(
      (el) => !el.contains(sheetRef.current) && !el.hasAttribute('inert'),
    )
    for (const el of muted) el.setAttribute('inert', '')
    return () => {
      document.body.style.overflow = overflow
      for (const el of muted) el.removeAttribute('inert')
    }
  }, [open])

  // Arrastrar el asa hacia abajo cierra, que es lo que un pulgar de Android
  // prueba primero con una hoja. La hoja sigue al dedo; pasado un umbral se
  // va, y si no, vuelve a su sitio.
  const [drag, setDrag] = useState(0)
  const dragStart = useRef(null)
  const onGrabDown = (e) => {
    dragStart.current = e.clientY
    e.currentTarget.setPointerCapture?.(e.pointerId)
  }
  const onGrabMove = (e) => {
    if (dragStart.current == null) return
    setDrag(Math.max(0, e.clientY - dragStart.current))
  }
  const onGrabUp = () => {
    if (dragStart.current == null) return
    const dragged = drag
    dragStart.current = null
    setDrag(0)
    if (dragged > 80) leave()
  }

  if (!open) return null

  // Mientras el campo diga el nombre que ya tiene no hay nada que buscar: abrir
  // la hoja no puede soltarte una lista encima del grupo y la nota.
  const query = nameDraft.trim()
  const matches =
    candidates && onPick && query && fold(query) !== fold(name)
      ? candidates.filter((c) => fold(c.name).includes(fold(query))).slice(0, 8)
      : []

  // La hoja de la casa (`.sheet-scrim` / `.sheet`, la de Días y Comida), no una
  // nueva: el fondo es una salida más, y guarda como las otras.
  return createPortal(
    <div className="sheet-scrim" onClick={leave}>
      <div
        ref={sheetRef}
        className="sheet editor-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={`Editar ${name}`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        style={drag ? { transform: `translateY(${drag}px)` } : undefined}
      >
        <div
          className="editor-sheet-grab"
          aria-hidden="true"
          onPointerDown={onGrabDown}
          onPointerMove={onGrabMove}
          onPointerUp={onGrabUp}
          onPointerCancel={onGrabUp}
        >
          <span className="sheet-grip" />
        </div>
        {/* El campo *es* el título: la cara y el cuerpo del nombre de un
            ejercicio en cualquier otra pantalla, porque es el mismo dato. Lo
            que lo delata como editable es el marco. Intro guarda y cierra. */}
        <form
          className="editor-head"
          onSubmit={(e) => {
            onSubmitName(e)
            onCloseRef.current()
          }}
        >
          <input
            className="editor-name-field"
            // Con el nombre dentro porque en un superset hay varias tarjetas
            // abiertas y un «Nombre» a secas no dice de cuál.
            aria-label={`Nombre de ${name}`}
            value={nameDraft}
            onChange={(e) => onNameDraftChange(e.target.value)}
            maxLength={120}
            enterKeyHint="done"
          />
          <button type="button" className="editor-close" aria-label="Cerrar" onClick={leave}>
            <span aria-hidden="true">×</span>
          </button>
        </form>
        {/* Elegir uno no renombra nada: es decir «esto era otro ejercicio». Lo
            que haga con ello lo decide quien llama; la hoja se cierra sin
            mandar el nombre escrito, que ya no es un renombrado. */}
        {matches.length > 0 && (
          <ul className="search-results editor-matches" aria-label="Ejercicios que ya tienes">
            {matches.map((c) => (
              <li key={c.name}>
                <button
                  type="button"
                  className="set-row"
                  onClick={() => {
                    onPick(c.name)
                    onCloseRef.current()
                  }}
                >
                  <span
                    className="dot"
                    aria-hidden="true"
                    style={{ '--chip': muscleColor(c.muscle_group) }}
                  />
                  {c.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {more && <div className="sheet-body">{more}</div>}
      </div>
    </div>,
    document.body,
  )
}

/**
 * El grupo muscular, como fichas. Era un `<select>`, y en la APK el `<select>`
 * abre un selector del sistema encima de la hoja: otra capa, otro gesto para
 * cerrarla, y el parpadeo. Son diez valores que te sabes de memoria, así que
 * caben a la vista y elegir es un toque.
 *
 * Un grupo de radios con cara de ficha: se recorre con flechas, se anuncia
 * como una elección entre varias y dice cuál está puesta.
 */
export function MusclePicker({ name, value, onChange }) {
  const options = [...MUSCLE_GROUPS, null]
  return (
    <div className="editor-row editor-row-muscle">
      <span className="editor-row-label" id={`exgroup-${name}`}>
        Grupo
      </span>
      <div
        className="muscle-picker"
        role="radiogroup"
        aria-label={`Grupo muscular de ${name}`}
        aria-describedby={`exgroup-${name}`}
      >
        {options.map((m) => {
          const on = (value ?? null) === m
          return (
            <button
              key={m ?? 'none'}
              type="button"
              role="radio"
              aria-checked={on}
              className={`chip muscle-pick${on ? ' is-active' : ''}`}
              style={{ '--chip': muscleColor(m) }}
              onClick={() => {
                if (!on) onChange(m)
              }}
            >
              <span className={`dot${m ? '' : ' dot-new'}`} aria-hidden="true" />
              {m ?? UNGROUPED}
            </button>
          )
        })}
      </div>
    </div>
  )
}

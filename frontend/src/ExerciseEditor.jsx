import { useEffect, useRef } from 'react'

/**
 * The one place an exercise is edited, shared by Entreno and Progreso.
 *
 * There used to be three doors onto one concept: `Editar ejercicio` inside an
 * open card in Entreno, `Corregir` at the foot of the chart card in Progreso,
 * and — separately, on the same screen — tapping the chart's title to rename.
 * Three doors, three vocabularies, and none of them holding the whole set of
 * things you can say about an exercise. This component is the room they all
 * lead into now; the callers only own the trigger.
 *
 * It is a **sheet, not a fold**, and that is the whole point of the rebuild.
 * The old folds expanded inside the card, so opening the editor in Entreno
 * pushed the page from 1335px to 1600px — 257px of log shoved off the screen to
 * make room for a rename you do twice a year. A fixed overlay costs the content
 * column exactly zero pixels: the log is still where your thumb left it when
 * you close this, because it never moved.
 *
 * The sheet is the one Días already uses for back-dating (`.sheet-scrim` /
 * `.sheet`, bottom-anchored, because that is where the thumb is). Same pattern,
 * not a second one — a phone with two different kinds of overlay is a phone
 * where you learn the gesture twice.
 *
 * The body is deliberately empty for now: the fields land here in the pieces
 * that follow. A caller may pass its current fields as `children` in the
 * meantime, which is what keeps the app whole between one piece and the next.
 */
export function ExerciseEditor({ name, open, onClose, children }) {
  const sheetRef = useRef(null)

  // Abrir *es* empezar a editar. El botón se llama «Editar ejercicio», así que
  // si al abrirse el cursor sigue en el botón, el toque no ha editado nada:
  // hace falta un segundo toque para meterse en el campo, y la puerta miente
  // sobre lo que hace. Aquí y no en las dos pantallas, porque es una promesa
  // de la hoja, no de quien la abre.
  //
  // Al final del texto, no seleccionado entero: lo normal es arreglar una
  // errata en un nombre que quieres conservar («Press de banca»), no escribir
  // otro encima. Un select-all convierte la primera tecla en borrarlo todo.
  //
  // El primer campo de texto de la hoja, no un id concreto: hoy ese campo es
  // `Nombre` en las dos pantallas, y cuando las piezas siguientes rehagan el
  // cuerpo lo seguirá siendo — lo que se promete es «el primer campo», que es
  // lo que ve el pulgar. Si no hay ninguno (hoy, sin `children`), no se toca
  // el foco: mejor que no pase nada a que salte a un sitio que no esperabas.
  //
  // Sí, esto levanta el teclado en el móvil. Es el precio, y es el barato: el
  // teclado se baja con un gesto que no rompe nada, mientras que el cursor que
  // falta cuesta un toque *cada vez*.
  useEffect(() => {
    if (!open) return
    const field = sheetRef.current?.querySelector('input')
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

  // Escape closes it. Registered only while it is open, so nothing on the page
  // has to know this component exists when it doesn't.
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="sheet-scrim" onClick={onClose}>
      <div
        ref={sheetRef}
        className="sheet exercise-editor"
        role="dialog"
        aria-modal="true"
        aria-label={`Editar ${name}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* The header is the exercise, said once. Linear's properties panel
            never prints a field's name beside its value, and the same logic
            runs one level up: the sheet is about this exercise, so the name is
            the title, and nothing inside needs to repeat it. */}
        <div className="editor-head">
          <h2 className="editor-name">{name}</h2>
          {/* An explicit way out, next to the way in. The scrim closes it too,
              but a scrim is a gesture you have to already know; this is the one
              a thumb finds. 44px, like everything else here. */}
          <button
            type="button"
            className="editor-close"
            aria-label="Cerrar"
            onClick={onClose}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        {children ?? (
          <p className="hint editor-placeholder">Aquí irán los ajustes del ejercicio.</p>
        )}
      </div>
    </div>
  )
}

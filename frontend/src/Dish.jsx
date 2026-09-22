import { useEffect, useRef, useState } from 'react'

import { createDish, logDish, searchFoods } from './api.js'
import { formatMacro } from './food.js'

// Lo que se puede hacer con un plato. La air fryer no está en CIQUAL —es una
// tabla francesa de alimentos, no un catálogo de electrodomésticos—, así que el
// modo es del plato y no del alimento.
const METODOS = [
  ['', 'Sin especificar'],
  ['air_fryer', 'Air fryer'],
  ['plancha', 'A la plancha'],
  ['sarten', 'En sartén'],
  ['horno', 'Al horno'],
  ['cocido', 'Cocido'],
  ['crudo', 'Crudo'],
]

/**
 * Tus platos, un toque cada uno.
 *
 * Mismo trato que los frecuentes: el chip lleva dentro lo que cuesta y tocarlo
 * registra, sin una hoja de por medio. Una ración por toque — dos raciones son
 * dos toques, que es más barato de entender que un selector que nadie usaría
 * más de una vez al mes.
 */
export function DishChips({ dishes, slot = null, onLogged }) {
  const [enviando, setEnviando] = useState(null)

  // Sin platos no hay sección: un encabezado sobre una lista vacía es ruido
  // que ocupa el sitio de lo que sí hay.
  if (!dishes || dishes.length === 0) return null

  async function registrar(dish) {
    setEnviando(dish.id)
    try {
      await logDish(dish.id, { servings: 1, meal_slot: slot })
      onLogged(dish)
    } finally {
      setEnviando(null)
    }
  }

  return (
    // Mismas clases que los frecuentes a propósito: es el mismo gesto —un chip
    // que lleva dentro lo que cuesta y que al tocarlo registra—, así que no
    // merece un vocabulario visual propio.
    <section className="food-frequent dish-chips">
      <p className="card-eyebrow">Tus platos</p>
      <div className="food-frequent-chips">
        {dishes.map((dish) => (
          <button
            key={dish.id}
            type="button"
            className="chip food-frequent-chip dish-chip"
            disabled={enviando === dish.id}
            onClick={() => registrar(dish)}
          >
            <span className="food-frequent-name">{dish.name}</span>
            <span className="food-frequent-grams">
              1 ración · {formatMacro(dish.per_serving?.kcal)} kcal
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}

/**
 * Dar de alta un plato.
 *
 * Pide tres cosas que un alimento no necesita y un plato sí: en cuántas
 * raciones sale, **cómo se pesa** y cómo se cocina. La primera es la que
 * convierte el plato en una cifra que se come; la segunda es la que impide que
 * mienta —un filete pierde en torno a un cuarto de su peso al cocinarse—, y por
 * eso no tiene opción vacía.
 */
export function NewDish({ slot = null, onCreated, onCancel }) {
  const [name, setName] = useState('')
  const [servings, setServings] = useState('1')
  const [basis, setBasis] = useState('raw')
  const [method, setMethod] = useState('')
  const [ingredients, setIngredients] = useState([])
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState([])
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    clearTimeout(timer.current)
    if (!query.trim()) {
      setHits([])
      return undefined
    }
    timer.current = setTimeout(async () => {
      try {
        setHits(await searchFoods(query.trim()))
      } catch {
        setHits([])
      }
    }, 180)
    return () => clearTimeout(timer.current)
  }, [query])

  function añadir(food) {
    setIngredients((prev) =>
      prev.some((i) => i.food_id === food.id)
        ? prev
        : [...prev, { food_id: food.id, food_name: food.name, grams: '' }],
    )
    setQuery('')
    setHits([])
  }

  function pesar(foodId, grams) {
    setIngredients((prev) => prev.map((i) => (i.food_id === foodId ? { ...i, grams } : i)))
  }

  function quitar(foodId) {
    setIngredients((prev) => prev.filter((i) => i.food_id !== foodId))
  }

  async function guardar(event) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Ponle nombre al plato.')
      return
    }
    if (ingredients.length === 0) {
      setError('Un plato necesita al menos un ingrediente.')
      return
    }
    const pesados = ingredients.map((i) => ({ food_id: i.food_id, grams: Number(String(i.grams).replace(',', '.')) }))
    if (pesados.some((i) => !Number.isFinite(i.grams) || i.grams <= 0)) {
      setError('Dime cuántos gramos lleva cada ingrediente.')
      return
    }
    const raciones = Number(String(servings).replace(',', '.'))
    if (!Number.isFinite(raciones) || raciones <= 0) {
      setError('Las raciones tienen que ser un número mayor que cero.')
      return
    }

    setError(null)
    setSaving(true)
    try {
      const dish = await createDish({
        name: name.trim(),
        servings: raciones,
        basis,
        method: method || null,
        ingredients: pesados,
      })
      onCreated(dish)
    } catch (err) {
      setError(err?.message ?? 'No se ha podido guardar el plato.')
    } finally {
      setSaving(false)
    }
  }

  return (
    // `.food-screen` y no un `.sheet-body` suelto, igual que el alta de
    // alimento: esta pantalla **ocupa** la pantalla. Sin ella el formulario se
    // pintaba debajo del día, con la cola de Comida asomando encima — se veía
    // como dos pantallas apiladas, que es exactamente lo que no es.
    <div className="food-screen" role="dialog" aria-modal="true" aria-label="Alta de plato">
      <header className="food-screen-head">
        <p className="food-screen-title">
          <span className="card-eyebrow">Alta de plato</span>
          <span className="food-screen-slot">Nuevo plato</span>
        </p>
        <button type="button" className="link-btn" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </header>

      <form className="food-screen-body new-dish" onSubmit={guardar}>

      <div className="field">
        <label htmlFor="dish-name">Nombre</label>
        <input
          id="dish-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Lentejas de mi madre"
          autoComplete="off"
        />
      </div>

      <div className="dish-row">
        <div className="field">
          <label htmlFor="dish-servings">Raciones</label>
          <input
            id="dish-servings"
            inputMode="decimal"
            value={servings}
            onChange={(e) => setServings(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="dish-basis">Cómo lo peso</label>
          {/* Sin opción vacía a propósito: es la decisión que, sin tomar, hace
              que el plato mienta a medias. */}
          <select id="dish-basis" value={basis} onChange={(e) => setBasis(e.target.value)}>
            <option value="raw">En crudo</option>
            <option value="cooked">Ya cocinado</option>
          </select>
        </div>
      </div>

      <div className="field">
        <label htmlFor="dish-method">Cómo lo cocino</label>
        <select id="dish-method" value={method} onChange={(e) => setMethod(e.target.value)}>
          {METODOS.map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="dish-search">Añadir ingrediente</label>
        <input
          id="dish-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Busca un alimento"
          autoComplete="off"
        />
      </div>

      {hits.length > 0 && (
        <ul className="food-results dish-hits">
          {hits.map((food) => (
            <li key={food.id}>
              <button type="button" className="food-result" onClick={() => añadir(food)}>
                <span className="food-result-name">{food.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {ingredients.length > 0 && (
        <ul className="dish-ingredients">
          {ingredients.map((i) => (
            <li key={i.food_id} className="dish-ingredient">
              <span className="dish-ingredient-name">{i.food_name}</span>
              <input
                className="dish-ingredient-grams"
                inputMode="decimal"
                aria-label={`Gramos de ${i.food_name}`}
                value={i.grams}
                onChange={(e) => pesar(i.food_id, e.target.value)}
                placeholder="g"
              />
              <button
                type="button"
                className="dish-ingredient-drop"
                aria-label={`Quitar ${i.food_name}`}
                onClick={() => quitar(i.food_id)}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p role="status" className="dish-error">
          {error}
        </p>
      )}

      {/* Un solo `Cancelar`, el de la cabecera: dos salidas idénticas en una
          pantalla son una de más. */}
      <div className="dish-actions">
        <button type="submit" className="primary" disabled={saving}>
          Guardar plato
        </button>
      </div>
      </form>
    </div>
  )
}

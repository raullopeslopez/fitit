import { useEffect, useState } from 'react'

import { createWorkout, getPreviousMarks, logSet } from './api.js'

function formatSet(set) {
  return `${set.weight} kg x ${set.reps}`
}

export default function Workout() {
  const [workout, setWorkout] = useState(null)
  const [exerciseInput, setExerciseInput] = useState('')
  const [currentExercise, setCurrentExercise] = useState('')
  const [previous, setPrevious] = useState(null)
  const [reps, setReps] = useState('')
  const [weight, setWeight] = useState('')

  useEffect(() => {
    createWorkout().then(setWorkout)
  }, [])

  async function handleAddExercise(event) {
    event.preventDefault()
    const name = exerciseInput.trim()
    if (!name) return
    setCurrentExercise(name)
    setPrevious(await getPreviousMarks(name))
  }

  async function handleLogSet(event) {
    event.preventDefault()
    if (!workout || !currentExercise) return
    const updated = await logSet(workout.id, {
      exercise_name: currentExercise,
      reps: Number(reps),
      weight: Number(weight),
      unit: 'kg',
    })
    setWorkout(updated)
    setReps('')
    setWeight('')
  }

  const setsForCurrent = workout
    ? workout.sets.filter((s) => s.exercise_name === currentExercise)
    : []

  return (
    <section>
      <form onSubmit={handleAddExercise}>
        <label htmlFor="exercise">Exercise</label>
        <input
          id="exercise"
          value={exerciseInput}
          onChange={(e) => setExerciseInput(e.target.value)}
          placeholder="e.g. Bench Press"
        />
        <button type="submit">Add exercise</button>
      </form>

      {currentExercise && (
        <div>
          <h2>{currentExercise}</h2>
          {previous && previous.found ? (
            <p>
              <strong>Last time:</strong> {previous.sets.map(formatSet).join(', ')}
            </p>
          ) : (
            <p>No previous marks yet.</p>
          )}

          <form onSubmit={handleLogSet}>
            <label htmlFor="reps">Reps</label>
            <input
              id="reps"
              inputMode="numeric"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
            />
            <label htmlFor="weight">Weight (kg)</label>
            <input
              id="weight"
              inputMode="decimal"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
            />
            <button type="submit">Log set</button>
          </form>

          <ol>
            {setsForCurrent.map((set) => (
              <li key={set.id}>{formatSet(set)}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

// Grabar una nota de voz y pararla sola cuando dejas de hablar
// (docs/registro-por-voz.md, pregunta 7).
//
// `MediaRecorder` graba; un `AnalyserNode` mide el volumen cada 100 ms. La parada
// sólo cuenta silencio **después** de haber oído algo: si no, pararía antes de
// que empezaras. Tres finales:
//
//   - 2 s de silencio tras haber hablado → para sola.
//   - 8 s sin oír nada → para (no has dicho nada; el servidor lo dirá).
//   - 30 s → para, aunque sigas: la cocina hace ruido y el silencio no llega.
//
// En la APK funciona igual: el WebView de Capacitor pide el permiso de micrófono
// (RECORD_AUDIO en el manifest) al llamar a `getUserMedia`.

export const SILENCE_MS = 2000
export const NOTHING_MS = 8000
export const MAX_MS = 30000
// RMS por debajo del cual es silencio. Medido a ojo: una voz normal a un palmo
// del móvil anda por 0,05–0,2; una cocina en silencio, por debajo de 0,01.
const QUIET = 0.02
const TICK_MS = 100

export function canRecord() {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof window !== 'undefined' &&
    typeof window.MediaRecorder !== 'undefined'
  )
}

// Empieza a grabar. Devuelve `{ stop, done }`: `stop()` para a mano («Listo») y
// `done` es la promesa del audio (`Blob`). `onTick(ms)` cuenta el tiempo.
export async function startRecording({ onTick = () => {} } = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const recorder = new window.MediaRecorder(stream)
  const chunks = []
  recorder.ondataavailable = (e) => {
    if (e.data?.size) chunks.push(e.data)
  }

  const Ctx = window.AudioContext || window.webkitAudioContext
  const audio = Ctx ? new Ctx() : null
  const analyser = audio?.createAnalyser()
  if (audio && analyser) audio.createMediaStreamSource(stream).connect(analyser)
  const samples = analyser ? new Float32Array(analyser.fftSize) : null

  const started = Date.now()
  let heard = false
  let quietSince = null

  const done = new Promise((resolve) => {
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      audio?.close?.()
      resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
    }
  })

  function stop() {
    clearInterval(timer)
    if (recorder.state !== 'inactive') recorder.stop()
  }

  const timer = setInterval(() => {
    const now = Date.now()
    const elapsed = now - started
    onTick(elapsed)
    if (elapsed >= MAX_MS) return stop()
    if (!samples) return
    analyser.getFloatTimeDomainData(samples)
    let sum = 0
    for (const s of samples) sum += s * s
    const loud = Math.sqrt(sum / samples.length) > QUIET
    if (loud) {
      heard = true
      quietSince = null
    } else if (heard) {
      quietSince ??= now
      if (now - quietSince >= SILENCE_MS) stop()
    } else if (elapsed >= NOTHING_MS) {
      stop()
    }
  }, TICK_MS)

  recorder.start()
  return { stop, done }
}

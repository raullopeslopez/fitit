# Widgets para controlar el entreno en curso — revisión

Pregunta: ¿cómo se añade a Fitit un widget que controle la sesión en marcha (ver el
descanso, apuntar «+1 serie») sin abrir la app? Esto es la revisión, no la implementación.
Datos de npm del 2026-09-25.

## TL;DR

- **Sólo tiene sentido en el APK.** Una PWA en Android no puede tener widgets (el
  miembro `widgets` del manifest sólo lo entiende Windows 11). iOS no está construido
  (fase 3 de `app-nativa.md`). Así que esto es Android, en Kotlin/Java, dentro de
  `frontend/android`, y la PWA no cambia.
- **Ya existe un mando a distancia del entreno: la notificación.** En la PWA la sirve el
  service worker; en el APK, `platform/notifyNative.js` con notificaciones locales. El
  widget es una **segunda pantalla del mismo estado**, no una función nueva: lo que le
  falta a la app es un sitio nativo donde ese estado viva, y ese sitio sirve a los dos.
- **Recomendación: plugin local propio (~250 líneas de Java + un layout), sin dependencia
  nueva.** Los dos plugins de widgets que están vivos aportan poco (uno) o son demasiado
  jóvenes y raros (el otro). Detalle abajo.
- **Lo que un widget puede y no puede:** cuenta atrás en vivo sin despertar la app
  (`Chronometer` con cuenta atrás), un botón «+1 serie» que **no abre la app** (mejor que
  la notificación de hoy en el APK, que sí la abre), y un toque en el resto que lleva a
  Entreno. **No puede** tener un campo de texto: «Otra serie» (peso × reps tecleados) se
  queda en la notificación. Y en la **pantalla de bloqueo** de un teléfono no hay
  widgets: ahí sigue mandando la notificación.

## Qué hay hoy y qué se reutiliza

El estado que un widget necesita ya se calcula y ya viaja. En cada serie registrada,
`Workout.jsx` llama a `handOverSession`, que entrega a `startRestNotice` un objeto `rest`:

```
{ endsAt, seconds, workoutId, series, payload: { exercise_name, weight, reps, kind… } }
```

(`token` y `pending` van también, pero `notifyNative.js` los quita antes de escribir nada
en disco: una notificación no es sitio para una credencial. El widget hereda esa regla.)

Y la escritura ya tiene una sola puerta: el toque en «+1 serie» **no envía nada**, apunta
una entrada `{ tmpId, workoutId, payload + performed_at }` en `fitit_lock_sets`, y la
página la recoge al volver (`claimLockScreenSets` → cola `fitit_outbox` → `flushQueue`).
Un widget tiene que escribir en esa misma lista y nada más; así se conserva el orden de
`set_index` (DESIGN.md, 2026-07-25) sin tocar una línea del backend.

**El problema es dónde vive eso.** `platform/storage.js` es `localStorage` del WebView, y
`fitit_lock_sets` también. Un `AppWidgetProvider` corre en el proceso de la app pero no
puede leer el `localStorage` de un WebView. Hace falta un puente: `SharedPreferences`,
que sí leen los dos lados. Eso es lo único que la app no tiene todavía.

## Opciones para el puente

| Opción | Qué es | Vivo | Veredicto |
|---|---|---|---|
| **Plugin local propio** (`SessionPlugin.java`, registrado en `MainActivity`) | Tres métodos: `publish(rest)`, `clear()`, `claim()`, sobre `SharedPreferences`. El widget y su receptor de toques van al lado. | — | **Elegido.** Es lo que hacen los otros dos por debajo, sin dependencia, y la escritura de series queda en un solo sitio nativo |
| `capacitor-widget-bridge` | `setItem`/`getItem` sobre `SharedPreferences` + `reloadAllTimelines()`. El `AppWidgetProvider` lo escribes tú igual | MIT · 8.1.0 · mar 2026 · 2,9k/sem · Cap 8 | Descartado: por el criterio de `app-nativa.md`, entra un plugin sólo si da algo que no tengamos. Esto son 40 líneas de Java |
| `@capgo/capacitor-widget-kit` | Widgets desde SVG con «hotspots», temporizadores y eventos; trae Live Activities de iOS y hasta un ejemplo de flujo de entreno | MPL-2.0 · 8.1.10 · sep 2026 · **256/sem** · Cap 8 | Descartado ahora: muy joven, poco uso, y rasteriza SVG en un `ImageView` —el texto no sigue la fuente ni el tamaño del sistema y no hay accesibilidad—. **Reconsiderar en la fase iOS** por las Live Activities |
| `capacitor-live-activities`, `@capgo/capacitor-live-activities` | Sólo iOS | — | Fuera hasta la fase 3 |

## Diseño propuesto

### El widget

Un widget «Sesión en curso», 4×1 (una franja) con variante 2×2. Con sesión viva:

```
Press banca                          [ +1 serie ]
32,5 kg x 12 · 4 series
Descanso  01:23
```

- Título: `exercise_name`. Segunda línea: la serie que repite y cuántas lleva, el mismo
  texto que ya produce `restText()` en `notifyNative.js` (reutilizar la función, no
  copiar el formato).
- Tercera línea: cuenta atrás hasta `endsAt` con un `Chronometer` en cuenta atrás
  (`setChronometerCountDown`, disponible desde API 24; `minSdk` es 26). La lleva el
  launcher solo: **cero despertares** de la app durante el descanso. Al llegar a cero
  pasa a `Descanso terminado`; con `Descanso: Sin` la línea no aparece.
- Botón `+1 serie`: `PendingIntent.getBroadcast` a un receptor propio. **No abre la
  app.** Cualquier otro punto del widget abre Entreno en la sesión (`MainActivity`, que
  ya es `singleTask`; Entreno ya reanuda desde `fitit_rest_until`).
- Sin sesión: `Sin sesión en curso` y un toque abre la app. Nada de `Empezar entreno`
  desde el widget: crear la sesión pide al servidor y eso es trabajo de la página.
- Aspecto: tokens de `DESIGN.md` en `res/values` (papel `#f4f2ee` / tinta `#16181b`,
  oscuro `#0b0c0e` / `#f2f3f5`, ámbar `#E4571B` / `#FF6A2C` con tinta `--on-accent` en
  el botón), cifras en tabular. Geist Mono no está en el APK: o se mete como fuente en
  `res/font` o las cifras van en la mono del sistema. Es una decisión de diseño que
  hay que tomar con `DESIGN.md` delante, no aquí.

### El flujo de escritura

1. `notifyNative.startNatively(rest)` llama además a `Session.publish(rest)`: guarda el
   JSON (sin token) en `SharedPreferences` y pide `AppWidgetManager.updateAppWidget`.
   `stopNatively()` → `Session.clear()`: borra y pinta «Sin sesión».
2. Toque en `+1 serie` (receptor nativo): hace **lo mismo que `logAnother`** en
   `notifyNative.js` —apunta la entrada con `performed_at` del toque en la lista de
   pendientes, `series + 1`, `endsAt = ahora + seconds`—, repinta el widget y republica
   la notificación con el mismo contenido. Envía: nada.
3. La lista de pendientes (`fitit_lock_sets`) **se muda a `SharedPreferences`**, y
   `claimNatively()` pasa a leerla por el plugin (`Session.claim()`), que la devuelve y
   la vacía. Notificación y widget escriben en la misma lista; la página sigue siendo
   la única que vacía la cola. Es el único cambio en JS que toca algo existente.

Con eso, la notificación del APK puede dejar de abrir la app: sus acciones se pueden
enrutar al mismo receptor. Es un efecto secundario, no el objetivo, y va como paso
aparte porque cambia una decisión ya tomada (`app-nativa.md`, fase 2).

### Dónde va cada cosa

```
frontend/android/app/src/main/java/io/github/raullopeslopez/fitit/
  SessionPlugin.java       publish / clear / claim  (~80 líneas)
  SessionStore.java        el SharedPreferences y el JSON  (~60)
  SessionWidget.java       AppWidgetProvider: pinta RemoteViews  (~100)
  SessionActionReceiver.java  «+1 serie»: apunta, repinta, republica  (~60)
  MainActivity.java        registerPlugin(SessionPlugin.class)
res/layout/widget_session.xml · res/xml/widget_session_info.xml · AndroidManifest (receiver ×2)
frontend/src/platform/notifyNative.js   llama al plugin; `claimNatively` lee de él
frontend/src/platform/session.js        el import del plugin, con stub en web
```

## Lo que no se puede, y por qué

- **Campo de texto.** `RemoteViews` no admite `EditText`; «Otra serie» sigue siendo de la
  notificación (`RemoteInput`), que es la única superficie con teclado sin abrir la app.
- **Pantalla de bloqueo.** Android sólo ofrece widgets de bloqueo en tabletas (15/16);
  HyperOS no los tiene. La notificación sigue siendo el control con el teléfono
  bloqueado. Los dos conviven: mismo estado, dos superficies.
- **Refresco periódico.** Los launchers (HyperOS incluido) limitan `updatePeriodMillis`
  a ≥ 30 min. Aquí da igual: los repintados los provoca la app (cada serie) o el toque, y
  el reloj lo lleva el launcher. Un widget que necesitase «tic» cada segundo desde la
  app sería inviable; este no lo necesita.
- **Android 16 «Live Updates»** (`ProgressStyle` + `requestPromotedOngoing`): el chip
  en la barra de estado que es la respuesta de Google a las Live Activities. Encaja
  perfecto con el descanso, `compileSdk`/`targetSdk` ya son 36, pero el plugin de
  notificaciones no lo expone (sería `NotificationCompat` propio) y el Xiaomi 12 Pro se
  queda en Android 15 con HyperOS 2. Se anota; no se construye hasta tener dónde verlo.
- **Wear OS.** Otro APK y otra UI. Fuera de esta revisión.

## Verificación

- JS: `notify.native.test.js` ya simula el plugin de notificaciones; el de sesión se
  simula igual, y se comprueba que `startNatively` publica sin token, que
  `claimNatively` devuelve lo que el plugin devuelve y lo vacía, y que `stopNatively`
  limpia. Corre en `npm test`.
- Nativo: el proyecto Android no tiene tests propios (sólo el `ExampleUnitTest` de la
  plantilla). El receptor y el `SessionStore` se pueden probar con JUnit local
  (`SharedPreferences` en Robolectric), pero el widget sólo se ve **instalando el APK**
  (`npm run android:apk`), añadiéndolo a la pantalla de inicio y registrando una serie.
  Desde esta sesión no hay dispositivo: la verificación en pantalla es tuya.

## Coste y fases

| Fase | Qué se ve | Coste |
|---|---|---|
| 1 · Puente | Nada. `fitit_lock_sets` pasa a `SharedPreferences`; `publish/clear/claim` | Medio día |
| 2 · Widget | El widget en la pantalla de inicio, con cuenta atrás y `+1 serie` | Un día, más el ida y vuelta de probarlo en el teléfono |
| 3 · Opcional | La notificación del APK deja de abrir la app al tocar `+1 serie` | Un par de horas, pero revisa una decisión de la fase 2 |

Trade-off que decides tú: la fase 1 sola no aporta nada visible, pero es la que evita
que notificación y widget tengan dos listas de series pendientes. No haría el widget sin
ella.

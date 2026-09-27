# Control del entreno desde fuera de la app — especificación

Decidido el 2026-09-25: **se borra lo que hay y se hace de cero, en nativo.** El aviso de
descanso actual (`platform/notifyNative.js` sobre el plugin de notificaciones locales, y
su gemelo en el service worker de la PWA) nunca funcionó bien porque intentaba mantener
vivo, desde fuera, un estado que sólo conocía la página. Ahora el estado de la sesión en
curso lo posee un componente nativo de Android, y la notificación, el widget y la propia
app son tres vistas de lo mismo.

Sólo Android (el APK). La PWA no puede tener widgets ni notificaciones en curso de este
tipo. iOS, cuando exista, tiene su propio patrón (Live Activities) y se especifica aparte.

## Lo que el usuario quiere

Respuestas del product owner, condensadas:

- Entre series el teléfono está donde caiga. Al acabar una serie, hoy: desbloquear, entrar
  en la app, buscar la tarjeta, registrar. Quiere: **desbloquear y registrar desde ahí**, o
  mejor, **desde la propia pantalla de bloqueo**, como los controles de YouTube Music.
- Ver: el ejercicio en curso, su grupo muscular, la serie que toca y la cuenta atrás.
- Hacer: registrar la misma serie; registrar con otro peso o reps; saltar el descanso.
- El control **empieza y termina desde el widget** de la pantalla de inicio (no desde la
  notificación). «Empezar entreno» desde el widget entra si no lo congestiona; se decide
  viendo la maqueta.
  Cómo queda en esta spec: `Empezar entreno` del widget **abre la app** en Entreno, y el
  control arranca con la primera serie de fuerza que se registra ahí (el ejercicio se
  elige en la app, ver «Sin sesión»). Termina con `Terminar` del widget 4×2, con
  `Terminar entreno` del menú de Entreno o solo, a las dos horas sin registrar nada.
- Ni sonido ni vibración, con una excepción: **vibra al tocar «+1 serie» en el widget**.
- Una serie registrada desde fuera **se sube en el momento**, sin esperar a abrir la app.

### Las dos dudas

**¿Convive con YouTube Music?** Sí. Android permite tantas notificaciones en curso como
apps las tengan; la de Music es de tipo «multimedia» y ocupa su propio bloque en la
pantalla de bloqueo, la de Fitit es una notificación normal con botones y va debajo. Ni
una quita a la otra, y Xiaomi las pinta las dos porque las dos son nativas (la de la PWA
la pintaba Chrome, y ahí estaba la mitad del problema).

**¿Qué implica «subir en el momento»?** Tres cosas, ninguna grave:
1. El nativo necesita el token de sesión, así que **el token vive también en el
   nativo, cifrado con una clave del Android Keystore** (hoy sólo lo tiene la página). Se copia al iniciar sesión y se
   borra al cerrarla.
2. Las series tienen orden (`set_index` lo asigna el servidor al llegar). Si la app tiene
   series suyas sin enviar (sin red en el sótano), una serie del widget no puede
   adelantarlas. Regla: **en el APK, una sola cola, nativa**: la página deja de usar la
   suya (`fitit_outbox`) y encola en la nativa; el nativo envía en orden, con o sin app
   delante, y cada serie lleva un `client_id` para que un reintento no la duplique. Es
   más trabajo que dos colas, pero es la única forma de que «se sube en el
   momento» sea verdad y el orden no se rompa.
3. Sin red no falla nada: la serie se guarda, el widget dice `1 sin enviar` y se reintenta
   al siguiente toque, al volver la red y al abrir la app.

## Las tres superficies

Copia exacta. Cifras en tabular; el resto de estilo según `DESIGN.md`.

### 1 · Notificación en curso (pantalla de bloqueo y bandeja)

```
Fitit · Press banca · Pecho
32,5 kg × 12 · 4 series                    01:23
[ +1 serie ]   [ Otra serie ]   [ Saltar ]
```

- La cuenta atrás la lleva la propia notificación (cronómetro nativo en cuenta atrás):
  no hay que reescribirla cada segundo. Pero el cronómetro nativo **no se para en cero**:
  sigue en negativo (`−00:12`) hasta que alguien repinta. Ese repintado lo hace una alarma
  a la hora del fin (ver «Cómo se construye»), y es la que cambia el texto a
  `Descanso terminado` y quita `Saltar`. Si llega tarde se ve un rato en negativo; se
  acepta. Con `Descanso: Sin`, no hay reloj ni
  `Saltar`.
- `+1 serie` y `Saltar` **funcionan sin desbloquear**: el toque va a un receptor nativo,
  no abre la app, y la notificación se actualiza en sitio (`5 series`, reloj nuevo) sin
  volver a sonar.
- `Otra serie` abre el campo de texto de la notificación (respuesta directa, como
  contestar un WhatsApp desde el bloqueo). Formato `32,5x12` (también con punto o con
  `×`), o sólo `12` en ejercicios sin peso. Una entrada que no se entiende no registra
  nada y la notificación lo dice en su segunda línea:
  `No entendí «12 32». Escríbela como 32,5x12.` Si el teléfono exige
  desbloquear para escribir desde el bloqueo, es política del teléfono (ajuste de
  «respuesta directa»); en el Xiaomi hay que probarlo.
- Tocar el cuerpo abre la app en Entreno. Deslizar no la quita: es «en curso» mientras
  haya sesión; la quita `Terminar` en el widget.
- Silenciosa: canal sin sonido ni vibración, visible en pantalla de bloqueo. Tocar
  `+1 serie` aquí no vibra (sólo lo hace el widget, como se pidió).

### 2 · Widget de pantalla de inicio

Dos tamaños; el usuario elige tras ver la maqueta. Si el grande congestiona, sale.

**4×1, mínimo.** Registra la misma serie y nada más.

```
┌──────────────────────────────────────────────┐
│ Press banca · Pecho                    01:23 │
│ 32,5 kg × 12 · 4 series        [ +1 serie ]  │
└──────────────────────────────────────────────┘
```

**4×2, con ajuste.** Peso y reps se cambian con botones (en un widget no se puede
escribir); lo ajustado se registra y pasa a ser lo que repite el siguiente toque.

```
┌──────────────────────────────────────────────┐
│ Press banca · Pecho              01:23  ⏭    │
│ 4 series · 1 sin enviar                      │
│ [ − ]   32,5 kg   [ + ]    [ − ]  12  [ + ]  │
│ [       Registrar serie        ]   Terminar  │
└──────────────────────────────────────────────┘
```

- Peso a pasos de 2,5 kg; reps de 1 en 1. `⏭` salta el descanso.
- `Registrar serie` / `+1 serie` **vibran** (una pulsación corta) y el contador sube ahí
  mismo. Es lo único que vibra en toda la feature.
- `1 sin enviar` sólo aparece cuando hay algo en cola, detrás del contador de series y
  en ámbar (acento como texto), como en la maqueta: es un estado, no una etiqueta fija, y
  en `DESIGN.md` el ámbar es «algo pasó». En verde nunca.
- `Terminar` cierra el control: quita la notificación, vacía el estado, el widget vuelve
  a «sin entreno». Las series ya registradas no se tocan (una sesión en Fitit es un día;
  no hay nada que «cerrar» en el servidor). Sólo el 4×2 lo lleva; con el 4×1 solo, se
  termina desde el menú de Entreno (`Terminar entreno`, donde estaba el interruptor) o
  esperando las dos horas.
- Tocar el ejercicio abre la app en Entreno.

**Sin sesión:**

```
┌──────────────────────────────────────────────┐
│ Sin entreno en curso                         │
│ [ Empezar entreno ]                          │
└──────────────────────────────────────────────┘
```

`Empezar entreno` **abre la app en Entreno con la sesión de hoy** (la crea si no existe,
con la lógica que ya tiene la pantalla). No la crea el nativo: evita duplicar la regla de
«continuar la de hoy» y no necesita red desde el widget. La primera serie de cada
ejercicio se registra en la app, porque es donde se elige el ejercicio; desde ese momento
el widget y la notificación lo repiten. Esto es una limitación de diseño, no técnica:
elegir ejercicio desde un widget es una lista, y eso es la app.

Si tras verlo el usuario prefiere que el widget no tenga `Empezar`, el estado sin sesión
se queda en `Sin entreno en curso` y tocar abre la app.

### 3 · La app

- Entreno deja de tener el interruptor `Registrar sin abrir` y su línea de estado
  (`Enviado, pero Android no lo muestra`). El control nativo está siempre, y el permiso
  de notificaciones se pide una vez, al registrar la primera serie del APK. En su sitio
  del menú va `Terminar entreno`, que hace lo mismo que `Terminar` en el widget.
- Cardio sigue excluido del control (un intervalo no se repite con un toque).
- Lo registrado desde fuera aparece en la tarjeta al volver a la app, ya con su hora y
  su estado de envío. Ninguna serie se «reclama»: la cola es una y es nativa.
- En la web (PWA) el interruptor `Registrar sin abrir` **desaparece**: su implementación
  (service worker) se borra con el resto. La PWA registra desde la pantalla, como siempre.

## Comportamiento

| Momento | Qué pasa |
|---|---|
| Primera serie de fuerza de la sesión en la app | Aparece la notificación en curso; el widget pasa a mostrar la sesión |
| Serie registrada (app, notificación o widget) | Las tres vistas se actualizan; empieza el descanso si está activado |
| Fin del descanso | El reloj pasa de cero (en negativo) hasta que la alarma del fin repinta: `Descanso terminado`. Sin sonido ni vibración |
| Cambio de ejercicio en la app | El control pasa al nuevo ejercicio con su primera serie |
| `Terminar` en el widget | Todo desaparece. Las series quedan |
| Dos horas sin registrar nada | Lo mismo que `Terminar`, solo |
| Sin red | Se registra igual; `N sin enviar`; reintento automático |
| Android mata la app | Nada cambia: el estado es nativo y está en disco |
| Cerrar sesión en la app | Se borra el token nativo y el control, aunque hubiera sesión |

Un toque accidental en el bolsillo registra una serie. Se acepta: corregirla en la app
cuesta un deslizamiento y pedir confirmación mata el gesto.

## Qué se borra y qué se conserva

Se borra: `platform/notifyNative.js` y sus tests, la dependencia
`@capacitor/local-notifications` y el permiso `USE_EXACT_ALARM`, el bloque de
notificación de `public/sw.js`, `platform/notify.js`, `fitit_lock_sets`, el interruptor
`Registrar sin abrir` y la preferencia `fitit_rest_notice`.

Se traslada: la cola `fitit_outbox` de la página. En el APK la sustituye la nativa (fase 1);
en la PWA se queda como está.

Se conserva, porque son reglas y no código: una serie se escribe en disco antes de tocar
la red; se envía en orden; lo que se repite es la plantilla, no la serie con hora; cardio
fuera; «descanso» y «control» son cosas distintas.

## Cómo se construye (resumen técnico)

Un plugin local de Capacitor (`frontend/android/…/fitit/session/`), sin plugins de
terceros. Sí añade librerías de AndroidX al `build.gradle` de la app, que hoy sólo trae
appcompat, coordinatorlayout, core-splashscreen y junit:

- `androidx.work:work-runtime` para `SessionSender`.
- En tests: Robolectric y `androidx.test:core`.

Las piezas:

- **`SessionStore`**: el estado (`workoutId`, ejercicio, grupo muscular, plantilla,
  contador, `restEndsAt`, `restSeconds`) y la cola de series, en `SharedPreferences`;
  el token, cifrado con una clave AES/GCM propia del Android Keystore (no
  `EncryptedSharedPreferences`, que está deprecado). Cada serie de la cola lleva su
  `client_id`.
- **`SessionNotification`**: construye y actualiza la notificación en curso
  (`NotificationCompat`, `setOngoing`, cronómetro en cuenta atrás, tres acciones, una
  con `RemoteInput`). Canal silencioso, visibilidad pública.
- **`SessionWidget`** (`AppWidgetProvider` + `RemoteViews`) con los dos layouts.
- **`SessionActionReceiver`**: recibe los toques de notificación y widget. Aplica el
  cambio al estado, repinta las vistas, vibra si toca, y pide envío.
- **`SessionSender`**: vacía la cola en orden contra `POST /workouts/{id}/sets` con
  `WorkManager` (red disponible, reintentos con espera). El trabajo va **expedited**
  (`setExpedited`): si no, Android lo puede aplazar minutos con la pantalla apagada, y
  «se sube en el momento» dejaría de ser verdad. La misma cola la usa la página.
- **`SessionPlugin`** (JS ↔ nativo): `publish(state)` desde Entreno en cada serie o
  cambio de ejercicio; `enqueue(set)` para las series de la app; `end()`; `setToken()` /
  `clearToken()`; evento `changed` para que la pantalla se repinte cuando algo llega de
  fuera. En web, cada función es un no-op y `enqueue` cae en `offline.js`.
- Un relabel al fin del descanso con `AlarmManager` inexacto pero
  `setAndAllowWhileIdle`: sin eso, con el teléfono en reposo (Doze) la alarma puede
  tardar bastante más de un minuto, y mientras tanto el reloj enseña tiempo negativo. No
  hace falta alarma exacta, ni por tanto `USE_EXACT_ALARM`.
- Otra alarma igual para el cierre automático a las dos horas sin registrar nada; se
  reprograma con cada serie.
- Tipografía: Geist Mono y Space Grotesk empaquetadas en `res/font` (~200 KB), que
  es lo que enseña la maqueta aprobada; el widget y la notificación no pueden cargar
  Google Fonts. **Riesgo, a comprobar en la fase 2:** la plantilla estándar de
  notificación no admite fuente propia; hace falta un layout propio
  (`DecoratedCustomViewStyle`), y la capa de Xiaomi puede pintarlo peor en el bloqueo
  que la plantilla. Si pasa, la notificación va con la fuente del sistema y las fuentes
  se quedan en el widget.

## Verificación

- JS: el plugin se simula en vitest como los demás de `platform/`; se comprueba qué
  publica Entreno y cuándo, y que en web no se llama a nada.
- Nativo: `SessionStore`, el parseo de «Otra serie» y el receptor con JUnit + Robolectric
  (hoy el proyecto Android no tiene ningún test propio; se estrenan aquí).
- En el teléfono, que es lo único que prueba lo que importa: bloquear y tocar `+1 serie`
  sin desbloquear; `Otra serie` desde el bloqueo; convivir con YouTube Music; modo avión
  y `N sin enviar`; matar la app y ver que el widget sigue; el widget en los dos tamaños.

## Decisiones tomadas (2026-09-25, sobre la maqueta)

Maqueta: https://claude.ai/artifact/WMLXNPGvGNCGAFnGR6iarh (tres pantallas: bloqueo,
inicio con sesión en oscuro, inicio sin sesión y sin red en claro).

- Los dos widgets, 4×1 y 4×2, tal como están en la maqueta.
- `Empezar entreno` entra en el estado sin sesión.
- `Terminar` se queda como está (texto apagado junto a `Registrar serie` en el 4×2).
- Geist Mono y Space Grotesk se empaquetan en el APK.
- La PWA pierde `Registrar sin abrir`; su implementación se borra.

## Decidido después de la revisión (2026-09-25)

1. **Cada serie lleva un `client_id`.** Es un UUID que genera quien la crea (el nativo en
   el APK, la página en la PWA) en el momento de registrarla, y viaja con ella en la cola.
   `POST /workouts/{id}/sets` lo acepta como campo opcional. Si ya existe en ese entreno una
   serie con el mismo `client_id`, el servidor no crea otra: contesta con el entreno tal
   como está, así que el reintento se ve como un éxito. Sin `client_id` todo sigue como
   hoy, y los clientes viejos no se rompen. En la base: columna `sets.client_id`
   que admite nulo, única por entreno cuando no es nula, y su migración Alembic. Spec en
   `log_set.feature`: el mismo `client_id` dos veces da una serie, y dos series sin
   `client_id` siguen siendo dos. Así «llegan una sola vez» pasa a ser una garantía y no
   un deseo. Lo aprovecha también `fitit_outbox` en la PWA, que tiene el mismo problema.
2. **El token, cifrado con una clave del Android Keystore.** Es una clave AES/GCM propia,
   creada la primera vez, que no sale del Keystore. El token cifrado va en
   `SharedPreferences`. No añade ninguna librería. Si la clave se pierde o se invalida
   (restaurar el teléfono, por ejemplo), el nativo tira el token y deja de enviar hasta
   que se abre la app, que se lo vuelve a copiar al arrancar. Las series esperan en la
   cola, así que no se pierde nada.
3. **«Otra serie» acepta coma decimal.** Valen `32,5x12`, `32.5x12`, `32,5 x 12`, con `×`
   en lugar de `x`, y sólo `12` en ejercicios sin peso. El ejemplo del error usa la coma:
   `No entendí «12 32». Escríbela como 32,5x12.`

Sigue abierto: cómo se deshace un `+1 serie` accidental desde el 4×1 (hoy, sólo en la
app). Lo del 4×2 en un ejercicio sin peso se decidió en la fase 4: sin botones de kg.

## Fases

Seis, cada una un PR y un APK que se instala y se prueba solo. Ninguna deja la app
peor que la anterior, y la primera ya la deja mejor: sin el control que no funcionaba.
La verificación en el teléfono es del product owner (aquí no hay dispositivo); cada fase
lista lo que hay que comprobar, y no se pasa a la siguiente sin ese visto bueno.

### Fase 0 · Limpieza (APK 0.4.0) · medio día

Se borra el aviso de descanso entero: `platform/notifyNative.js` y `platform/notify.js`
con sus tests, `@capacitor/local-notifications`, `USE_EXACT_ALARM`, el bloque de
notificación de `public/sw.js`, el interruptor `Registrar sin abrir` y sus preferencias,
`fitit_lock_sets` y la línea de estado de Entreno.

- **Qué se ve:** en Entreno (APK y PWA), el menú de la cabecera pierde `Registrar sin
  abrir` y su línea de estado. La barra de descanso en pantalla y `Pantalla encendida`
  siguen igual. Nada más cambia.
- **Comprobar:** registrar una serie con y sin descanso; que no aparece ninguna
  notificación; que el APK arranca sin pedir permisos nuevos.

### Fase 1 · Dueño nativo, cola y token (APK 0.5.0) · dos días

Primero el backend, que se puede mergear y desplegar solo: `client_id` en `SetIn` y en
`sets` (migración y escenarios en `log_set.feature`), y `fitit_outbox` mandándolo.
Después el plugin `Session` con `SessionStore` (estado y cola en `SharedPreferences`), el
token cifrado con la clave del Keystore y `SessionSender` con `WorkManager`. Entreno publica el
estado en cada serie y cambio de ejercicio, y en el APK encola en la cola nativa en vez
de en `fitit_outbox`. Iniciar y cerrar sesión copian y borran el token nativo.

- **Qué se ve:** nada nuevo. Las series se envían igual que antes desde la app, con el
  mismo indicador de «sin enviar» en la tarjeta. La PWA no cambia.
- **Comprobar:** modo avión, tres series, quitar el avión: llegan en orden y una sola
  vez. Con la red cortándose a mitad de envío (entrar y salir del ascensor), ninguna
  serie aparece dos veces. Matar la app con series sin enviar y volver: se envían. Cerrar sesión y entrar
  con otra cuenta: nada de la anterior acaba en la cuenta nueva.

**Hecho (2026-09-25).** Backend en #160; lo nativo en `android/…/fitit/session/`, con 30
tests JUnit + Robolectric que CI pasa antes de compilar el APK (el hook de pre-commit no
puede: necesitan el SDK de Android). Lo que se decidió al construirlo:

- **La página guarda una copia de la cola.** Pinta las filas «sin enviar» de forma
  síncrona y el puente de Capacitor es asíncrono, así que `fitit_outbox` sigue existiendo
  en el APK, pero como copia: cada cambio (encolar, renombrar, borrar un ejercicio) va al
  nativo como una operación suelta, nunca la cola entera, y la cola que devuelve el nativo
  manda sobre la copia. Lo que la página encoló y el nativo aún no ha confirmado no se
  borra de la copia aunque llegue una cola sin ello. En el APK la página ya no llama a
  `logSet`: sólo pide el envío (`flush`) y redibuja con lo que cuenta el aviso `changed`.
- **Cerrar sesión borra el token nativo, no la cola.** Igual que la web: con otra cuenta,
  el servidor rechaza las series de un entreno que no es suyo, y la app dice «El servidor
  rechazó una serie». Borrar la cola al salir perdería las series de quien sale sin
  querer.
- **Las series rechazadas se cuentan una vez.** Sólo las recogen el aviso de fin de envío
  y la consulta al abrir Entreno; así el aviso llega aunque el rechazo fuera con la app
  cerrada.
- **En Android 11 o anterior** un envío urgente (*expedited*) corre como servicio en
  primer plano y enseña una notificación silenciosa, «Enviando series», mientras dura. De
  Android 12 en adelante no aparece nada.
- **«Entreno publica el estado» pasa a la fase 2.** El ejercicio, la plantilla y el fin
  del descanso sólo los lee la notificación; publicarlos antes era escribir algo que nadie
  lee ni se puede probar.
- Un fallo que ya estaba en producción, arreglado en #160: el id local de las series
  pendientes (`tmp-1`…) se repetía entre aperturas de Entreno, y enviar una borraba de la
  cola a la otra.

### Fase 2 · Notificación en curso (APK 0.6.0) · día y medio

Entreno publica el estado al nativo (ejercicio, grupo, plantilla, contador, fin del
descanso) en cada serie y cambio de ejercicio; viene de la fase 1.
`SessionNotification` y `SessionActionReceiver`: la tarjeta de la pantalla de bloqueo
con `+1 serie`, `Otra serie` (campo de texto) y `Saltar`, cronómetro en cuenta atrás,
relabel a `Descanso terminado`, canal silencioso visible en bloqueo, permiso de
notificaciones pedido en la primera serie. `Terminar entreno` en el menú de Entreno y
cierre automático a las dos horas.

- **Qué se ve:** desde la primera serie de fuerza, la notificación de la spec en la
  bandeja y en la pantalla de bloqueo. En Entreno → menú, `Terminar entreno`.
- **Comprobar:** con el teléfono bloqueado, `+1 serie` registra sin desbloquear y el
  contador sube en la tarjeta; `Otra serie` con `35x10` registra eso y el siguiente
  `+1 serie` repite 35×10; `32,5x8` (con coma) también se entiende; `Saltar` quita el
  reloj; convive con YouTube Music; el reloj llega a cero y pasa a `Descanso terminado`
  sin sonar; `Terminar entreno` la quita; matar la app y la tarjeta sigue con sus botones
  funcionando.

**Hecho (2026-09-25).** `SessionControl` (qué registra un toque, cómo se lee «Otra
serie», qué texto se enseña), `SessionNotification`, `SessionAlarms`,
`SessionController` y `SessionActionReceiver`, con 38 tests nativos más. Lo que se decidió
al construirlo, y que hay que mirar en el teléfono:

- **La notificación usa la fuente del sistema.** La plantilla estándar de Android no
  admite fuente propia, y un layout propio es justo lo que la capa de Xiaomi puede pintar
  peor en el bloqueo (el riesgo que ya nombraba «Cómo se construye»). Geist Mono y Space
  Grotesk quedan para el widget (fase 3). **Se aparta de la decisión sobre la maqueta**:
  si se quieren también en la notificación, es un layout propio y hay que probarlo en el
  Xiaomi.
- **Copia que la spec no fijaba:** en un ejercicio sin peso la línea es
  `8 reps · 4 series`; el campo de «Otra serie» dice `Peso x reps, como 32,5x12`; un
  número solo en «Otra serie» son las reps y conserva el peso.
- **Deslizar sí la quita en Android 14+ con el teléfono desbloqueado.** Android 14 dejó
  de respetar «en curso» para las notificaciones normales; en el bloqueo sigue fija. Vuelve
  con la siguiente serie. Hacerla indeslizable exige un servicio en primer plano, que es
  otra cosa (y otro permiso).
- **Tocar el cuerpo abre la app en ese entreno** (desde la fase 3; antes dependía de la
  regla de reabrir).
- **El permiso se pide en la primera serie de cada visita a Entreno** hasta que se
  conteste; Android deja de preguntar tras el segundo no. Sin permiso el control se
  guarda igual (lo usará el widget) y no se enseña nada.
- **Los canales del aviso antiguo** (`fitit-sesion`, `fitit-fin-descanso`) se borran al
  publicar: Android los conservaba en Ajustes aunque el código se hubiera ido.
- **Saltar el descanso en la app lo quita también de la notificación, y al revés.**
- **Probado en el Xiaomi (2026-09-26): `Otra serie` pide desbloquear.** Android sólo
  deja escribir en una notificación con el teléfono bloqueado si un ajuste del sistema
  lo permite, y viene apagado; la app no puede cambiarlo. `+1 serie` y `Saltar` sí van
  bloqueado. **Decidido:** se queda así (cambiar peso o reps es lo raro), y el ajuste
  rápido sin teclado es el `−`/`+` del widget 4×2 (fase 4).
- **Corregido tras probarla (0.7.0): no salía en la pantalla de bloqueo.** El canal era
  de importancia baja para que no sonara, y Android trata esa importancia como
  «silenciosa»: Xiaomi, y otros, no enseñan las silenciosas en el bloqueo. El canal pasa
  a importancia normal con sonido y vibración quitados (sigue sin sonar), con otro id
  (`fitit_entreno`), porque Android no deja subir la importancia de uno que ya existe;
  el de la 0.6.0 se borra.

### Fase 3 · Widget 4×1 (APK 0.7.0) · un día

`SessionWidget` con el layout mínimo y el estado sin sesión con `Empezar entreno`
(abre la app en Entreno con la sesión de hoy). Vibración al tocar `+1 serie`. Fuentes
en `res/font`. Colores por tema en `res/values` y `res/values-night`.

- **Qué se ve:** en el selector de widgets de Android, «Fitit · Entreno 4×1». Con
  sesión: ejercicio, grupo, reloj, serie y `+1 serie`. Sin sesión: `Sin entreno en
  curso` y `Empezar entreno`.
- **Comprobar:** añadirlo a la pantalla de inicio; el reloj corre sin abrir la app;
  `+1 serie` vibra y sube el contador ahí y en la notificación; `Empezar entreno` abre
  Entreno en la sesión de hoy; cambiar de ejercicio en la app y el widget lo sigue;
  tema claro y oscuro del sistema.

**Hecho (2026-09-25).** `SessionWidget` (proveedor y `RemoteViews`), `SessionLaunch`
(abrir la app con una orden) y el diseño en `res/layout/widget_session_4x1.xml`, con 11
tests nativos más. Lo que se decidió al construirlo:

- **Fuentes** recortadas a caracteres latinos y fijadas a los pesos de la maqueta: Space
  Grotesk 600, Geist 400 y 600, Geist Mono 500 y 600, unos 185 KB en `res/font`. Licencia
  OFL en `android/fonts-licenses/` y dentro de cada archivo. **A comprobar en el Xiaomi:**
  que el launcher pinta las fuentes propias en un widget; si no, sale con la del sistema y
  todo lo demás funciona igual.
- **Sin sesión dice el día, no las series:** `Sin entreno en curso` y debajo `jueves 25`.
  La maqueta añadía `· 0 series`, pero sin control el nativo no sabe cuántas series lleva
  el día (terminar el control no borra las del servidor), y un cero falso es peor que
  nada. Tocar cualquier parte del estado sin sesión es `Empezar entreno`.
- **`Empezar entreno` no crea nada en nativo:** abre la app y le pide a Días que haga lo
  mismo que su botón (continuar el de hoy o crearlo). La orden viaja en el intent y se lee
  una sola vez, para que girar el teléfono no vuelva a abrir el entreno. Sin sesión
  iniciada, espera a que entres.
- **Tocar el ejercicio abre ese entreno**, el del control, y lo mismo el cuerpo de la
  notificación.
- **La vibración** es una pulsación de 30 ms, sólo al tocar `+1 serie` en el widget.

### Fase 4 · Widget 4×2 (APK 0.8.0) · un día

El layout con ajuste: `−`/`+` de peso (2,5 kg) y de reps, `Registrar serie`, `⏭`,
`Terminar`, `N sin enviar`. Lo ajustado pasa a ser la plantilla que repiten todos los
`+1 serie`.

- **Qué se ve:** un segundo widget en el selector, «Fitit · Entreno 4×2», como en la
  maqueta.
- **Comprobar:** subir el peso dos veces y registrar: la serie entra con +5 kg y la
  notificación repite ese peso; modo avión y `1 sin enviar` en ámbar, que desaparece
  al volver la red; `Terminar` vacía los dos widgets y la notificación.

**Hecho (2026-09-26).** `SessionWidget4x2` y `res/layout/widget_session_4x2.xml`, con
los ajustes en `SessionControl` (`weight`, `reps`) y sus acciones en `SessionController`;
19 tests nativos más (100 en total). Lo que se decidió al construirlo:

- **Los `−`/`+` no registran:** cambian la plantilla del control y la guardan. La
  notificación y el 4×1 se repintan en el acto con la serie nueva, antes de registrarla:
  lo que se ve en cualquier sitio es lo que registrará el siguiente toque, venga de
  donde venga. No vibran; sólo `Registrar serie` (la misma acción que el `+1 serie`
  del 4×1).
- **Límites:** el peso no baja de 0 ni pasa de 1000; las reps, de 1 a 1000. Un peso que
  no es múltiplo de 2,5 (31 kg) sube y baja desde ahí (33,5, 28,5).
- **Ejercicio sin peso: sin botones de kg.** Queda sólo el bloque de reps, a lo ancho.
  Era la duda abierta de la revisión.
- **`N sin enviar` cuenta toda la cola**, no sólo la de este ejercicio: es lo que el
  teléfono aún debe al servidor. El widget se repinta al acabar cada envío, así que
  desaparece sola al volver la red.
- **`⏭` sólo mientras corre el descanso.** Acabado, en su sitio sale `Descanso
  terminado`, como en la maqueta en claro.
- **Sin sesión, apilado:** título, día y `Empezar entreno` a lo ancho. En fila, como en
  el 4×1, el título se partía en dos líneas.

### Fase 5 · Cambiar de ejercicio desde fuera (APK 0.9.0)

Levanta la limitación de «Sin sesión» («elegir ejercicio desde un widget es una lista,
y eso es la app»): la lista es corta y la hace la app, así que el widget sólo la enseña.
Y el grupo muscular sale de la notificación y de los dos widgets.

```
┌──────────────────────────────────────────────┐
│ Press banca                      01:23  ⏭    │
│ 4 series · 1 sin enviar                      │
│ [ − ]   32,5 kg   [ + ]    [ − ]  12  [ + ]  │
│ [ Registrar serie ]  Otro ejercicio Terminar │
└──────────────────────────────────────────────┘
        «Otro ejercicio» ↓
┌──────────────────────────────────────────────┐
│ [ Remo con barra     ]  [ Dominadas        ] │
│ [ 40 kg × 10         ]  [ 8 reps           ] │
│ [ Sentadilla         ]  [ Curl             ] │
│                         [ 12,5 kg × 12     ] │
│ [          Nuevo…              ]   Cancelar  │
└──────────────────────────────────────────────┘
```

- **Qué se ve:** en la notificación y en los dos widgets, `Press banca` en vez de
  `Press banca · Pecho`. En el 4×2, `Otro ejercicio` (texto apagado) entre
  `Registrar serie` y `Terminar`; al tocarlo, hasta cuatro ejercicios con su marca,
  `Nuevo…` y `Cancelar` (sin ninguno: `No hay más ejercicios en este entreno.`). En la
  notificación, con el descanso acabado o sin descanso, el tercer botón es
  `Otro ejercicio`, un campo de texto: `Ejercicio y serie, como Remo 40x10`.
- **Comprobar:** en un entreno con Press banca registrado y Remo añadido sin series,
  `Otro ejercicio` → `Remo`: la notificación y los dos widgets dicen `Remo`, con
  `0 series` y la marca de la última vez, sin registrar nada, y el descanso sigue; al
  abrir la app, la tarjeta de Remo está arriba y abierta. `Registrar serie` registra
  Remo. `Otro ejercicio` → `Cancelar` no cambia nada. `Nuevo…` abre Entreno con el
  teclado en `Ejercicio` (a comprobar: Android puede no sacar el teclado para un foco
  que no viene de un toque). En la notificación, `Otro ejercicio` con
  `Peso muerto 100x5` registra esa serie y la tarjeta aparece en la app; con `remo`
  (minúsculas) cambia a Remo sin registrar; con `Hip thrust` a secas avisa
  `Escríbelo con la serie, como Remo 40x10.`; durante el descanso, `Otra serie` con
  `Remo 40x10` también cambia. Tema claro y oscuro.

**Hecho (2026-09-26).** `SessionControl` (candidatos, `switchTo`, `typed`), las
acciones nuevas en `SessionController`, el estado «eligiendo» en `SessionWidget4x2` y
`widget_session_4x2.xml`, la acción de `SessionNotification`, `SessionLaunch.ADD`, y en
la app `candidatesFor` y `followNativeExercise` en `Workout.jsx`. Tests nativos: 132
(eran 100). Lo que se decidió al construirlo:

- **La lista la hace la app, sin pedir nada nuevo al servidor.** Va en el control
  (`candidates: [{ exercise, template, count }]`) al registrar, y cuando cambia (añadir
  un ejercicio, registrar una serie) se vuelve a mandar con `candidates()`, que sólo toca
  la lista del control de ese entreno: ni la serie, ni el contador, ni el descanso, para
  no pisar un toque del widget que llegue a la vez. Orden: primero lo de este entreno
  sin series, en el orden de la pantalla (lo añadido y lo pendiente de «Repetir», que ya
  son tarjetas sin series); después lo ya hecho hoy, lo más reciente primero. **Los
  «recientes» son sólo los de este entreno:** los de otros días necesitarían sus marcas,
  y eso es una petición por ejercicio que el nativo no puede hacer sin red. Para un
  ejercicio que no está en el entreno está `Nuevo…` o escribirlo en la notificación.
- **La marca** es la última serie de hoy si la hay, y si no la primera de la última vez
  (la misma con la que la app rellena la tarjeta). **Sin marca, 10 reps y sin peso**, y
  el candidato se pinta sólo con su nombre: un peso inventado lo registraría el primer
  `+1 serie`; sin peso no se miente y se corrige con `Otra serie`. (El 4×2 no enseña
  botones de kg en un ejercicio sin peso, así que para ponérselo hace falta `Otra serie`
  o la app.)
- **Cambiar no es entrenar:** no registra, no mueve el cierre de dos horas y no toca el
  descanso. El contador es el de las series de ese ejercicio en este entreno. El de antes
  pasa a la lista, para poder volver.
- **Rejilla de dos por dos, no cuatro filas.** Cuatro filas de 44 dp más la de
  `Nuevo…`/`Cancelar` no caben en los ~172 dp útiles del 4×2, y `DESIGN.md` no baja de
  44. Casillas fijas, sin colecciones (`ListView`), como se pidió; un nombre largo se
  corta con `…`.
- **Android pinta tres botones de notificación como mucho**; el cuarto se pierde sin
  aviso. Con el descanso corriendo el tercero sigue siendo `Saltar` (lo que más se toca
  entonces), y `Otro ejercicio` ocupa su sitio el resto del tiempo. Para que cambiar se
  pueda también descansando, **`Otra serie` entiende lo mismo que `Otro ejercicio`**:
  `35x10` sigue siendo otra serie del ejercicio en curso, y `Remo 40x10` cambia.
- **El nombre escrito** se guarda tal cual, salvo que coincida sin mayúsculas ni tildes
  con el ejercicio en curso o con un candidato: entonces vale el suyo, para no partir un
  ejercicio en dos por una tilde. Un nombre lleva al menos dos letras seguidas, así que
  `x10` sigue siendo una «Otra serie» mal escrita (`No entendí «x10»…`).
- **La app sigue al nativo:** si el control cambia de ejercicio fuera, Entreno sube esa
  tarjeta arriba y la abre, y si no existía (un nombre escrito en la notificación) la
  pone sin series. Un `+1 serie` del mismo ejercicio no mueve nada. Al entrar en Entreno
  sin haber registrado nada en esa visita, el primer aviso del nativo sube la tarjeta
  del control aunque no haya cambiado (la pantalla aún no sabía cuál era).
- **`Nuevo…`** abre la app con la orden `add` (como `open`, con el entreno) y cierra la
  lista del widget al llegar; Entreno enfoca `Ejercicio`.
- **El 4×1 no cambia** salvo el grupo: no tiene sitio para una lista.
- **A partir de ~300 dp de ancho** `Registrar serie` se corta a `Registrar…`; a esa
  anchura la fila de peso y reps ya se apretaba antes de esta fase. Visto en render a
  358 × 200 dp, claro y oscuro; el ancho real del 4×2 en el Xiaomi, a comprobar.

**Revisado (2026-09-26, APK 0.9.1): el 4×2 sólo crea.** `Otro ejercicio` abre Entreno
con el campo `Ejercicio` enfocado (la orden `add`, lo que hacía `Nuevo…`). Se retiran
del widget la rejilla de candidatos, `Nuevo…`, `Cancelar`, el aviso de lista vacía y el
estado `choosing` del control, con sus acciones (`CHOOSE`, `CHOOSE_CANCEL`, `SWITCH`).
Lo demás de la fase sigue: la app publica `candidates` y la notificación cambia a uno
escribiendo sólo su nombre; `switchTo` es ahora sólo de la notificación. El tope de
cuatro candidatos se queda como estaba, aunque su motivo (lo que cabía en la rejilla) ya
no existe.

### Fase 6 · Rediseño de widgets y notificación (APK 0.10.0)

Las superficies de las fases 2–5 funcionaban, pero cada una había crecido por su lado:
siete cajas con borde en el 4×2, tres botones del sistema en la notificación, un
`Descanso terminado` que sustituía al número. El diseño aprobado está en `DESIGN.md`,
«Fuera de la app: widgets y notificación nativa (APK)», con sus vistas previas (v9–v17).
Tesis: **una serie, un toque**, con un solo relleno ámbar por superficie.

```
┌──────────────────────────────────────────────┐   ┌──────────────────────────────┐
│ Press banca · 4 series                 (■)   │   │ Sin entreno en curso         │
│ 01:23                                        │   │ Último: hace 2 días · Pierna │
│ ┌───────────────────────────────┬──────┐     │   │ [     Empezar entreno      ] │
│ │ −        32,5 kg          +   │      │     │   │            ━ ·               │
│ ├───────────────────────────────┤  +1  │     │   └──────────────────────────────┘
│ │ −        12 reps          +   │      │     │    tocar los puntitos ↓
│ └───────────────────────────────┴──────┘     │   ┌──────────────────────────────┐
└──────────────────────────────────────────────┘   │ PASOS HOY                    │
                                                   │ 8.432 / 10.000               │
Notificación desplegada: la misma línea, el tiempo │ ████████████████░░░          │
en Mono 34sp y el mismo bloque. Cerrada:           │ Media semanal: 7.910         │
Press banca / 32,5 kg × 12 · 4 series  +  01:23    │            · ━               │
                                                   └──────────────────────────────┘
```

- **Qué se ve:** el 4×2 con una sola línea arriba y `Terminar` como aro rojo con ■; el
  tiempo debajo en Mono 30sp; el **bloque de ajuste** (dos filas de 48 dp, `+1` de 60 dp
  como su extremo). Pasado el descanso, el mismo número en ámbar contando hacia arriba,
  `+00:12`. La notificación con diseño propio y sin botones del sistema. Sin entreno, dos
  pantallas. `Sesión caducada` cuando el servidor rechaza el token. Un tercer widget en
  el selector, «Fitit · Entreno 3×2».
- **Comprobar en el teléfono:** el ancho real del 3×2 en el launcher del Xiaomi (se
  diseñó a ≈270 dp); que la notificación cerrada con el tiempo de 34sp cabe en la fila de
  HyperOS sin recortarse; los puntitos cambian de pantalla y el widget la recuerda tras
  reiniciar; pasada la medianoche, `hace 2 días` pasa a 3 y los pasos de ayer desaparecen;
  con el token caducado (o `Salir` en otro dispositivo si revoca), el widget dice
  `Sesión caducada` y al volver a entrar recupera el entreno y envía la cola.

**Hecho (2026-09-27).** En siete cambios, uno por pieza. Tests nativos: 127 (eran 122
antes de la fase; se fueron 33 que sólo cubrían lo retirado y entraron 38). Lo que se decidió al
construirlo:

- **Se retira escribir desde fuera de la app** (`Otra serie`, `Otro ejercicio` de la
  notificación, con su `Remo 40x10`), **`⏭` saltar** y el `Otro ejercicio` del 4×2.
  Android sólo deja campos de texto en sus propios botones, y el bloque ocupa ese sitio.
  Una serie distinta se ajusta con `−`/`+`; otro ejercicio, en la app. Saltar el descanso
  sigue en la app, y la notificación quita su reloj cuando se salta ahí.
- **El bloque de ajuste es un layout propio** (`widget_adjust_block.xml`) que incluyen el
  4×2, el 3×2 y la notificación desplegada, con los mismos ids. El pulsado (`#FBE6DC` /
  `#3A2216` y glifo en accent-ink) va en selectores de color y de fondo, que RemoteViews
  sí admite. El filete entre filas es un `FrameLayout` y no un `View`: un `View` suelto
  rompía el widget («Problema al cargar»).
- **El tiempo son dos cronómetros del layout**, uno que baja en color de texto y otro que
  sube con formato `+%s` en accent-ink, y la alarma de fin de descanso cambia de uno a
  otro. No un color puesto desde el código: no seguiría al tema del sistema cuando el
  launcher repinta. Lo comparten los widgets y la notificación.
- **La caja del tiempo es la línea entera de la fuente.** Con la caja del tamaño del
  texto (30 dp para 30sp, como el `line-height` de la vista previa), Geist Mono, que mide
  1,3 em, se alineaba arriba y perdía el pie del 0 y del 3. Los 11 dp de `DESIGN.md` se
  miden desde la franja de la cifra y el aire de más se descuenta con márgenes negativos.
  Igual con los pasos (40sp).
- **Notificación con `DecoratedCustomViewStyle`:** cabecera y marco de Android, el resto
  nuestro. Renuncia consciente: no puede ser «Live Update». Título y texto se siguen
  rellenando para el lector de pantalla y los relojes. El `+1` de la notificación no vibra;
  sólo el del widget.
- **`Sesión caducada`:** el 401 al vaciar la cola se apunta en `SessionStore` (sobrevive a
  reinicios) y gana a los demás estados del widget; `Abrir Fitit` abre la app sin orden.
  Se quita cuando la app da una sesión (`setSession`, que ahora pasa por
  `SessionController.renew` y repinta). Sin token no hubo sesión que caducara y no se dice
  nada. La notificación no cambia: lo que registre espera en la cola igual. El 4×1 dice
  sólo `Sesión caducada` y `Abrir`: la frase entera no cabe en su línea.
- **Sin entreno, los datos los da la app** (`widgetSummary.js` → `FititSession.summary`),
  en piezas que el nativo junta: Días al cargar la lista (`lastWorkout`: el día más
  reciente con series y hasta dos grupos, de más a menos series), la lectura de pasos al
  terminar (`steps`: hoy y la media de los siete días anteriores, sólo de los que tienen
  cifra; se publica antes de subirlos, así que vale sin red) y Objetivo al guardar
  (`stepsGoal`). **El día se compara al pintar**: una alarma a medianoche sin despertar
  al teléfono repinta, para que `hace 2 días` pase a 3 y unos pasos de ayer no se enseñen
  como de hoy. La pantalla es una para todos los widgets, no una por widget. Cerrar
  sesión borra el resumen.
- **Los puntitos quedan invisibles, no fuera,** cuando no hay pasos de hoy: la pantalla 1
  no se mueve de sitio. La barra es un `ProgressBar` con un `layer-list` escalado (no
  recortado), para que el extremo lleno también sea redondo.
- **Objetivo → `Pasos al día`** (`steps_goal` de `/targets`): vacío es null, `10.000` son
  diez mil, y fuera de 1.000–100.000 dice `Entre 1.000 y 100.000 pasos.` en vez de mandar
  algo que el servidor rechazaría.
- **El 3×2 no tiene layout propio:** `SessionWidget3x2` hereda del 4×2. Un test de
  aspecto lo infla a 270 × 200 dp y comprueba que no se pierde ninguna medida del 4×2.
- **Cómo se miró:** `SessionWidgetLookTest` infla los layouts de verdad (Robolectric con
  gráficos nativos), mide lo que `DESIGN.md` fija y, con `FITIT_RENDER_DIR`, guarda un PNG
  por estado, claro y oscuro, para compararlo con las vistas previas.

Después, si hace falta: iOS (Live Activities) tiene su propia spec. Y si el Xiaomi
algún día recibe Android 16, el chip de «Live Updates» sobre la misma notificación.

### 0.10.1 · Lo que salió en el teléfono (APK 0.10.1)

Dos fallos de la primera prueba en el Xiaomi (2026-09-27), con las capturas del usuario.

- **Borrar el entreno no llegaba al nativo.** Borrar (menú de Entreno o `Borrar día`)
  sólo se lo decía al servidor; el único que limpiaba el control era `Terminar`. El
  widget y la notificación seguían en el entreno borrado, su `+1` recibía 404 y la serie
  se tiraba sin aviso; tocar el widget abría la app en ese entreno, que al recibir 404
  tiraba de la copia de `fitit_workout_cache` —pensada para cuando no hay red— y
  enseñaba un entreno fantasma que al borrarlo daba `No se pudo borrar el entreno.`
  Ahora:
  - `forgetWorkout()` (offline.js) y `FititSession.forget` (nativo): borrar un entreno o
    su día tira sus series sin enviar, su copia, y el control si era el suyo (la
    notificación se va y los widgets vuelven a `Sin entreno en curso`). Lo pide la app
    en el nativo porque las series de un `+1` del widget sólo están en su cola.
  - El envío nativo trata un 404 como «el entreno ya no existe» (en
    `POST /workouts/{id}/sets` no hay otro 404): tira las demás series de ese entreno y,
    si era el del control, lo termina. Cubre el entreno borrado desde la web u otro móvil.
  - La copia del entreno sólo se usa sin red o con el servidor caído, nunca contra un
    404; y borrar algo que ya no existe cuenta como borrado.
- **Dos filas del launcher miden ≈176 dp, no 200.** El 3×2 mide ≈253 × 176 dp en ese
  launcher (medido sobre la captura, tomando el `+1` de 60 dp como regla), y el bloque
  perdía la fila de reps por abajo: descansando pedía ≈198 dp. El widget lee su tamaño
  de las opciones del launcher (`OPTION_APPWIDGET_MAX_HEIGHT` y `MIN_WIDTH`, en vertical)
  y por debajo de 190 dp se compacta (DESIGN.md, «Tamaños»): ≈163 dp. Se eligieron las
  opciones y no `RemoteViews` por tamaños de Android 12 para que funcione en todas las
  versiones y los tests que ya había sigan viendo el diseño alto; lo que depende de
  Android 12 (altos y márgenes desde código) en versiones anteriores se queda en reloj
  arriba y márgenes de 10.
- **Comprobar en el teléfono:** el 3×2 y el 4×2 descansando y sin descansar (el bloque
  entero, con el marco de abajo); `Press banca` y `Dominadas` enteros al lado del
  tiempo; borrar el entreno en curso desde el menú de Entreno y desde Días (la
  notificación se va, el widget vuelve a `Sin entreno en curso`); borrar desde la web
  con el widget en ese entreno y tocar su `+1`.

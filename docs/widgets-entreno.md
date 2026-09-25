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
1. El nativo necesita el token de sesión, así que **el token vive también en almacén
   cifrado de Android** (hoy sólo lo tiene la página). Se copia al iniciar sesión y se
   borra al cerrarla.
2. Las series tienen orden (`set_index` lo asigna el servidor al llegar). Si la app tiene
   series suyas sin enviar (sin red en el sótano), una serie del widget no puede
   adelantarlas. Regla: **en el APK, una sola cola, nativa**: la página deja de usar la
   suya (`fitit_outbox`) y encola en la nativa; el nativo envía en orden, con o sin app
   delante. Es más trabajo que dos colas, pero es la única forma de que «se sube en el
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
  contestar un WhatsApp desde el bloqueo). Formato `32.5x12`, o sólo `12` en ejercicios
  sin peso. Una entrada que no se entiende no registra nada y la notificación lo dice en
  su segunda línea: `No entendí «12 32». Escríbela como 32.5x12.` Si el teléfono exige
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
- Para el token, lo que se decida (ver «Pendiente de decidir»).
- En tests: Robolectric y `androidx.test:core`.

Las piezas:

- **`SessionStore`**: el estado (`workoutId`, ejercicio, grupo muscular, plantilla,
  contador, `restEndsAt`, `restSeconds`) y la cola de series, en `SharedPreferences`;
  el token, cifrado con una clave del Keystore; el mecanismo está en «Pendiente de
  decidir», porque `EncryptedSharedPreferences` (androidx.security) está deprecado.
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

## Pendiente de decidir

Tres cosas que la spec no puede cerrar sola. Hay que decidirlas antes de la fase 1 (las dos
primeras) o de la fase 2 (la tercera).

1. **Series duplicadas en los reintentos.** `POST /workouts/{id}/sets` no lleva ningún
   identificador del cliente y el servidor asigna `set_index` al llegar. Si el servidor
   guarda la serie pero la respuesta no llega, `SessionSender` reintenta y la serie entra
   dos veces. Opciones: un `client_id` generado en el teléfono que el servidor deduplica
   (backend, migración y test), o aceptar el riesgo y corregir a mano.
2. **Dónde vive el token nativo.** `EncryptedSharedPreferences` está deprecado. Opciones:
   cifrarlo con una clave propia del Android Keystore, o `SharedPreferences` privadas sin
   cifrar (sólo las lee la app; en un teléfono sin root es el mismo sitio donde está hoy
   `localStorage`).
3. **Coma decimal en «Otra serie».** La pantalla escribe `32,5 kg` y el teclado español da
   coma, pero el formato pedido es `32.5x12`. Propuesta: aceptar las dos, y que el error
   diga `No entendí «12 32». Escríbela como 32,5x12.`

Otros huecos menores, para la fase que los toque: qué enseña el 4×2 en un ejercicio sin
peso (¿se ocultan los botones de kg?), y cómo se deshace un `+1 serie` accidental desde el
4×1 (hoy, sólo en la app).

## Fases

Cinco, cada una un PR y un APK que se instala y se prueba solo. Ninguna deja la app
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

### Fase 1 · Dueño nativo, cola y token (APK 0.5.0) · día y medio

El plugin `Session` con `SessionStore` (estado y cola en `SharedPreferences`), el token
en `EncryptedSharedPreferences` y `SessionSender` con `WorkManager`. Entreno publica el
estado en cada serie y cambio de ejercicio, y en el APK encola en la cola nativa en vez
de en `fitit_outbox`. Iniciar y cerrar sesión copian y borran el token nativo.

- **Qué se ve:** nada nuevo. Las series se envían igual que antes desde la app, con el
  mismo indicador de «sin enviar» en la tarjeta. La PWA no cambia.
- **Comprobar:** modo avión, tres series, quitar el avión: llegan en orden y una sola
  vez (pero ver «Pendiente de decidir»: un reintento tras una respuesta perdida puede
  duplicar). Matar la app con series sin enviar y volver: se envían. Cerrar sesión y entrar
  con otra cuenta: nada de la anterior se envía.

### Fase 2 · Notificación en curso (APK 0.6.0) · día y medio

`SessionNotification` y `SessionActionReceiver`: la tarjeta de la pantalla de bloqueo
con `+1 serie`, `Otra serie` (campo de texto) y `Saltar`, cronómetro en cuenta atrás,
relabel a `Descanso terminado`, canal silencioso visible en bloqueo, permiso de
notificaciones pedido en la primera serie. `Terminar entreno` en el menú de Entreno y
cierre automático a las dos horas.

- **Qué se ve:** desde la primera serie de fuerza, la notificación de la spec en la
  bandeja y en la pantalla de bloqueo. En Entreno → menú, `Terminar entreno`.
- **Comprobar:** con el teléfono bloqueado, `+1 serie` registra sin desbloquear y el
  contador sube en la tarjeta; `Otra serie` con `35x10` registra eso y el siguiente
  `+1 serie` repite 35×10; `Saltar` quita el reloj; convive con YouTube Music; el reloj
  llega a cero y pasa a `Descanso terminado` sin sonar; `Terminar entreno` la quita;
  matar la app y la tarjeta sigue con sus botones funcionando.

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

### Fase 4 · Widget 4×2 (APK 0.8.0) · un día

El layout con ajuste: `−`/`+` de peso (2,5 kg) y de reps, `Registrar serie`, `⏭`,
`Terminar`, `N sin enviar`. Lo ajustado pasa a ser la plantilla que repiten todos los
`+1 serie`.

- **Qué se ve:** un segundo widget en el selector, «Fitit · Entreno 4×2», como en la
  maqueta.
- **Comprobar:** subir el peso dos veces y registrar: la serie entra con +5 kg y la
  notificación repite ese peso; modo avión y `1 sin enviar` en ámbar, que desaparece
  al volver la red; `Terminar` vacía los dos widgets y la notificación.

Después, si hace falta: iOS (Live Activities) tiene su propia spec. Y si el Xiaomi
algún día recibe Android 16, el chip de «Live Updates» sobre la misma notificación.

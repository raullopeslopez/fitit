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
   adelantarlas. Regla: **una sola cola, nativa**: la página deja de tener la suya
   (`fitit_outbox`) y encola en la nativa; el nativo envía en orden, con o sin app
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
  no hay que reescribirla cada segundo ni despertar nada. Al llegar a cero pasa a
  `Descanso terminado` y `Saltar` desaparece. Con `Descanso: Sin`, no hay reloj ni
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
│ 4 series                                     │
│ [ − ]   32,5 kg   [ + ]    [ − ]  12  [ + ]  │
│ [            Registrar serie              ]  │
│ 1 sin enviar                       Terminar  │
└──────────────────────────────────────────────┘
```

- Peso a pasos de 2,5 kg; reps de 1 en 1. `⏭` salta el descanso.
- `Registrar serie` / `+1 serie` **vibran** (una pulsación corta) y el contador sube ahí
  mismo. Es lo único que vibra en toda la feature.
- `1 sin enviar` sólo aparece cuando hay algo en cola; en verde nunca, en `--muted`.
- `Terminar` cierra el control: quita la notificación, vacía el estado, el widget vuelve
  a «sin entreno». Las series ya registradas no se tocan (una sesión en Fitit es un día;
  no hay nada que «cerrar» en el servidor).
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
  de notificaciones se pide una vez, al registrar la primera serie del APK.
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
| Fin del descanso | El reloj marca cero y el texto pasa a `Descanso terminado`. Sin sonido ni vibración |
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
`Registrar sin abrir` y la preferencia `fitit_rest_notice`, y la cola `fitit_outbox` de la
página (pasa al nativo en el APK; en la PWA se queda como está).

Se conserva, porque son reglas y no código: una serie se escribe en disco antes de tocar
la red; se envía en orden; lo que se repite es la plantilla, no la serie con hora; cardio
fuera; «descanso» y «control» son cosas distintas.

## Cómo se construye (resumen técnico)

Un plugin local de Capacitor (`frontend/android/…/fitit/session/`), sin dependencias
nuevas:

- **`SessionStore`**: el estado (`workoutId`, ejercicio, grupo muscular, plantilla,
  contador, `restEndsAt`, `restSeconds`) y la cola de series, en `SharedPreferences`;
  el token en `EncryptedSharedPreferences` (androidx.security, Keystore).
- **`SessionNotification`**: construye y actualiza la notificación en curso
  (`NotificationCompat`, `setOngoing`, cronómetro en cuenta atrás, tres acciones, una
  con `RemoteInput`). Canal silencioso, visibilidad pública.
- **`SessionWidget`** (`AppWidgetProvider` + `RemoteViews`) con los dos layouts.
- **`SessionActionReceiver`**: recibe los toques de notificación y widget. Aplica el
  cambio al estado, repinta las vistas, vibra si toca, y pide envío.
- **`SessionSender`**: vacía la cola en orden contra `POST /workouts/{id}/sets` con
  `WorkManager` (red disponible, reintentos con espera). La misma cola la usa la página.
- **`SessionPlugin`** (JS ↔ nativo): `publish(state)` desde Entreno en cada serie o
  cambio de ejercicio; `enqueue(set)` para las series de la app; `end()`; `setToken()` /
  `clearToken()`; evento `changed` para que la pantalla se repinte cuando algo llega de
  fuera. En web, cada función es un no-op y `enqueue` cae en `offline.js`.
- Un relabel al fin del descanso con `AlarmManager` inexacto (no importa que llegue un
  minuto tarde: el reloj ya lo enseña).
- Tipografía: Geist Mono para las cifras exige empaquetar la fuente en `res/font`
  (~100 KB). Si no, la mono del sistema. Decisión de diseño pendiente.

## Verificación

- JS: el plugin se simula en vitest como los demás de `platform/`; se comprueba qué
  publica Entreno y cuándo, y que en web no se llama a nada.
- Nativo: `SessionStore`, el parseo de «Otra serie» y el receptor con JUnit + Robolectric
  (hoy el proyecto Android no tiene ningún test propio; se estrenan aquí).
- En el teléfono, que es lo único que prueba lo que importa: bloquear y tocar `+1 serie`
  sin desbloquear; `Otra serie` desde el bloqueo; convivir con YouTube Music; modo avión
  y `N sin enviar`; matar la app y ver que el widget sigue; el widget en los dos tamaños.

## Fases

| Fase | Qué se ve | Coste |
|---|---|---|
| 1 · Dueño nativo + notificación | La notificación en curso con sus tres botones; se borra lo viejo; token y cola nativos | 2 días |
| 2 · Widget 4×1 | El widget mínimo, `Empezar` y `Terminar` | 1 día |
| 3 · Widget 4×2 | Peso y reps con botones | Medio día, si se decide tras ver la maqueta |

## Decisiones pendientes del product owner

1. Tamaño del widget: ¿4×1, 4×2 o los dos? ¿`Empezar entreno` dentro?
2. Confirmar que en la PWA desaparece `Registrar sin abrir` (con esta spec se borra su
   implementación).
3. Geist Mono empaquetada en el APK, o mono del sistema para las cifras del widget.

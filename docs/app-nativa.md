# App nativa con Capacitor — plan por fases

Decidido: la app nativa es **la misma app React envuelta en Capacitor 8**, con la interfaz
empaquetada dentro (no cargando `fitit-n4q0.onrender.com`). La PWA sigue viva en Render
con el mismo código. La IA (Gemini) está toda en el backend y no se toca.

## Criterio para meter un proyecto open source

Un plugin entra **sólo si da algo que hoy no tenemos** o que Capacitor no trae de serie.
La base son los plugins oficiales `@capacitor/*` (MIT, Ionic); uno de la comunidad entra
cuando cubre un hueco que el oficial no cubre, o lo cubre claramente mejor. Además tiene
que estar vivo: release en 2026, compatible con Capacitor 8 y con uso real.

Datos sacados de npm el 2026-09-25 (versión, última publicación, descargas/semana).

## Elegidos

| Necesidad | Hoy (web) | Plugin | Licencia | Vivo | Qué aporta que no tengamos |
|---|---|---|---|---|---|
| Código de barras | `BarcodeDetector`: no existe en iOS | `@capacitor-mlkit/barcode-scanning` (Capawesome) | Apache-2.0 | 8.2.1 · sep 2026 · 103k/sem | Funciona en iPhone. Escaneo **en vivo** con la cámara, no sólo foto, y además decodifica desde una foto (`readBarcodesFromImage`), así que el flujo actual sigue sirviendo. Supera al oficial `@capacitor/barcode-scanner`, que sólo escanea en vivo |
| Login con Google | Google Identity Services, bloqueado dentro de un WebView | `@capgo/capacitor-social-login` | MPL-2.0 | 8.5.11 · sep 2026 · 139k/sem | Selector de cuenta nativo. Trae también **Sign in with Apple** en el mismo plugin. Sigue entregando un `id_token`, así que `/auth/google` apenas cambia |
| Token de sesión | `localStorage`, que iOS puede vaciar | `@aparajita/capacitor-secure-storage` | MIT | 8.0.1 · sep 2026 · 172k/sem | Keychain / Keystore cifrados. El oficial `Preferences` no cifra |
| Pantalla encendida entrenando | `navigator.wakeLock`, poco fiable en WebView | `@capacitor-community/keep-awake` | MIT | 8.0.1 · abr 2026 · 78k/sem | No hay equivalente oficial |
| Salud (peso, pasos) | Nada | `@capgo/capacitor-health` | MPL-2.0 | 8.11.4 · sep 2026 · 22k/sem | HealthKit y Health Connect con una sola API. Alternativa MIT: `capacitor-health` (9,7k/sem); se elige en esa fase |
| Actualizar sin pasar por tienda | No aplica | `@capawesome/capacitor-live-update` | MIT | 8.4.3 · sep 2026 · 42k/sem | Cambios de JS/CSS sin recompilar ni reinstalar; los bundles pueden servirse desde Render. Más simple que `@capgo/capacitor-updater`, que está pensado para su nube |
| Escanear la tabla nutricional | Foto cruda | `@capacitor-mlkit/document-scanner` | Apache-2.0 | 8.2.1 · sep 2026 · 4k/sem | Recorte y enderezado automáticos antes de mandarla a Gemini. **Opcional**: poco uso y hay que comprobar su soporte en iOS antes de adoptarlo |

**Oficiales** (MIT, Ionic, todos en Capacitor 8): `app` (botón atrás, volver a primer plano),
`status-bar`, `splash-screen`, `keyboard`, `preferences` (preferencias y cola offline, en
lugar de `localStorage`), `camera` (foto de la tabla ya redimensionada, que abarata la
subida a Gemini), `local-notifications` (fin del descanso aunque la app esté en segundo
plano, en lugar del service worker), `haptics`, `network`, `share`; y `push-notifications`
cuando haga falta avisar desde el servidor.

### Sobre MPL-2.0 (los plugins de Capgo)
Es copyleft **por archivo**: sólo obliga a publicar cambios que hagas *dentro de sus
archivos*. Usarlo sin modificar en una app de tienda, incluso de pago, no obliga a nada
más. Apache-2.0 y MIT no ponen condiciones prácticas.

## Descartados

| Plugin | Motivo |
|---|---|
| `@codetrix-studio/capacitor-google-auth` | Abandonado: último release en mayo de 2024, se quedó en Capacitor 6 |
| `@capacitor-community/barcode-scanner` | Abandonado: 2023, Capacitor 5 |
| `@perfood/capacitor-healthkit` | Abandonado y sólo iOS: Capacitor 4 |
| `@capacitor-community/apple-sign-in` | Vivo, pero `social-login` ya lo cubre |
| `@capacitor-firebase/authentication` | Metería Firebase para duplicar un login que ya hace el backend |
| `@capacitor-community/sqlite` | La cola offline es pequeña y `Preferences` basta. Se reconsidera si algún día se registra entero sin red |
| `capacitor-live-activities` | 1,3k/sem y un solo mantenedor. Para la isla dinámica, mejor Swift propio |
| Biometría (`native-biometric`, `biometric-auth`) | Ahora mismo no resuelve nada |

**Sin open source fiable, en Swift/Kotlin propio** (sólo si se quieren): widget de
pantalla de inicio y Live Activity del descanso.

## Fases

Cada fase se puede usar sola y ninguna rompe la PWA.

### Fase 0 — Preparar la web (sin nativo, sin cambios visibles) · hecha
Módulos en `frontend/src/platform/`: `storage`, `http` (base de API y versión),
`googleIdentity`, `scanner`, `network`, `serviceWorker`, `notify`, `wakelock`.
`platform/boundary.test.js` falla si algo fuera de esa carpeta vuelve a llamar al
navegador directamente.

- Carpeta `frontend/src/platform/` con un módulo por capacidad: `auth`, `storage`,
  `scanner`, `notify`, `keepAwake`, `apiBase`. Implementación web = la de hoy. Los
  componentes dejan de llamar a `navigator`, `localStorage` o `window.google` directamente.
- `api.js` y `auth.js` con base de API configurable. CORS en FastAPI para
  `capacitor://localhost` y `https://localhost`.
- Cabecera `X-Client-Version`: permite al backend responder «actualiza la app» a un
  cliente viejo. Los contratos de la API sólo se amplían.
- Plugins: ninguno.

### Fase 1 — Android para uso propio · hecha
- Proyecto en `frontend/android/`, paquete `io.github.raullopeslopez.fitit`. La
  interfaz va dentro del APK y habla con `https://fitit-n4q0.onrender.com`
  (`frontend/.env.android`).
- Plugins: `@capacitor/app` (botón atrás), `@capgo/capacitor-social-login` (Google),
  `@capacitor-community/keep-awake`.
- **Quitados del plan** por no aportar nada en Android: `preferences` y
  `secure-storage` (el `localStorage` del WebView vive en los datos privados de la
  app y Android no lo vacía; el problema era de iOS), `status-bar` (Capacitor 8
  gestiona las barras del sistema él solo), `splash-screen` (basta el arranque
  del sistema con el icono).
- Icono adaptativo generado de `brand/fitit-icono-app.svg`, con capa monocroma
  para los iconos temáticos de Android 13+.
- Firma: `android/app/fitit-debug.keystore`, versionada a propósito para que todos
  los APK lleven la misma firma (actualizar sin desinstalar, y la huella que
  Google reconoce). Es de depuración: no sirve para publicar.

**Descargar:** https://github.com/raullopeslopez/fitit/releases/latest/download/fitit.apk
— siempre el último. Cada push a `main` que toque el frontend lo recompila y lo
publica en la Release de su versión (`android-v<version>`); una versión nueva
de `package.json` abre una Release nueva. También a mano: Actions → «Android APK»
→ *Run workflow*. En un PR el APK queda como artefacto `fitit-apk` del run.

**Compilar en local:** `cd frontend && npm run android:apk` (Android SDK y JDK 21) →
`android/app/build/outputs/apk/debug/app-debug.apk`.

**Una vez, en Google Cloud Console** (para que funcione «Continuar con Google»):
APIs y servicios → Credenciales → Crear credenciales → ID de cliente OAuth →
tipo **Android**, en el **mismo proyecto que el cliente web** (número de proyecto
`387241176763`, el prefijo del ID web; hay otro proyecto llamado «Fitit» que **no** es
ese, y un cliente creado allí da `[28444] Developer console is not set up correctly`):
- Nombre del paquete: `io.github.raullopeslopez.fitit`
- Huella SHA-1: `61:11:8D:6A:D2:53:0E:E2:2F:68:0A:AE:B0:42:84:FA:79:CF:4A:8F`

No hay que copiar el ID nuevo en ningún sitio: la app sigue pidiendo el token con
el ID web, y el cliente Android sólo le dice a Google que este APK es de confianza.

**Lo que en el APK todavía no hay** (vuelve en la fase 2): el aviso de la pantalla
de bloqueo con «+1 serie», que en la PWA hace el service worker. La barra de
descanso en pantalla funciona igual. El lector de códigos de barras depende de que
el WebView del teléfono traiga `BarcodeDetector`; si no, el botón no aparece y se
teclea o se lee la tabla, como en un iPhone.

### Fase 2 — Lo que la web no daba
- `@capacitor-mlkit/barcode-scanning`: escaneo en vivo del código de barras.
  **Hecho** (`platform/scanner.js`): en el APK «Abrir la cámara» abre el escáner de
  Google (`BarcodeScanner.scan()`, EAN-13/8, UPC-A/E, sin permiso de cámara) y el
  código sigue el mismo camino que el de una foto (`GET /foods/barcode/{ean}`, y
  `POST /foods` si la ficha sirve). Cerrar el escáner sin código lleva al peldaño de
  la tabla («No he leído ningún código.»). Si al teléfono le falta el módulo de
  Google, se pide para la próxima y esta vez se hace una foto y ML Kit busca el
  código en ella (`readBarcodesFromImage`, por la ruta del fichero). No recoge un
  resultado que llegue por `appRestoredResult` (Android mató la app con el escáner
  delante): se vuelve a escanear.
- `@capacitor/camera`: foto de la tabla ya reducida antes de subirla.
  **Hecho** (`platform/camera.js`): `Camera.getPhoto` con la cámara trasera, 1600 px
  de ancho y calidad 80, devuelta como `File` para `readLabel` y con la ruta dentro
  para ML Kit. La web sigue con el `<input capture>`.
- `@capacitor/local-notifications` + `haptics`: el fin del descanso avisa y vibra con la
  pantalla bloqueada o la app en segundo plano.
- Opcional: `document-scanner` para la tabla (sólo Android si no se confirma iOS).
- **Qué notarás:** en Comida, escanear pasa a ser apuntar con la cámara sin hacer
  foto; el aviso del descanso llega siempre.

### Fase 3 — iOS
- `@capacitor/ios`, los mismos plugins; firma y TestFlight (99 $/año de Apple).
- Añadir WebKit a `npm run test:browser`, porque iOS pinta con WebKit y no con Chromium.
- **Qué notarás:** lo mismo que en Android. El escáner de códigos funciona por primera vez
  en iPhone.

### Fase 4 — Salud
- `@capgo/capacitor-health` (o `capacitor-health`): leer el peso de la báscula para
  la pantalla de Peso y, si interesa, pasos o energía activa.
- Decisión pendiente: sólo leer, o también escribir los entrenos en Salud.
- Una medida que falta en Salud es `NULL`, no `0` (misma regla que en Comida).

### Fase 5 — Tienda (sólo si se decide publicar)
- Política de privacidad y **consentimiento explícito** antes de mandar fotos o datos de
  comida a Gemini (Apple 5.1.2).
- **Borrar la cuenta desde la app** (Apple 5.1.1(v)); hoy no existe.
- **Límite de uso de IA por usuario**; hoy hay una sola cuota de Gemini para todos.
- Sign in with Apple (ya incluido en `social-login`).
- `@capawesome/capacitor-live-update` para actualizaciones OTA,
  `@capacitor-community/in-app-review` y `@capawesome/capacitor-app-update`.
- `@capacitor/push-notifications` si hace falta avisar desde el servidor.

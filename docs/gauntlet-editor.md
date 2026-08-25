# Gauntlet: el editor de ejercicio

Contexto permanente para constructores y críticos. **Léelo entero antes de empezar.**
Si algo aquí contradice tu encargo, manda el encargo; si contradice `DESIGN.md`, manda
`DESIGN.md` y dilo en vez de desviarte en silencio.

## Qué se está construyendo

Un solo editor de ejercicio compartido por Entreno y Progreso — renombrar, fusionar
duplicados, retaguear, anotar y borrar — sin salir de la sesión. Rama
`editor/ejercicio-unificado`. Móvil a 430×932, tema oscuro, tokens de `DESIGN.md`.

Método: siete piezas, cada una con un constructor y un crítico **de contexto fresco**.
El crítico compara paneles sin etiquetar a ciegas, elige uno, y nombra el único hueco
más grande que queda. Una pieza no se cierra hasta que el crítico elige la nuestra.

## El listón

El panel de propiedades de una issue de Linear, que su web pública monta en **DOM real**
(`linear.app`, `window.scrollTo(0,470)`). Medible con `getComputedStyle`, no una captura.
Medido: filas de 24px a paso de 32 con `gap: 8px`, cero cromo, etiquetas a 12px/510 con
12.73:1, el panel no mueve el contenido, y **no existe el botón de guardar**.

Su punto débil, también medido: cinco de sus siete filas son `<div>` que no hacen nada,
sus blancos táctiles miden 24px, y sus etiquetas de sección dan 3.22:1.

## Las tres cifras que decide el usuario

| | línea base | ahora |
|---|---|---|
| toques para corregir un nombre mal escrito | 4 | **1** (cursor al final, `sel 13/13`) |
| px que el editor le roba al log | 257 (1335→1600) | **0** |
| ¿sobrevive un `peso × reps` a medio escribir? | **no** (`42.5×9` → `37.5×10`) | **sí** — `42.5 × 9` intactos |

## Estado de las piezas

| | pieza | estado |
|---|---|---|
| 01 | el disparador | **ganada** · `6630e95` · 2 rondas |
| 02 | la entrada | **ganada** · `3b86bd9` · 3 rondas |
| 03 | la retícula de campos | **ganada** · `7d1e2c2` · 2 rondas y un cierre |
| 05 | el guardado | construida · `4672000` · sin juzgar |
| 04 | el choque de nombre duplicado | construida · sin juzgar |
| 06+07 | el borrado y la salida | sin empezar, van juntas |

Backend `156187b`: el 409 del renombrado devuelve
`{code, message, exercise:{id, name, kind, set_count}}`. El mock de :8000 ya lo sirve, y
`apiFetch` ya lo cuelga del error (`err.detail`) sin tocar `err.status`, que es por lo que
la bandeja de salida distingue «sin señal» de «juzgada y rechazada». La pieza 4 lo usa
para convertir el choque en una oferta de fusión en sitio, en las dos pantallas.

## Banco de pruebas

Ya está corriendo; no levantes el tuyo.

- Vite en `http://localhost:5173/`
- Mock del backend en `http://localhost:8000` — respeta el 409 de nombre duplicado,
  la fusión, el borrado y el retagueo. Siembra un duplicado a propósito:
  «Press banca» con 48 series y «Press de banca» con 6.

## Cómo se mide, y los tres cepos

**Primero la suite de geometría**, que es más barata que cualquier medición a mano:

```
cd frontend && npm run test:browser     # ~16 s, Chromium real vía Playwright a 430×932
```

Cubre: nada rebanado en un barrido de scroll, nada bajo la barra fija, la maquetación
que no se mueve, el suelo de 44px, contraste sobre el color realmente pintado, los
controles de registro despejados, y que `elementFromPoint` coincida con la geometría.
**Úsala antes de abrir un navegador a mano.** Si tu cambio se puede juzgar ahí, no
arrastres el Chromium.

Cuando de verdad necesites ver la pantalla:

```
B=~/.claude/skills/gstack/browse/dist/browse
$B connect
$B viewport 430x932
$B goto http://localhost:5173/
$B js "localStorage.setItem('fitit_token','mock')"
$B goto http://localhost:5173/
$B js "let c='';for(const s of document.styleSheets){try{for(const r of s.cssRules){if(r.type===CSSRule.MEDIA_RULE&&r.conditionText.includes('dark')){for(const q of r.cssRules)c+=q.cssText+'\n';}}}catch(e){}}const e=document.createElement('style');e.textContent=c;document.head.appendChild(e)"
$B js "document.querySelectorAll('button.link-row')[0].click()"   # sesión de arriba → Entreno
$B click "text=Progreso"
```

Tres cepos que ya se han comido a varios agentes:

1. **La extensión de Chrome no entra en `localhost`.** Falla con `Script injection timed
   out`. Sólo tiene permiso para el dominio de producción. Usa el Chromium de gstack.
2. **Ese Chromium no tiene bandera de tema oscuro.** Hay que inyectarle el bloque
   `prefers-color-scheme: dark` de la propia hoja de estilos, **después de cada
   navegación**.
3. **Un bucle `for` de `scrollTo` + medir nunca cede un frame**, así que el rAF que
   recoloca el panel no corre y lees posiciones viejas. Toda lectura geométrica va
   después de dos `requestAnimationFrame` y ~20 ms de reposo. Esto ha producido dos
   «sigue fallando» que eran falsos.

Además: `$B js` se rompe con ids que llevan espacios (`weight-Press militar`) — usa
`document.getElementById(...)`. Para tu sesión con `$B stop` al terminar; deja vite y el mock.

## Un agente por árbol

**Nunca corren dos agentes que escriban sobre este checkout.** No es una regla de cortesía:
los conjuntos de ficheros pueden estar limpios y aun así romperse, porque un agente hace
operaciones de git **de todo el repo** sin saber que hay un vecino. Pasó el 2026-08-25 con
dos agentes a los que se les había repartido `styles.css` en propiedad: un `git stash` para
re-medir la línea base se llevó por delante las ediciones en vuelo del otro, un `pop` dejó
`ExerciseEditor.jsx` sintácticamente roto, y recuperarlo truncó tres ficheros a cero bytes
antes de rescatarlos de un commit colgante con `git fsck`. Además el hook tuvo que saltarse
con `SKIP_TESTS=1`, porque corría la suite contra obra ajena a medias.

Lo único seguro de paralelizar es trabajo que **no toca ficheros del repo**: el mock del
scratchpad, un documento que nadie más tiene abierto.

## Reglas de la casa que este trabajo ha ido descubriendo

- **Un control cortado por un borde opaco no se lee como tapado, se lee como roto.** El
  panel no parte nada: o lo deja limpio, o lo tapa entero y lo marca `inert`.
- **Nada tapado sin necesidad.** Llegar a cero rebanados *creciendo* hasta que lo que ibas
  a partir te quepa dentro de la sombra no es el mismo logro que atracar a tamaño fijo.
  `DESIGN.md`: cuando una acción rara y una por serie compiten por el espacio, gana la de
  serie, siempre.
- **El contraste se mide sobre el color pintado, incluido el velo de `:hover`.** El rojo
  destructivo pasaba en reposo y suspendía al pasar el dedo por encima.
- **El fondo de tema claro es papel cálido `#F4F2EE`, no blanco.** Un token comprobado
  contra blanco puro puede estar suspendiendo desde hace meses.
- **jsdom no tiene motor de maquetación**: `getBoundingClientRect()` devuelve ceros y los
  tests del editor se fabrican una geometría falsa. Demuestran que la aritmética es
  correcta, no que se le haya hecho la pregunta correcta. Para eso está la suite de
  navegador.

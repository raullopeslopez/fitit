# Dieta planificada: brainstorming

Fase 1 de la idea «en lugar de registrar lo que comí, parto de una dieta ya
planificada». Fecha: septiembre 2026. **No implementa nada y no decide nada**:
recoge ideas, las ordena, y separa lo que es criterio de producto de lo que es
consecuencia técnica. Se cierra cuando Raúl diga que se cierra; después viene el
análisis de requisitos técnicos, y sólo después la implementación.

---

## 0. La inversión, en una frase

Hoy el día alimentario nace **en blanco** y tú lo rellenas. Con un plan, el día
nace **escrito** y tú lo confirmas.

Eso cambia tres cosas a la vez, y conviene no confundirlas:

| | Hoy (diario) | Con plan |
|---|---|---|
| Qué haces al abrir la app | buscar un alimento y teclear gramos | mirar lo que toca y decir sí |
| Qué pregunta contesta la pantalla | ¿cuánto llevo? | ¿qué me queda por comer? |
| Cuál es la métrica | totales contra objetivo | **adherencia** al plan |

La tercera es la nueva de verdad. Las dos primeras son interfaz; la adherencia
es un concepto que hoy no existe en ninguna tabla.

## 1. ¿Qué es «un plan»? Cinco niveles, y hay que elegir

No todos cuestan lo mismo ni sirven para lo mismo. De menos a más concreto:

| Nivel | Qué contiene | ¿Existe ya? |
|---|---|---|
| 0 | Objetivos diarios: kcal y macros | **Sí**, `objetivo_kcal`, `objetivo_proteina`, `objetivo_grasa`, `objetivo_hidratos` |
| 1 | Objetivos **por tipo de día** (entreno / descanso) | No. Ya estaba pendiente en `comida-pendiente.md` |
| 2 | Un **reparto por comidas**: desayuno 600 kcal / 40 g proteína, etc. | No |
| 3 | Un **menú**: alimentos y gramos concretos en cada comida | No |
| 4 | Una **rotación**: 7 días distintos, o un ciclo A/B que se repite | No |
| 5 | **Reglas** en vez de menú: «proteína en cada comida», «2 piezas de fruta» | No |

Mi lectura: el producto que estás describiendo es el **nivel 3**, porque es el
único que permite «confirmar en lugar de teclear» — un nivel 2 te dice cuánta
proteína te falta, pero seguirías buscando el alimento a mano, que es justo el
trabajo que quieres quitarte.

Pero el nivel 3 no sustituye a los otros: **conviven**. Un plan de nivel 3
implica uno de nivel 2 (los subtotales de cada comida) y uno de nivel 0 (la suma
del día). Se derivan hacia arriba, no se teclean dos veces. El nivel 5 es otra
cosa —no se confirma, se comprueba— y yo lo dejaría para una fase posterior.

## 2. ¿De dónde sale el plan?

Cinco entradas posibles. Ordenadas por lo que cuesta construirlas:

- **A mano, en la app.** Control total, y es lo más caro de usar: un plan de 5
  comidas × 4 alimentos × 7 días son 140 filas que teclear. Insostenible como
  única puerta, imprescindible como puerta de escape.
- **Copiando un día a otro.** «Aplica el lunes al resto de la semana», «repite la
  semana pasada». Abarata el punto anterior hasta hacerlo viable, y es barato.
- **Desde lo que ya comes.** Fitit ya sabe qué repites y en qué cantidad —
  `frequent_foods` contesta exactamente eso. «Móntame el plan con lo de siempre»
  y luego lo corriges. Es la opción con mejor relación valor/coste.
- **De una foto o un PDF del plan del nutricionista.** El camino ya existe:
  `read_label` fotografía una etiqueta y un modelo la lee. Aquí el objeto es otro
  (una tabla de comidas, no una etiqueta), pero la regla de CLAUDE.md es la misma
  y **no admite excepción**: cifras interpretadas por un modelo ⇒ pantalla de
  «Revisa la lectura» obligatoria. Un plan mal leído no se equivoca una vez, se
  equivoca todos los días hasta que lo corrijas.
- **Generado por la app desde los objetivos.** Esto es *prescribir una dieta*.
  Lo dejaría fuera, y no por lo técnico: no es lo que has pedido —tú tienes tu
  criterio, la app no— y me parece el tipo de función que te acaba peleando.

## 3. La pantalla del día, con plan

Lo que hoy es una lista vacía con un botón «Añadir» pasa a ser una lista ya
escrita. Cada fila del plan tiene **tres estados, no dos**:

- **Pendiente**: toca más tarde. A las 10:00 la cena no está incumplida, está por
  llegar. El reloj decide, y esto es lo que separa «voy bien» de «voy fatal».
- **Comido**: confirmado. Escribe una entrada normal en el diario.
- **Saltado / cambiado**: lo dijiste tú. No es lo mismo saltárselo que cambiarlo.

Y un cuarto estado que no es un estado sino su ausencia: **no dicho**. Un plan
que no confirmaste no es un plan incumplido. Es la misma regla del `NULL` que ya
gobierna los nutrientes, aplicada al nuevo dominio, y creo que debe ser regla
permanente de esta fase igual que aquélla lo es de la anterior.

Lo que gana la cabecera: hoy pinta **cuánto falta de cada macro**, que es un
número que no te dice qué hacer. Con plan puede pintar **qué te queda por
comer**, que es una lista de alimentos — accionable sin traducir nada.

Lo que no desaparece: el flujo de «Añadir» de siempre, para lo que comes y no
estaba en el plan. Un plan no puede cerrar la puerta a la realidad.

## 4. Sustituciones: el corazón de un plan real

Un plan de nutricionista no dice «150 g de pollo». Dice «150 g de pollo **o** 180
de pavo **o** 2 huevos». Si la app no modela eso, el plan es falso desde el
primer día y tú acabas registrando a mano igual que ahora.

Ideas, de la más simple a la más lista:

- **Grupo de equivalencias en el propio plan**: la fila lleva alternativas
  escritas por ti. Simple, honesto, y es lo que ya trae el papel.
- **Sustituto calculado desde el catálogo**: busca en CIQUAL algo de macros
  parecidos. Suena brillante y falla en la cocina — «te propongo 210 g de tofu»
  cuando no hay tofu en casa.
- **Sustituir como acción de primera clase** en la fila (deslizar → «Lo cambié»),
  no borrar y volver a añadir. Y lo importante: **cambiar no es incumplir** si
  cae dentro de la tolerancia.

## 5. Adherencia: cuidado, son dos métricas

Hay dos preguntas distintas y es tentador contestarlas con un solo porcentaje:

1. **¿Seguiste el plan?** Literal: filas confirmadas sobre filas planificadas.
2. **¿Diste los números?** Nutricional: kcal y macros comidos sobre planificados.

Cambiar pollo por pavo es 100 % en la segunda y 0 % en la primera. Comerte el
plan entero más media tarta es 100 % en la primera y un desastre en la segunda.
**Ninguna de las dos sola sirve.** Mi propuesta: la métrica que se enseña es la
nutricional, y la literal se usa para diagnosticar (ver abajo).

Lo que la métrica literal permite decir, y es lo más útil de todo:

- **Qué comida se te rompe.** «La cena es donde se cae el plan, 4 de 7 días.»
- **Qué alimento nunca te comes.** Si llevas tres semanas saltándote el pescado
  del jueves, **el plan está mal, no tú**. Eso es una propuesta de corrección,
  no un reproche.
- **Tolerancia.** El plan dice 150 g, comiste 165. Sin una banda (¿±10 %?) todo
  se pinta como fallo y la métrica deja de mirarse a la semana.

## 6. Reglas de la casa que esto NO puede tocar

Son las de `CLAUDE.md` y siguen valiendo enteras. Las escribo aquí porque las
tres primeras deciden la arquitectura y conviene tenerlas sobre la mesa antes
del análisis técnico, no después:

- **El plan no escribe en `log_entries` por su cuenta.** Confirmar una fila crea
  una entrada normal, con sus macros congelados en ese momento. El plan es de
  dónde sale *la propuesta*; el diario sigue siendo el registro de lo que pasó.
  Esta decisión es la que hace la feature barata: todo lo que ya funciona
  —totales, subtotales por comida, desconocidos, corregir, recalcular— sigue
  funcionando sin tocarlo.
- **`POST /foods` sigue siendo la única puerta.** Un plan que nombra un alimento
  que no tienes, o lo casa con uno existente, o lo da de alta por ahí.
- **El día corta a las 04:00.** Un plan de «cena» a la 01:00 es del día anterior,
  con la misma regla de siempre. Si el plan trae horas, tienen que respetarla.
- **Un plan no se borra: se corrige.** Mismo criterio que con los alimentos, y
  por la misma razón — con un matiz que merece su propio punto:

### El plan también congela

Los planes cambian: acaba la definición, empieza el volumen. Si mides la
adherencia de marzo contra el plan de septiembre, el pasado se reescribe solo.
Es **exactamente** el problema que ya resolvió el congelado de `log_entries`, y
la respuesta razonable es la misma forma: o el plan tiene fechas de vigencia, o
cada día guarda una copia de lo que tocaba.

Y con él vuelve el dilema de `POST /food-log/recompute`: un plan que **cambió**
(nueva fase) no es lo mismo que uno **mal tecleado** (nunca fue cierto). No hace
falta resolverlo ahora, pero el análisis técnico no puede saltárselo.

## 7. Lo que sólo esta app puede hacer

Fitit tiene los entrenos y la comida en la misma base de datos, y eso es el
motivo del proyecto. Con un plan aparecen cruces que una app de dieta sola no
puede ni plantearse:

- **Día de entreno y día de descanso los sabe la app.** El nivel 1 de la tabla de
  arriba estaba pendiente porque había que decidir quién marca el tipo de día.
  Con `days` en la misma base, deja de ser una decisión de producto y pasa a ser
  una consulta. Es el punto donde la feature sale casi gratis.
- **Comidas ancladas al entreno, no al reloj.** El batido post-entreno no es «a
  las 19:00», es «cuando cierres la sesión». La app sabe cuándo cierras.
- **Adherencia contra rendimiento.** Es la pregunta que justifica todo el
  proyecto: *¿las semanas que cumpliste el plan subiste más?* Cruce de adherencia
  semanal con volumen y con marcas. No lo pondría en la v1, pero sí diseñaría los
  datos para que quepa.

## 8. Piezas de alrededor (cada una es una feature, no un detalle)

- **Lista de la compra.** Una semana de plan es una suma determinista de
  ingredientes. Barato de calcular, caro de pantalla, y altísimo valor si haces
  batch cooking.
- **Avisos.** «Toca la merienda.» Hay `notify.js` y la app es PWA instalable.
  Mucho valor de conducta y mucho riesgo de molestar: lo haría opt-in y por
  comida, nunca por defecto.
- **Suplementos.** Casi todo plan real trae creatina, un batido, vitamina D. No
  son alimentos con macros: son casillas. Modelarlos como alimentos ensucia los
  totales; modelarlos aparte es otra tabla.
- **Pausar el plan.** Vacaciones, una cena fuera, una semana mala. Sin pausa, una
  semana de descanso se pinta como un desastre de adherencia y dejas de mirar la
  métrica. Barato de construir, y sin ello la métrica se muere.
- **«Cerrar el día»** (ya estaba en `comida-pendiente.md` sin saber qué haría):
  con un plan por fin significa algo — es el momento en que la adherencia del día
  se congela y deja de moverse.

## 9. Lo que yo dejaría fuera, para que puedas discrepar

- **Generar la dieta automáticamente** desde los objetivos (§2, última entrada).
- **Compartir el plan con un nutricionista**, o cualquier cosa multiusuario. La
  app es personal y esto le cambiaría la forma entera.
- **Sustitutos calculados** desde el catálogo (§4): suena mejor de lo que funciona.
- **Micronutrientes** más allá de lo que trae CIQUAL. Un plan que promete hierro
  y zinc con datos que no tienes miente.
- **Nivel 5 (reglas)** en la primera fase: es un motor distinto al de confirmar.

## 10. Dependencia incómoda que conviene ver ahora

**Un plan real casi nunca está hecho de alimentos sueltos.** Dice «lentejas de
mamá», no «lenteja cocida 80 g + chorizo 20 g + patata 50 g». Y la comida
guardada (recetas) es justo una de las tres piezas que `comida-pendiente.md`
dejó fuera **por no tener dónde apoyarse**: no hay tabla de comidas, ni de
ingredientes, ni decisión sobre qué se congela al registrarlas.

O sea: puede que la dieta planificada **no sea la siguiente feature, sino la
siguiente-siguiente**. No lo doy por hecho —un plan de alimentos sueltos es
perfectamente construible y quizá te vale— pero es la primera pregunta que hay
que contestar, porque cambia el tamaño del proyecto entero.

## 11. Decisiones que necesito de ti para cerrar la fase

Ninguna es técnica. Todas son criterio de producto, y las seis cambian el
análisis de requisitos:

1. **¿Menú o marco?** ¿El plan dice «120 g de pollo» (nivel 3) o «40 g de
   proteína en la comida» (nivel 2)?
2. **¿De dónde sale tu plan en la v1?** A mano, desde lo que ya comes, o de una
   foto del papel del nutricionista.
3. **¿Cuál es la unidad?** ¿Un día que se repite, una semana, un ciclo A/B?
4. **¿El plan manda o acompaña?** ¿La pantalla Comida se abre en el plan, o el
   plan es una pestaña y el diario sigue siendo la casa?
5. **¿Adherencia literal o nutricional?** (§5) — o las dos, y cuál se enseña.
6. **¿Hace falta la comida guardada antes?** (§10) La más cara de las seis.

---

## Apéndice: de dónde sale lo que dice este documento

| Afirmación | Fuente | Confianza |
|---|---|---|
| Qué guarda hoy el diario y qué congela | `backend/app/models.py`, `CLAUDE.md` | **Alta** (código leído) |
| Objetivos fijos por usuario, sin tipo de día | `models.py:43-55` | **Alta** |
| `frequent_foods` da alimento + cantidad + comida | `tests/features/frequent_foods.feature` | **Alta** |
| Comida guardada / racha / cerrar el día no existen | `docs/comida-pendiente.md` | **Alta** |
| Camino de foto → modelo → revisión obligatoria | `tests/features/read_label.feature`, `CLAUDE.md` | **Alta** |
| Cómo es «un plan de nutricionista real» | Criterio propio, sin verificar contra planes tuyos | **Media** |
| Que la tolerancia deba ser ±10 % | Invención mía, puesta para que la discutas | **Baja** |

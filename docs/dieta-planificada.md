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
- **Generado por la app, combinando tus alimentos.** Es por donde Raúl ha
  seguido, y tiene su propia parte: **ver la Parte II**. Ojo a la distinción,
  porque yo había descartado «generar la dieta» y esto no es lo mismo: que la
  app *prescriba* qué debes comer lo sigo dejando fuera; que **tú pongas la
  despensa y los requisitos y la app haga la combinatoria** es otra cosa, y el
  criterio sigue siendo tuyo.

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

- ~~Generar la dieta automáticamente~~ — **retirado**: era otra cosa (§2, Parte II).
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

---

# Parte II — El plan no se teclea: se genera

Segunda vuelta (21 de septiembre). Raúl reencuadra la idea: no se trata de
copiar un plan escrito, sino de **ir del alimento al plan** — listar lo que
comes, poner los requisitos, y que la app haga las combinaciones. Con tres
añadidos: elaboraciones, modo de cocinado, y que la semana no se repita.

Esto no es un matiz de la Parte I: es otra feature. Lo que allí era «de dónde
sacas el plan» aquí es **el plan es una salida, no una entrada**.

## 11. La ingeniería inversa

Tres piezas, y la app ya tiene media primera:

- **La despensa.** El universo cerrado de lo que comes. No son los 3.185 de
  CIQUAL: son cuarenta o sesenta cosas. Y Fitit ya sabe cuáles —
  `frequent_foods` contesta literalmente «lo que repites, en qué cantidad y en
  qué comida». La despensa se siembra sola.
- **Los requisitos.** Aquí está el trabajo de verdad, porque no son sólo macros.
  Al menos cinco familias, y las cuatro últimas son las que hacen que el
  resultado se pueda comer:

  | Familia | Ejemplos |
  |---|---|
  | Nutricional | kcal ±5 %, proteína ≥ 160 g, grasa entre 60 y 80 g |
  | Estructural | 5 comidas, proteína en todas, el desayuno lleva fruta |
  | Práctica | máximo 2 elaboraciones por comida, nada de +15 min entre semana |
  | Preferencia | pescado 2 veces por semana, arroz como mucho 3 |
  | Inventario | usar lo que hay, comprar en formatos que existen |

- **Las combinaciones.** La salida.

### El aviso que hay que tener delante todo el rato

Esto es el *problema de la dieta* clásico (Stigler, años 40): el primer problema
que se resolvió con programación lineal. Y su respuesta famosa fue una dieta
nutricionalmente perfecta, baratísima y **absolutamente incomible** — harina,
col y alubias secas, todos los días del año.

La moraleja aplica entera: **el optimizador no falla, acierta en lo que le
pides**. Si sólo le pides macros, te da macros. Todo lo que hace que un plan se
siga —variedad, esfuerzo, que te apetezca— tiene que estar *escrito como
requisito*, o no existe. Por eso la tabla de arriba tiene cuatro filas que no
son nutricionales y sólo una que lo es.

### Resolver no, proponer

Dos productos muy distintos:

- **Solver que emite «el» plan.** Una respuesta, opaca. Si no te gusta, vuelves
  a generar y sale otra cosa distinta en todo.
- **Generador con fijar y volver a tirar.** Te propone, tú **fijas** las filas
  que te valen y **cambias** sólo la que no. «La comida me vale, cámbiame la
  cena.»

La segunda, sin dudarlo. Es más útil, es más explicable, y sobre todo degrada
bien: cuando los requisitos son imposibles, un solver dice «no hay solución» y
un generador te enseña lo que sí ha podido montar.

Y un caso que no es un error, es la mitad del producto: **pedir lo imposible**.
160 g de proteína de una despensa de arroz, aceite y manzanas no tiene solución.
La app tiene que decir **qué requisito es el que no cabe** y ofrecer aflojarlo.
Un «no se puede» a secas convierte la herramienta en un juguete.

## 12. Elaboraciones: lo que de verdad se combina

Distinción que conviene fijar en el vocabulario desde hoy:

- **Alimento**: lo que existe y tiene ficha. `Pollo, pechuga, cruda`.
- **Elaboración**: lo que te comes. `Pechuga a la air fryer con pimentón`.

Una elaboración es **ingredientes + modo + (opcional) raciones**.

**Y la recomendación fuerte: el generador combina elaboraciones, no alimentos.**
Combinar alimentos sueltos da «180 g de pollo + 60 g de arroz + 15 g de aceite»,
que no es una comida: es un tique de la compra. Combinar elaboraciones da un
plato que ya sabes hacer. Es la diferencia entre un plan que se lee y un plan
que se cocina.

Consecuencia directa, y es la cara: **esto confirma el §10 de la Parte I**. Las
elaboraciones *son* la comida guardada que `comida-pendiente.md` dejó fuera. Ya
no es «puede que haga falta antes»: es que sin ella no hay nada que combinar.

Dos cosas que el esquema ya tiene y conviene no redescubrir:

- **`foods.is_recipe`** existe como columna… y **no la usa nadie**: aparece una
  sola vez en todo el repo, en su propia definición. Es exactamente el caso de
  `archived` — una columna de una fase que no se construyó. Cuando se diseñe
  esto hay que decidir si se hereda o se ignora, pero no descubrirla a medias.
- **La tabla `Portion`** (`label`, `grams`, `is_default`) sí está en uso, en
  routers y en pantalla. Es «1 huevo = 60 g», y es justo el idioma en el que un
  plan tiene que hablar: **«2 huevos», no «120 g»**. Un plan generado en gramos
  exactos se lee como una receta de laboratorio.

## 13. El modo de elaboración (la air fryer no es un detalle)

Es la aportación más técnica de esta vuelta, y hace **tres cosas distintas** que
se confunden con facilidad. Separarlas es medio diseño.

### a) Cambia los nutrientes, y no poco

- **La grasa añadida.** Es el motivo de la air fryer: el mismo pollo con una
  cucharadita en vez de un dedo de aceite. 10 g de aceite son ~90 kcal. Sin
  modelarlo, un plan se equivoca en cientos de kcal al día — más que cualquier
  error de pesada.
- **El agua.** Este es el traicionero. Un filete pierde en torno a un cuarto de
  su peso al cocinarse; el arroz lo multiplica. Si el plan dice 150 g y tú pesas
  el plato hecho, no estás cometiendo un error pequeño: estás en otra cifra.

  **De aquí sale la pregunta que hay que contestar sí o sí: ¿se pesa en crudo o
  en cocinado?** Las dos son legítimas y mezclarlas en silencio es cómo un plan
  miente sin dar ningún error. Cada elaboración tiene que decir en cuál de las
  dos habla.

  Y la buena noticia, **verificada en el catálogo que ya tienes cargado**: CIQUAL
  distingue las dos y además trae el modo como filas separadas —
  `Pollo, pechuga, carne y piel, cruda`, `…, asada al horno`,
  `Pollo, pechuga, sin piel, a la plancha o salteada`. El eje que te importa ya
  está en los datos; lo que falta es que el modelo sepa leerlo.
- **Lo que dejaría fuera:** pérdida de vitaminas por cocinado y acrilamida.
  CIQUAL no lo sostiene por método de forma fiable, y prometerlo sería inventar.

**El agujero: la air fryer no está en CIQUAL.** Lógico — es una tabla francesa
de alimentos, no un catálogo de electrodomésticos; lo único que aparece con
«freidora» son patatas congeladas. Así que hay que decidir a qué se parece. Mi
hipótesis: **air fryer ≈ «al horno», menos el aceite que no le has echado**
(aire seco y caliente, misma física). Es razonable y **no está verificada**;
si el plan se apoya en ella, que sea diciéndolo.

### b) Es una restricción práctica — y esto es lo que te importa ahora

La air fryer no es sólo un dato nutricional: es una **capacidad y una
preferencia**. Te la has comprado y la quieres usar. Eso entra en los requisitos:

- «Usa la air fryer al menos 4 veces por semana.»
- «En la air fryer cabe **una bandeja**»: no puedes hacer tres cosas a la vez
  para la misma comida. Es una restricción física de verdad, y es de las que
  separan un plan que se ejecuta de uno que se admira.
- «Entre semana, nada que pase de 15 minutos.»
- El modo decide también el **batch**: el horno y la olla cocinan para cuatro
  días, la air fryer es de ración. Cambia la lista de la compra y el domingo.

### c) Es variedad gratis

Mismo pollo y mismo arroz, pero hoy a la plancha y el jueves a la air fryer con
pimentón, y son dos comidas distintas. **La variedad por modo no cambia la
compra, no cambia los macros, y sí cambia que te aburras.** Es la variedad más
barata que existe, y conecta directamente con lo siguiente.

## 14. Que la semana no se repita

«Variedad» hay que definirla o no se puede programar. Ejes, y no valen lo mismo:

- **Repetición de elaboración**, no de alimento. Comer pollo cuatro veces por
  semana preparado de cuatro formas no es monotonía; es como come todo el mundo.
  **Lo que cansa es el plato, no el ingrediente** — así que la variedad se mide
  sobre elaboraciones (y §13c la abarata).
- **Distancia, mejor que tope.** «No dos días seguidos» es más útil y más fácil
  de entender que «como mucho 3 por semana». Un enfriamiento por plato.
- **Memoria entre semanas.** Es tu requisito explícito y es el que obliga al
  generador a **mirar hacia atrás**: sin recordar la semana pasada, puede
  cumplir «no repetir dentro de la semana» y devolverte la misma semana otra vez.
- **Variedad ≠ caos, y es configurable por comida.** Mucha gente quiere —yo
  diría que tú también— el **desayuno igual todos los días** y variedad en la
  cena. Un plan que te reinventa el desayuno cada mañana se abandona en cuatro
  días. La variedad tiene que poder ser distinta en cada hueco.

## 15. Dos arquitecturas, y una tercera que creo mejor

Aquí está la decisión cara, y las tres llegan a sitios distintos:

**A. Rotación.** Tú apruebas un repertorio de elaboraciones por hueco (5 de
desayuno, 12 de comida…) y la app las baraja respetando el enfriamiento. Los
macros **se informan**, no se garantizan. Barata, predecible, sin solver, y
probablemente te da el 80 % del valor.

**B. Solver.** Requisitos dentro, plan fuera, macros garantizados dentro de una
banda. Cara, y sólo sirve si explica bien lo que no puede hacer (§11).

**C. Rotación que ajusta cantidades.** ← la que recomiendo.
Los platos salen por rotación (A), y **luego se escalan las cantidades** para
cerrar los números. Cada elaboración declara qué ingrediente es **fijo** y cuál
es **de ajuste**: «Pechuga a la air fryer con arroz» → 200 g de pechuga fijos,
el arroz se mueve entre 40 y 120 g.

Por qué es mejor de lo que parece: convierte un problema combinatorio feo en
**un mando de una sola dimensión por comida**. Elegido el plato, sólo queda
resolver gramos, que es aritmética de la que ya vive en `nutrition.py`. Y se
explica en una frase: «hoy más arroz, que has entrenado».

## 16. Lo que se rompe cuando el plan se genera

- **¿Y si no lo cumplo?** Si el martes te saltas la cena, ¿se recalcula el resto
  de la semana? Es tentador y es una trampa: **un plan que se mueve solo deja de
  ser un plan**. Yo no regeneraría nada automáticamente, y pondría un
  «recalcular lo que queda» explícito, que pulsas tú.
- **La lista de la compra deja de ser un extra y pasa a ser la salida natural**:
  si la semana la ha generado la app, la compra ya está calculada.
- **Los formatos existen.** El pollo se vende en bandejas de 1 kg, no en 940 g.
  Un plan que deja 60 g huérfanos cada semana es un plan que tira comida. No lo
  metería en la v1, pero es lo que separa un plan de una semana real.
- **Una elaboración no es una fila de `foods`.** Sus macros se calculan desde los
  ingredientes en `nutrition.py`; no se guardan como alimento. Si colamos platos
  en el catálogo, `POST /foods` deja de ser la puerta que es y la búsqueda se
  llena de cosas que no son alimentos.

---

# Parte III — ¿Y si metemos IA?

Tercera vuelta (21 de septiembre). La pregunta es buena y llega en el momento
justo: **la Parte II deja dos agujeros que la aritmética no sabe tapar** — de
dónde salen las elaboraciones, y cómo se decide qué pega con qué. Los dos son
exactamente donde un modelo es bueno.

## 17. Ya hay IA dentro, y ya decidiste cómo se usa

Esto no es empezar de cero. Fitit corre sobre **Gemini** (`gemini-3.8-flash`),
y hay dos módulos que valen como doctrina:

- **`gemini.py`** — cliente async, reintentos, y algo que ya te costó aprender:
  distingue el 429 de **cuota del día** del de **cuota del minuto**
  (`_quota_scope`). Eso se reusa tal cual; no se vuelve a escribir.
- **`label.py`** — el importante, porque no es plomería, es criterio. Su tipo de
  salida se documenta solo: `LabelRead`, *«Una propuesta para el formulario.
  **Ni un alimento, ni una entrada**»*. Y alrededor, tres defensas:
  `_sane()` comprueba que la cifra esté en un rango creíble,
  `_backed_by_a_row()` exige que el modelo **haya transcrito la fila** que dice
  estar leyendo, y `ColumnRefused` **se niega** en vez de adivinar cuando la
  lectura no venía por 100 g.

Ahí está el patrón de la casa, y yo no lo tocaría: **el modelo propone, algo
determinista valida, y tú confirmas.** La salida del modelo es un tipo aparte
que no puede entrar en el dominio sin pasar por esas tres puertas. Cualquier IA
nueva de esta feature debería tener su propio `label.py`.

## 18. El reparto: el modelo NO hace cuentas

La tentación obvia es «que el modelo monte la semana». No lo haría, y el motivo
no es ideológico:

- **Un LLM es malo en la aritmética que esto necesita.** No fallar en una suma:
  cerrar 160 g de proteína ±5 % a lo largo de 35 comidas, con gramos que tienen
  que cuadrar contra una tabla. Te va a dar números **plausibles que no suman**,
  que es la peor clase de error porque se lee bien.
- **Y ya tienes la aritmética exacta**, y además es regla permanente tuya: *toda
  la aritmética nutricional vive en `nutrition.py`*. Un modelo calculando
  totales rompe esa regla, no la extiende.
- **Al revés, es bueno justo donde el solver es inútil.** «¿Qué se puede hacer
  con pollo, arroz, pimentón y una air fryer en 15 minutos?» no tiene solución
  algorítmica: es cultura de cocina. Y es *exactamente* lo que le falta al
  optimizador para no darte la dieta de Stigler (§11).

De ahí sale el reparto, y encaja con la arquitectura C sin forzar nada:

> **La IA escribe el recetario. La aritmética planifica la semana.**

El modelo puebla el repertorio de elaboraciones; la rotación elige y el ajuste
de gramos cierra los números. Cada uno haciendo lo que sabe.

## 19. Dónde metería IA, por valor

1. **Poblar el repertorio desde tu despensa.** ← la de más valor, con diferencia.
   Es la que mata el arranque en frío: en la arquitectura A o C, el repertorio
   es lo que te cuesta una tarde de teclear, y sin él no hay nada que barajar.
   «Tengo estos 40 alimentos y una air fryer, dame 15 platos de menos de 15
   minutos» y tú tachas los que no te gustan. **Se hace una vez, se revisa, y
   se queda como datos.**
2. **Leer el plan del nutricionista** de una foto o un PDF (Parte I §2). Es
   extracción, la misma forma que `read_label`, y el `label.py` de esto es casi
   un calco. Revisión obligatoria, sin excepción.
3. **Macros de un plato casero.** «Lentejas de mi madre» no está en CIQUAL y
   nunca lo estará. El modelo propone una ficha, tú la corriges. Es dato
   interpretado, así que por tu propia regla: pantalla de revisión, y entra por
   `POST /foods` como todo lo demás.
4. **Sustituciones en lenguaje natural.** «No tengo merluza, ¿qué pongo?» — el
   modelo propone, y **la aritmética comprueba** que el cambio cabe en la banda
   (§4). Híbrido limpio: idea del modelo, veredicto de `nutrition.py`.
5. **Explicar por qué no se puede.** Cuando los requisitos son imposibles (§11),
   que en vez de «sin solución» diga en castellano cuál aflojar. Barato y es de
   lo que más separa una herramienta de un juguete.

## 20. Dónde no la metería

- **Que el modelo componga la semana y diga los gramos** (§18).
- **Que calcule totales o adherencia.** Eso es `nutrition.py`, y punto.
- **Que prescriba la dieta.** Sigue fuera por lo mismo que en la Parte I: el
  criterio nutricional es tuyo, no de la app.
- **Chatear con el plan** («¿por qué me has puesto tanto arroz el martes?»).
  Suena moderno, cuesta una conversación entera por respuesta, y lo contesta
  mejor una línea de texto fija junto al ingrediente de ajuste.

## 21. El principio que ordena todo lo anterior

> **IA en el momento de montar, no en el momento de usar.**

Tres razones, y ninguna es teórica:

- **Determinismo.** Un plan que sale distinto cada vez que lo abres no es un
  plan. La semana tiene que ser la misma el martes que el jueves.
- **Sin red no hay plan.** La app es PWA instalable y tiene `offline.js`. Un
  plan que necesita llamar a Google para existir es un plan que **no está en el
  supermercado**, que es justo donde lo necesitas.
- **La cuota ya te ha mordido.** El 429 de la lectura de etiquetas es real, y el
  contador «4 hoy» no se pudo construir precisamente porque la cuota es de
  Google y compartida (`comida-pendiente.md`). Generar semanas a demanda
  multiplica llamadas sobre un recurso que ya sabes que se agota.

La consecuencia es cómoda: **la IA produce datos que tú revisas y se guardan.**
A partir de ahí la semana se genera con aritmética, es reproducible, es
instantánea y funciona en el metro.

## 22. Lo que habría que decidir de esto

12. **¿Entra la IA en la v1, o primero el repertorio a mano?** Se puede construir
    todo esto sin una sola llamada y añadirla después: la IA rellena una tabla
    que ya existiría igualmente. **Esa es su gracia y también el argumento para
    dejarla para después.**
13. **¿Cuántos platos de golpe, y quién los aprueba?** Mi respuesta: en tandas,
    y ninguno entra sin que lo hayas visto — igual que la lectura de etiqueta.
14. **¿Qué se le enseña al modelo?** ¿Sólo la despensa, o también lo que ya has
    comido y puntuado? Lo segundo es mejor y abre la puerta a «me gusta / no me
    gusta», que es una feature entera.
15. **¿El modelo propone alimentos que no tienes?** Si le dejas salir de la
    despensa te propone mejor comida y te rompe la lista de la compra. Yo lo
    ataría a la despensa, con un «sugerencias fuera de la lista» aparte.

Y una que no es de producto y por eso no va numerada: **con qué modelo**. Hoy
todo es Gemini y lo razonable es seguir, aunque sea otra tarea (generar, no
leer). Eso se mira en la fase técnica, no ahora.

---

# Parte IV — Los objetivos dejan de teclearse

Cuarta vuelta (21 de septiembre). Raúl: *«hay una funcionalidad que setea
calorías y esto no es realista»*. Lo que quiere en Ajustes es **el objetivo**, y
que las calorías salgan de ahí; y luego **preferencias sobre cómo llegar** —
proteína de 1,5 a 2 g/kg, verdura y tubérculos, legumbres— con la puerta abierta
a **meter una regla nueva que haya descubierto** y que el menú la recoja.

Es la misma ingeniería inversa de la Parte II, pero aplicada un piso más arriba:
allí el menú era la salida, aquí **el número también lo es**.

## 23. Lo que hay hoy, y por qué tiene razón

Cuatro columnas en `users`: `objetivo_kcal`, `objetivo_proteina`,
`objetivo_grasa`, `objetivo_hidratos`. Fijas por usuario, tecleadas a mano. Tres
cosas fallan, y las tres las nombra él con una palabra:

1. **Es un número que te inventas.** Nadie sabe sus kcal de mantenimiento a ojo,
   y equivocarse en 300 es trivial y lo cambia todo.
2. **No se mueve.** Tu cuerpo cambia y la cifra sigue donde la dejaste. Un
   objetivo fijo es exacto el primer día y mentira al segundo mes.
3. **No dice nada de *cómo* llegar.** 2.400 kcal se alcanzan con legumbres y
   verdura o con bollería. El número no distingue, y es justo lo que te importa.

## 24. Tres capas, y la de en medio es nueva

> **Objetivo** (qué quieres que le pase a tu cuerpo)
> → **Derivación** (cuántas kcal tocan)
> → **Reglas** (cómo se reparten)

El cambio de fondo: **las cifras dejan de ser entrada y pasan a ser salida**.
`objetivo_kcal` deja de ser algo que tecleas y pasa a ser algo que la app
calcula y te enseña. Las cuatro columnas no desaparecen necesariamente, pero
cambian de naturaleza: pasan de *lo que dijiste* a *lo que sale*, que es un
cambio de modelo, no de pantalla.

## 25. La derivación: fórmula para arrancar, tu propio historial después

Hay dos formas y la diferencia entre ellas es enorme:

- **Por fórmula** (Mifflin-St Jeor y un factor de actividad). Necesita peso,
  altura, edad, sexo y una estimación de lo que te mueves. Da un número con
  pinta de exacto y un error de un par de cientos de kcal con facilidad — el
  factor de actividad es un dedo al viento con decimales.
- **Midiéndolo en tus datos.** Tu mantenimiento real es lo que comiste de media
  durante unas semanas, corregido por lo que se movió tu peso. Es mucho más
  fiable que cualquier fórmula, y **sólo lo puede hacer una app que tenga las
  dos cosas**. Fitit tendría el diario; le falta el peso.

Lo razonable es tener las dos: **la fórmula arranca, la medición manda en
cuanto hay datos.** Y que la pantalla diga cuál está usando, porque presentar
una estimación con la misma tinta que una medición es la clase de mentira
tranquila que esta app evita en todo lo demás.

### El bloqueo, y está verificado

**No hay peso corporal en el modelo.** `users` tiene usuario, contraseña,
correo, `google_sub` y los cuatro objetivos: ni peso, ni altura, ni edad, ni
sexo. Y el `weight` que sí existe es el de `sets` — el hierro que levantas;
`bodyweight_set.feature` va justo de series **sin** peso.

Consecuencia directa: **sin kilos no hay g/kg, y sin histórico de kilos no hay
medición**. Registrar el peso a lo largo del tiempo no es un campo en Ajustes,
es una feature con lo suyo: el peso diario oscila más de un kilo por agua, así
que hace falta media o tendencia, o el objetivo se pondrá a temblar solo.

La contrapartida: ese mismo dato es el que cierra el círculo de la Parte I §7
—adherencia contra resultado—, así que no es un peaje, es la pieza que faltaba.

## 26. Las reglas: lo que de verdad has pedido

«1,5 a 2 g/kg de proteína» **no es un número**, y por eso no cabe en la pantalla
de hoy. Tiene tres propiedades que una casilla no puede expresar:

- Es un **rango**, no un punto.
- Es **relativa a algo que cambia** (tu peso).
- Está en **otra unidad** que la que consume el motor (g/kg, no g).

Y «verdura, tubérculos, legumbres» es de otra especie todavía: no habla de
macros, habla de **qué hay en el plato y cada cuánto**. Una taxonomía de salida:

| Tipo de regla | Ejemplo |
|---|---|
| Rango relativo | proteína 1,5–2 g/kg de peso |
| Reparto del total | grasa entre el 25 % y el 35 % de las kcal |
| Presencia | verdura en comida y en cena |
| Frecuencia semanal | legumbres ≥ 3, pescado ≥ 2 |
| Tope | menos de X de azúcar añadido |
| Práctica | las de §11: tiempo, bandejas, días fuera |

Fíjate en lo que pasa con esto: **los cuatro `objetivo_*` de hoy son un caso
particular** de la primera fila, con el rango colapsado a un punto y sin nada
relativo. La pantalla nueva no añade opciones a la vieja: la contiene.

## 27. Duras y blandas (o el generador no encuentra nada)

Si todas las reglas son obligatorias, la respuesta va a ser «no hay solución»
casi siempre — mete siete restricciones sobre cuarenta alimentos y el espacio se
queda vacío. Así que cada regla necesita **dureza**:

- **Dura**: la proteína. Si no se cumple, el plan no vale.
- **Blanda**: legumbres tres veces. Si salen dos, es peor pero es un plan.

El generador cumple todas las duras y **maximiza las blandas**. Y el mensaje de
fallo deja de ser un muro: «he podido meter legumbres 2 veces, no 3» en vez de
«sin solución», que es exactamente lo que pedía §11.

## 28. El agujero de los grupos, y también está verificado

Para que «verdura y tubérculos» signifique algo, la app tiene que saber a qué
grupo pertenece cada alimento. **No lo sabe.** El import de CIQUAL escribe once
campos —nombre, plegado, origen, referencia, convención de hidratos, los cinco
macros y el JSON de nutrientes— y **ninguno es el grupo**; `ciqual_es.json` es
sólo traducciones y alias.

La buena noticia es que CIQUAL sí clasifica sus alimentos en origen, así que lo
más probable es que baste con **leer esas columnas del `.xls` y una migración**,
no con etiquetar 3.185 filas a mano. Hay que confirmarlo contra el fichero
antes de prometerlo.

Y una trampa que es tuya de siempre: **los alimentos que das de alta tú no
tendrán grupo**. Una regla de «legumbres 3 veces» no puede tratar en silencio lo
no etiquetado como «no es legumbre». Es `NULL` otra vez: *desconocido*, no cero.
O se pide el grupo al crear un alimento, o la regla dice en voz alta cuántas
cosas no pudo clasificar.

## 29. «Un objetivo nuevo que haya descubierto»

Esta es la petición con más consecuencias de las cuatro, porque lo que pide es
**añadir una regla sin tocar código**. Tres formas:

- **A. Catálogo cerrado de tipos, con parámetros.** La app conoce los seis tipos
  de la tabla de §26 y tú los instancias con tus números. Acotado, comprobable
  con tests, y añadir una regla *nueva de un tipo que ya existe* es gratis.
- **B. Texto libre que interpreta el modelo.** «He leído que conviene llegar a
  30 g de fibra» → el modelo lo convierte en restricción. Flexible del todo, y
  con el riesgo de una regla que no puedes auditar.
- **C. Un mini-lenguaje propio.** Para una app personal, no.

**A como motor, B como puerta.** El motor sólo ejecuta reglas tipadas y
validadas; el modelo únicamente **traduce** lo que leíste a uno de esos tipos y
tú lo confirmas. Es literalmente la doctrina de `label.py` otra vez: propuesta →
validación → confirmación → dato. Y cuando lo que has leído no encaja en ningún
tipo, que **lo diga** en vez de inventarse una regla — que es `ColumnRefused`
otra vez.

Lo honesto del trade-off: con esto, añadir un *tipo* nuevo sigue siendo tocar
código. Lo que se vuelve libre es todo lo demás, que es el 90 % de las veces.

## 30. Lo que se mueve cuando el objetivo se mueve

- **Congelar el objetivo por día pasa de opcional a obligatorio.** En
  `comida-pendiente.md` ya estaba el aviso: el objetivo es del perfil, no del
  día, y cambiarlo reescribe la racha del pasado. Con un objetivo *derivado*,
  que cambia solo, eso deja de ser una molestia y pasa a garantizar un pasado
  falso. Hay que guardar qué tocaba cada día.
- **El objetivo no puede perseguir el ruido.** Si las kcal se recalculan a
  diario desde un peso que oscila un kilo por agua, el número tiembla y dejas de
  creértelo. Tendencia, y recálculo cada semana, no continuo.
- **¿Y si meto una regla a media semana?** Misma respuesta que en §16: nada se
  regenera solo. Un «aplicar al resto de la semana» que pulsas tú.
- **Las reglas también tienen historia.** «Desde octubre subí la proteína» es
  una frase que la app tendrá que poder contestar.

## 31. Lo que habría que decidir de esto

16. **¿Se registra el peso, y cada cuánto?** Es el prerrequisito duro: sin él no
    hay g/kg ni derivación. *Mi recomendación: pesarse cuando quieras, y que la
    app use la tendencia, no la última cifra.*
17. **¿Fórmula, medición, o las dos?** *Mi recomendación: fórmula para las
    primeras semanas, medición en cuanto haya historial, y decir cuál se usa.*
18. **¿El objetivo se recalcula solo o te lo propone?** *Mi voto: te lo propone
    y lo aceptas. Un número que cambia sin avisar no se obedece, se desconfía.*
19. **¿Se reimportan los grupos de CIQUAL, y qué pasa con tus alimentos?**
    (§28) La segunda mitad es la que duele.
20. **¿Catálogo cerrado de tipos de regla?** (§29) *Mi voto: sí, con el modelo
    sólo traduciendo.*

## 32. Decisiones: lo que ya has contestado y lo que falta

De las seis de la primera vuelta, **la segunda vuelta contesta cuatro**:

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Menú o marco? | **Menú** — combinaciones concretas, no cuotas de macro |
| 2 | ¿De dónde sale? | **Generado** desde tu lista de alimentos |
| 3 | ¿Cuál es la unidad? | **La semana**, y una semana no repite a la anterior |
| 6 | ¿Hace falta la comida guardada? | **Sí**: las elaboraciones son eso, y van primero |

Siguen abiertas las dos de entonces:

4. **¿El plan manda o acompaña?** ¿La pantalla Comida se abre en el plan, o el
   plan es una pestaña y el diario sigue siendo la casa?
5. **¿Adherencia literal o nutricional?** (§5) — o las dos, y cuál se enseña.

Y la Parte II añade cinco nuevas. La primera es la urgente: es la que, mal
resuelta, hace que todo lo demás cuadre sobre el papel y no en la báscula.

7. **¿Se pesa en crudo o en cocinado?** (§13a) No hay opción de no decidirlo.
8. **¿Arquitectura A, B o C?** (§15) Rotación barata, solver caro, o rotación con
   ingrediente de ajuste — yo voto C.
9. **¿Qué huecos quieres fijos y cuáles variados?** (§14) Lo más probable:
   desayuno fijo, cena variada. Dilo tú, que es puro gusto.
10. **¿Te vale «air fryer = horno sin el aceite»?** (§13a) Es una hipótesis mía
    sin verificar, y es la cifra sobre la que se apoyará media semana tuya.
11. **¿Cuántos requisitos prácticos tienes de verdad?** (§11) Tiempo entre
    semana, bandejas de air fryer, días que comes fuera. Sin esa lista, el
    generador optimiza a ciegas — y ahí es donde sale la dieta de Stigler.

Y la Parte III añade cuatro más, desarrolladas en **§22**: si la IA entra en la
v1 o después (12), quién aprueba los platos (13), qué se le enseña al modelo
(14) y si puede salirse de la despensa (15).

Y la Parte IV añade cinco, desarrolladas en **§31**: si se registra el peso (16),
fórmula o medición (17), si el objetivo se recalcula solo (18), los grupos de
alimento (19) y si el catálogo de tipos de regla es cerrado (20).

**La 16 sube al primer grupo**: no es una preferencia, es un prerrequisito — sin
peso no hay g/kg, y sin g/kg la mitad de esta vuelta no existe.

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
| CIQUAL trae el modo de cocinado como filas aparte | `grep` sobre `backend/data/ciqual_es.json` | **Alta** (verificado) |
| No hay air fryer en CIQUAL | mismo `grep`: sólo patatas de freidora | **Alta** (verificado) |
| `foods.is_recipe` existe y no lo usa nadie | `grep -rn is_recipe`: 1 sola aparición | **Alta** (verificado) |
| `Portion` existe y está en uso | routers, schemas y pantalla | **Alta** (verificado) |
| La carne pierde ~1/4 de peso al cocinarse | De memoria; orden de magnitud, no cifra | **Media-baja** |
| Air fryer ≈ horno sin aceite añadido | Hipótesis mía, sin verificar | **Baja** |
| La dieta de Stigler y su moraleja | De memoria, no consultado en esta sesión | **Media** |
| El proyecto corre sobre Gemini (`gemini-3.8-flash`) | `backend/app/config.py` | **Alta** (verificado) |
| `gemini.py` ya distingue cuota de día y de minuto | `_quota_scope`, leído | **Alta** (verificado) |
| `label.py` trata la salida del modelo como propuesta | `LabelRead`, `_sane`, `_backed_by_a_row`, `ColumnRefused` | **Alta** (verificado) |
| Que un LLM falle cerrando macros a ±5 % en 35 comidas | Criterio propio, no medido contra este modelo | **Media** |
| No hay peso corporal en el modelo | `users` leído entero; `sets.weight` es la carga | **Alta** (verificado) |
| El import de CIQUAL no guarda el grupo | Los 11 campos de `load()`, leídos | **Alta** (verificado) |
| CIQUAL sí clasifica por grupos en origen | De memoria, **sin comprobar contra el `.xls`** | **Media** |
| El error típico de Mifflin-St Jeor y el factor de actividad | De memoria, orden de magnitud | **Media-baja** |
| El peso corporal oscila ~1 kg por agua | De memoria, orden de magnitud | **Media** |

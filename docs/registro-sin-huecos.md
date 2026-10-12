# Registro sin huecos: el plan como lo previsto, tu vida como contexto

Plan del 12 de octubre de 2026. Sale de una fase de análisis (misma fecha): la app
suponía que registras **todo** y **con precisión**, y la evidencia dice que ninguna
de las dos cosas pasa. Esto es el orden en que se construye la alternativa.

## 0. En una frase

> **El plan es lo previsto; cada comida se cierra con un toque; lo que no se dice
> queda como «sin decir», nunca como cero; y la app aprende tus sitios y tu compra
> para que salirse del plan cueste poco.**

## 1. Por qué (resumen del análisis)

- **Constancia antes que precisión.** Registrar decae (menos de la mitad sigue en la
  semana 10) y lo registrado se queda corto (más de un tercio infra-registra >25 %,
  medido con agua doblemente marcada). Un sesgo constante se calibra con el peso; un
  hueco intermitente no.
- **La estructura funciona.** Menús y lista de la compra rinden como dar la comida
  hecha (Wing y Jeffery, 1996); los planes estructurados, 1,4–6,1 kg más al año.
- **La rigidez rompe.** El control de todo o nada se asocia a desinhibición y peor
  mantenimiento; el flexible, a mejores resultados. Las recaídas se concentran en
  tardes y fines de semana.
- **La precisión necesaria es una pregunta abierta** (el ensayo que la resuelve, de
  Stanford, aún no recluta).
- **Lo que nadie resuelve** es la comida que cocina otro sin publicar su receta; la
  IA con foto se queda unas 300 kcal corta, sobre todo en grasas que no se ven.

## 2. Lo que ya existe y no se toca

- Plan semanal con pauta, generado con tu objetivo; `plan_entries.status` con
  `NULL` = «no dicho» (ya distinto de saltado).
- `done` escribe el diario con los gramos congelados; `swapped` con `dish_id`
  escribe el diario con otro plato tuyo.
- Gasto medido desde el peso (`targets.gasto_medido`), con la heurística
  `dia_completo` = 3 de 4 comidas apuntadas.
- Catálogo del súper (Mercadona, Eroski), lista de la compra, envío a Taski.
- `dishes.basis` ya distingue crudo de cocinado.

## 3. Dos medidas, definidas una vez

- **Resuelta:** una comida del plan de la que has dicho algo (hecha, otra cosa,
  fuera, saltada o «no sé»).
- **Conocida:** una comida resuelta cuya energía se sabe (todas menos «no sé»).
- **Día completo** (para el gasto): todas sus comidas planificadas son conocidas.
  Sin plan ese día, sigue la heurística de hoy.
- **Métrica del producto:** % de comidas resueltas por semana, y semanas seguidas por
  encima del 90 %. No la precisión en kcal.

## 4. Fases

Cada fase se entrega sola, en prod, y se mide antes de empezar la siguiente.

### Fase 1 — Lo que falta se ve

**Objetivo:** que la app distinga «no comí» de «no lo dije», y que el gasto deje de
contar días a medias como días de comer poco.

**En pantalla**
- **Comida → total del día:** un día pasado con alguna comida planificada sin decir
  enseña `—` en vez de la suma. Hoy, las comidas cuya hora no ha llegado no cuentan
  como hueco.
- **Comida → arriba:** si ayer quedó algo sin decir, una franja
  «Ayer · Cena · sin decir» con las mismas salidas que la fila. Desaparece al
  resolverla o a los 2 días.
- **Plan → revisión semanal:** la pregunta «¿Apuntaste todo lo que comiste?» se
  sustituye por «27 de 28 comidas resueltas · 1 sin decir · Peso −0,4 kg». El
  objetivo nuevo, si toca, debajo como ahora.

**Toques:** ninguno nuevo; la revisión pasa de 1–2 toques a 0.

**Backend:** un día cuenta para el gasto si cumple la regla de las tres comidas
**o** tiene todas sus comidas del plan dichas — una puerta más, nunca menos días:
en prod (12 oct) sólo 1 de 56 comidas del plan estaba dicha, y reemplazar la
regla habría dejado el gasto sin datos. `GET /targets/review` devuelve
`plan_meals` y `plan_meals_said`.

**Hallazgo al construirla:** una comida del plan sólo se podía cerrar el mismo
día. La API ya aceptaba la hora de un día pasado; era el frontend el que no lo
ofrecía. Ahora se cierra después, con el mediodía de aquel día, y lo que no ha
llegado no se confirma («eso todavía no ha pasado»).

**Ajuste sobre lo planeado:** el total de un día pasado no se cambia por `—`
(escondería lo que sí se sabe); debajo sale «Cena sin decir: este total no es el
del día.». Y la revisión **conserva la pregunta** con el recuento encima («Dijiste
3 de 28 comidas del plan.»): con los datos de prod, quitarla dejaría el gasto sin
la única señal de semana a medias.

**Escenarios:** día con una comida sin decir no entra en el gasto; día sin plan usa
la heurística; día con todo resuelto entra aunque tenga pocas kcal.

**Hecho cuando:** el gasto de prod se calcula con días completos y la revisión
enseña el recuento real de tu última semana.

### Fase 2 — Cuatro salidas en cada comida

**Objetivo:** salirse del plan cuesta 1–2 toques y no se castiga.

**En pantalla** (Comida → fila de una comida planificada de hoy o de ayer):
`[ Hecho ] [ Otra cosa ] [ Fuera ] [ No sé ]`

- **Hecho:** como ahora.
- **Otra cosa:** tus platos (es el `swapped` que ya existe, con más visibilidad).
- **Fuera:** hoja «¿Qué comiste?» → «Describir» o «Foto» → «¿Con aceite o salsa?»
  Sí / No → se enseña la cifra y se guarda. La fila queda
  «Cena · fuera · ~950 kcal · estimado».
- **No sé:** la fila queda «Cena · sin decir», ya resuelta, día no conocido.
- Sin rojo, sin rachas, sin «te has salido».

**Toques:** Hecho 1 · Otra cosa 2 · Fuera 3–4 · No sé 1. Hoy, una cena fuera es
registrar a mano.

**Backend:** `status` admite `out` y `unknown`. `log_entries` gana `estimated`
(booleano) para lo que estima un modelo. La estimación pasa por la pantalla que
enseña la cifra antes de guardar: es dato interpretado (regla de CLAUDE.md). La
pregunta de aceite o salsa la responde el usuario y entra en la petición al modelo;
**nada infla la cifra por su cuenta**.

**Escenarios:** «No sé» cuenta como resuelta y no como conocida; «Fuera» escribe el
diario marcado como estimado; un estimado nunca se suma como medido sin decirlo.

**Hecho cuando:** las cuatro salidas funcionan en prod y la métrica de resueltas se
puede leer por semana.

### Fase 3 — Tus sitios

**Objetivo:** la segunda vez en un sitio cuesta 2 toques y sale tu cifra.

**En pantalla**
- **Fuera:** arriba, tus sitios recientes («Bar Paco · menú del día · ~950»); debajo
  «Otro sitio». La primera vez se le pone nombre al guardar.
- **Perfil → «Tus sitios»:** lista con su cifra; tocar uno deja corregirla. La
  comida de otros («Táper de mamá») es un sitio más.

**Toques:** sitio conocido 2; sitio nuevo 4–5, una sola vez.

**Backend:** un sitio es un plato tuyo con `kind = 'fuera'` y cifras por ración,
corregible con `PATCH` como cualquier alimento tuyo. Al corregirlo deja de ser
`estimated` en las entradas **nuevas**; las viejas quedan congeladas.

**Hecho cuando:** un sitio repetido se registra en 2 toques con su cifra.

### Fase 4 — Comer fuera dentro del plan

**Objetivo:** la cena del sábado deja de ser una desviación.

**En pantalla**
- **Plan → comida de la semana:** «Fuera ▸» y elegir sitio (o «Sin decidir»). La
  comida enseña «~900 kcal reservadas».
- **Comida:** esa fila se confirma con 1 toque («Confirmar») o se cambia de sitio.

**Toques:** 1 al planificar, 1 al confirmar.

**Backend:** `planner.py` reserva la cifra del sitio (o tu media de comidas fuera)
y reparte el resto del día contra el objetivo.

**Hecho cuando:** una semana con dos cenas fuera planificadas cuadra con el
objetivo diario sin que las otras comidas se disparen.

**Construido (12 oct):** el sitio se elige en la hoja «Cambiar este plato» de
Plan, bajo «Comer fuera»: 2 toques (la fila y el sitio), no 1. Reajusta sólo lo
que queda sin decir de ese día y es de casa; un macro que algo fijo no tiene
medido deja de dirigir el ajuste. Lo reservado no entra en la lista de la
compra. **Queda fuera «Sin decidir»** (reservar tu media sin sitio): pide que
una fila del plan pueda no tener plato, y eso toca la lista, la adherencia y
confirmar. Va aparte si hace falta.

### Fase 5 — Pesar una vez, al cocinar

**Objetivo:** la báscula se saca una vez por tanda, no una por plato.

**En pantalla**
- **Tus platos → plato cocinado en tanda:** «Pesar la olla» → «2.400 g».
- **Comida → Hecho** en ese plato: «¼ de la olla · 600 g», con ½, ⅓, ¼ y «otra»
  a un toque.

**Toques:** 1 peso por tanda; confirmar la ración, 1–2.

**Backend:** una tanda (plato, gramos cocinados, fecha) y las raciones como
fracción; la aritmética, en `nutrition.py`.

**Hecho cuando:** un plato en tanda se registra toda la semana sin volver a pesar.

**Construido (12 oct):** la olla vale 7 días (la última pesada manda). Lo
previsto es la parte más cercana a una ración de la receta (1/raciones; ¼ si la
receta es de una). Cuatro cifras sin punto, como el resto de la app: «2400 g».
Sólo en las comidas del plan; añadir un plato a mano sigue siendo por raciones.

### Fase 6 — El ticket

**6.0 — Visto (12 oct, ticket del 5 jul 2025).** PDF con texto, se lee sin OCR.
Cada línea: unidades, descripción en mayúsculas cortada a 20 caracteres y precio;
lo de peso trae los kg en una segunda línea. **Sin código de producto.** Mezcla
comida y no comida (8 de 45 líneas) y trae datos de pago, que se descartan. Contra
el catálogo de prod, 15 líneas de comida: 4 casan con un producto, 7 tienen varios
candidatos, 4 ninguno. Emparejar lo hace un modelo y lo dudoso pasa por revisión
(la pantalla de «Subir plan» sirve casi tal cual). Tamaño: medio-grande.

**6.1 — Pegar el ticket.** Plan → «Pegar ticket» → «21 en tu lista · 2 fuera de
lista · falta Merluza» → Guardar. Toques: 2 más la revisión si hay dudosos.

**6.1 construido (12 oct):** «Subir ticket» (PDF) en Plan, no «Pegar»: el ticket
digital llega como PDF. Con el ticket real del 5 jul el modelo devuelve 36 líneas
de comida en gramos, sin limpieza ni pago. Lo revisado va a `pantry_items`; «en
casa» es lo comprado en los últimos 14 días, sin descontar lo que se come. Se
compara con la lista de la semana que se está mirando.

**6.2 — Lo que tienes en casa.** «Otra cosa» abre con «Tienes en casa» arriba, y el
plan de la semana siguiente tira de lo que sobró.

**Hecho cuando:** después de una compra, «Otra cosa» propone platos con lo que hay.

**6.2 construido (12 oct):** «Otra cosa» es «Lo cambié». Un plato está «en casa»
si al menos la mitad de sus ingredientes salió en un ticket de las dos últimas
semanas (la sal y el aceite no salen en cada compra); va arriba bajo «Tienes en
casa». El generador pesa cada plato de 1 (nada en casa) a 3 (todo): empuja sin
obligar. Casa por `food_id`: si el ticket casó con otra fila del catálogo que la
receta, no cuenta.

### Fase 7 — Cadenas (sólo si hay datos)

Importar cartas de cadenas que publiquen su información nutricional, como CIQUAL:
script a mano, catálogo compartido, cifras exactas sin `~`. Antes, comprobar qué
cadenas españolas la publican. Si ninguna, la fase no existe.

**Comprobado (12 oct): no se hace.** Sólo Starbucks España publica tablas
oficiales descargables (PDF por temporada, por ración y por 100 g). McDonald's,
Burger King, KFC y Telepizza no dan nada oficial que se pueda descargar; lo que
circula son bases de terceros (FatSecret, Fitia) sin garantía. En España no hay
obligación de dar calorías en la carta. Tus datos no tienen comidas de cadena, y
el usuario decidió cerrar la fase: el bar de siempre ya lo cubren tus sitios
(fase 3). Si algún día vas a una cadena con frecuencia, el camino es un script
de import al catálogo compartido, como CIQUAL.

## 5. Fuera de este plan

- La foto con IA como verdad (se queda corta).
- Rachas, logros y red social (no crean el enganche esperado).
- Buscar sitios cerca según tus macros (no hay datos fuera de las cadenas de EE. UU.).
- Rangos de kcal («700–1.000»): se marca `estimated` en su lugar; un rango obligaría a
  rehacer las sumas de `nutrition.py`.

## 6. Decisiones (12 oct)

1. **«No sé» es un botón visible.** Honesto antes que escondido; si la métrica
   enseña que se vuelve la salida fácil, se replantea.
2. **La franja de ayer dura 2 días.** Después la comida se queda «sin decir» y deja
   de pedirse.
3. **La revisión semanal pierde la pregunta en semanas con plan.** «Sí, todo / Casi
   todo / No» se queda sólo para semanas sin plan, donde no hay huecos que contar.
4. **Fase 6.0 con Gmail:** permitido leer un ticket de Mercadona.
5. **Entrega:** una fase por PR, mergeada y desplegada al estar verde y vista en el
   navegador; un APK cada dos fases.

# Series por semana según la ciencia (y por grupo muscular)

Investigación de fondo para una futura métrica de volumen semanal en Fitit.
Fecha: agosto 2026. No implementa nada; recoge números, cómo se cuentan y qué
implica para el modelo de datos actual.

---

## 0. Nivel de confianza de cada cosa

Importa más que los números. Lo verificado y lo de oídas no valen igual:

| Fuente | Cómo la consulté | Confianza |
|---|---|---|
| Pelland 2026 (volumen semanal) | PDF completo leído: abstract, tablas 3–4, discusión | **Alta** |
| `backend/app/muscles.py`, `models.py` | Código leído | **Alta** |
| Remmert 2025 (volumen por sesión) | Resumen de buscador. **Preprint sin revisión por pares** | **Baja** |
| Robinson 2024 (cercanía al fallo) | Resumen de buscador, paper no abierto | **Media-baja** |
| Baz-Valle 2022 (diferencias por músculo) | Resumen de buscador, paper no abierto | **Media-baja** |
| Atletas de físico (Frontiers 2025) | Resumen automático que se contradice a sí mismo | **Muy baja** |

Todo lo que en este documento diga algo *distinto por músculo* descansa sobre
las dos últimas filas. Ese es el punto débil de la investigación, y no se
arregla escribiendo con más seguridad.

## 1. Los números

Fuente principal: **Pelland et al., _The Resistance Training Dose Response_,
Sports Medicine (2026)** — 67 estudios, 2.058 sujetos, meta-regresión bayesiana
multinivel. Es el análisis más grande y más limpio que existe hoy sobre volumen
semanal.

### Hipertrofia

Más volumen → más músculo, con rendimientos decrecientes y **sin meseta clara**
dentro del rango estudiado. Los autores lo expresan en "tramos de eficiencia":
cuántas series adicionales hacen falta para ganar un escalón de crecimiento
*detectable* (el escalón, SDES, es 2,05 % de tamaño muscular).

| Tramo | Series fraccionadas/semana | Coste del siguiente escalón |
|---|---|---|
| Dosis mínima efectiva | 4 | ya produce hipertrofia detectable |
| Alta eficiencia | 5–10 | ~6 series más |
| Eficiencia media | 11–18 | ~8,5 series más |
| Baja eficiencia | 19–29 | ~10,75 series más |
| Mínima eficiencia | 30–42 | ~12,5 series más |
| Sin datos | 43+ | insuficiente evidencia (o incluso menos hipertrofia) |

Pendiente media: **+0,24 % de tamaño muscular por serie adicional** (IC 95 %:
0,15–0,33) en el entorno de las 12,25 series/semana, el promedio de los estudios.
Coincide en orden de magnitud con el +0,38 %/serie de Schoenfeld 2017.

Traducción práctica: hacer más siempre suma un poco, pero pasar de 4 a 10 series
rinde tres veces más por serie invertida que pasar de 30 a 42. **No existe un
"óptimo"; existe una curva de eficiencia decreciente.** Por encima de ~25 series
fraccionadas hay muy pocos estudios: es territorio sin mapear, no territorio malo.

### Fuerza

Otra curva totalmente distinta, mucho más plana y mucho antes:

| Tramo | Series fraccionadas/semana |
|---|---|
| Dosis mínima efectiva | 1 |
| Alta eficiencia | 2 |
| Eficiencia media | 3–4 |
| Baja eficiencia | 5+ — series extra ya no aportan mejora detectable |

Es decir: para **fuerza** en un ejercicio, 3–5 series semanales de ese ejercicio
capturan casi todo. El volumen alto es una herramienta de hipertrofia, no de
fuerza.

### Frecuencia (sesiones por semana)

- **Hipertrofia: irrelevante** si igualas volumen. La probabilidad de efecto
  positivo fue 91,3 %, pero el intervalo es compatible con efecto nulo, y los
  análisis secundarios no lo detectan. Reparte las series como te venga bien.
- **Fuerza: sí importa.** De 1 a 2 sesiones/semana del ejercicio: +12,7 % →
  +17,3 % de fuerza. A partir de ahí los rendimientos caen rápido. Probablemente
  es práctica del patrón motor tanto como adaptación.

### Volumen por sesión

Trabajo paralelo del mismo grupo (**Remmert et al., preprint SportRxiv 2025**):
el punto donde series adicionales *dentro de una misma sesión* dejan de aportar
está en **~11 series fraccionadas por músculo y sesión** para hipertrofia, y
~2 series directas para fuerza.

⚠️ Preprint, sin revisión por pares, y no lo he leído entero — solo el resumen.
No lo trates igual que el paper de volumen semanal.

Regla práctica que sale de combinar ambos papers: si quieres 20 series semanales
de un músculo, repártelas en dos días. Hacer 20 de golpe cae fuera de lo que la
evidencia respalda.

---

## 2. Cómo se cuenta una serie (lo más importante para la app)

Pelland clasificó **cada** serie como directa o indirecta respecto al músculo
medido, y probó tres formas de contar las indirectas:

- `total` → la indirecta cuenta **1,0**
- `fractional` → la indirecta cuenta **0,5**
- `direct` → la indirecta cuenta **0**

**El método fraccional ganó** con evidencia "fuerte" o "muy fuerte" (Bayes
factors, escala Kass–Raftery), y es el que usan en todos los modelos primarios.
Interpretación de los autores: el estímulo medio de una serie indirecta es
aproximadamente la mitad del de una directa.

Ejemplos:

| Ejercicio | Cuenta como |
|---|---|
| Press banca | 1 pecho · 0,5 tríceps · 0,5 hombro (anterior) |
| Dominada | 1 espalda · 0,5 bíceps |
| Sentadilla | 1 cuádriceps · 0,5 glúteo · 0,5 isquios |
| Curl bíceps | 1 bíceps |
| Elevación lateral | 1 hombro |

Los propios autores avisan: el 0,5 es una **heurística**, no una constante de la
naturaleza; el peso real depende del ejercicio, el rango de repeticiones y el
nivel del sujeto. Pero es la mejor aproximación disponible, y es muchísimo mejor
que contar todo a 1 o ignorar lo indirecto.

**Consecuencia:** todos los números de la sección 1 están en series
*fraccionadas*. Un objetivo de "12–20" contado a lo bruto (todo a 1) exagera
sobre todo bíceps, tríceps y hombro, que reciben mucho trabajo indirecto.

---

## 3. Condiciones para que una serie cuente

- **Cercanía al fallo.** Robinson et al. 2024 (Sports Medicine): la hipertrofia
  aumenta conforme las series se acercan al fallo; la fuerza es prácticamente
  indiferente. Una serie a 5+ RIR no vale lo mismo que una a 1 RIR.
  ⚠️ Esto viene de un resumen, no del paper: no he verificado la magnitud del
  efecto ni si el resumen simplifica de más.
- En los estudios de Pelland, el 78,47 % de los efectos de hipertrofia venían de
  protocolos que **reportaban** proximidad al fallo (RIR o RM). Ese porcentaje sí
  está en el PDF; que eso implique "entrenaron cerca del fallo" es
  interpretación mía, no una afirmación del paper.
- **Rango de repeticiones**: no es el eje de este análisis, pero los estudios
  incluidos son mayoritariamente de trabajo con cargas convencionales llevadas
  cerca del fallo. Nada de esto valida series muy alejadas del fallo.

---

## 4. Por grupo muscular: qué dice de verdad la ciencia

Aquí hay que ser honesto: **la evidencia de umbrales distintos por músculo es
escasa y débil.**

- Pelland **no** modela el músculo como factor: sus análisis por moderadores son
  exploratorios y ellos mismos los etiquetan como generadores de hipótesis.
- **Baz-Valle et al. 2022** (revisión sistemática) es lo más citado a favor de
  diferencias: 20+ series/semana superó a 12–20 en **tríceps**, pero **no** en
  bíceps ni cuádriceps. Su recomendación general sigue siendo **12–20 series
  semanales por grupo** para hombres jóvenes entrenados.
  ⚠️ No he abierto el paper: esto viene de un resumen de buscador. Y es el
  **único** apoyo real que tiene toda esta sección. Antes de construir nada que
  dependa de diferencias por músculo, hay que leerlo de verdad.
- Los **volume landmarks** (MV / MEV / MAV / MRV por músculo, de Israetel y RP)
  son un marco práctico popular y bien construido, pero **no son evidencia
  revisada por pares**: los números por músculo son experiencia de entrenador,
  no resultados de estudios.
- Datos **observacionales** de lo que hacen los físicos competitivos
  (Frontiers in Sports and Active Living, 2025, 154 atletas): pecho 20–32,
  dorsal 24–32, deltoides 18–33, bíceps 12–19, tríceps 12–20, cuádriceps 16–28,
  isquios 14–20, glúteo 7–12, gemelo 14–24, abdomen 4,5–20 series/semana.
  ⚠️ **No te fíes de estas cifras.** Salen de un resumen automático del paper,
  no del paper, y ese resumen se contradice a sí mismo (da 32 series de pecho en
  Men's Physique y a la vez 47,2 series de *todo* el tren superior en hombres).
  Además cuentan a lo bruto (todo a 1), así que aunque fueran correctas no son
  comparables con las de Pelland.

**Conclusión que yo defendería:** la ciencia no soporta objetivos distintos por
músculo. Lo que sí varía por músculo es **cuánto volumen indirecto recibe**. Con
un objetivo único (p. ej. 10–20 series fraccionadas) más conteo fraccional, los
números por músculo salen distintos solos, y por la razón correcta.

---

## 5. Implicaciones para Fitit

### Ya aplicado (agosto 2026)

- **La barra de la tarjeta de periodo se mide contra 20 series**, no contra tu
  músculo más entrenado, con marca a las 10 y la referencia escrita debajo.
- **Sin veredicto mientras el periodo está abierto**, para que el lunes no
  parezca un fracaso.
- **Vocabulario sin "óptimo"**: la curva no tiene pico, tiene eficiencia
  decreciente.
- **"Pierna" partido en Cuádriceps / Femoral / Gemelo** (9 grupos), con
  migración que re-clasifica el historial por el nombre del ejercicio. El glúteo
  va con Femoral: un décimo color deja de separarse bien.
- **Conteo fraccional**: `secondaries_for()` en `backend/app/muscles.py` marca
  los secundarios de cada movimiento y viajan en cada serie de `/days`. Las
  barras los cuentan a 0,5. Con esto las cifras de la app y la referencia por
  fin están en la misma unidad — antes se contaba solo directo (indirectas = 0),
  el método con *peor* soporte de los tres.
  - Las reglas se activan por **(grupo primario + palabra clave)**, no por la
    palabra sola: "prensa" es leg press y lleva Femoral, pero "gemelo en prensa"
    es un gemelo y no lleva nada.
  - Lista deliberadamente corta: solo pares grandes e indiscutibles. El 0,5 ya
    es una heurística; apilar conjeturas encima compra ruido.
  - **El heatmap sigue contando solo directo.** Color e intensidad responden
    "qué entrené", y el conteo fraccional responde "cuánto estímulo recibí". Si
    un secundario pudiera ganar el color, todo día de empuje sería un split
    Pecho+Tríceps y el calendario dejaría de enseñar la forma de la semana.
- **Falso cero del lunes eliminado**, no tapado: mientras la semana corre la
  fila dice "6 de 10" en vez de dictar "+4 a la zona", y no se pinta en corto.

### Lo que sigue pendiente

1. **El esfuerzo se registra pero probablemente no se usa.** `SetEntry` sí tiene
   `rpe` (float opcional), así que el campo existe. Lo que no sé —y no he
   comprobado en la base de datos real— es qué porcentaje de series lo lleva
   relleno. Si está casi siempre vacío, todas las series pesarán igual en el
   contador, y conviene no prometer una precisión que no tenemos.
2. **La ventana sigue siendo semana natural**, no 7 días rodantes.
3. **El desglose por celda del heatmap no muestra lo fraccional.** El readout al
   tocar un día sigue dando solo los grupos directos. Es el sitio natural para
   enseñar "Pecho 10 · Tríceps 9,5 · Hombro 8", y encaja con el pendiente de
   "mostrar desglose de series en registro día".

Bandas defendibles si algún día el indicador pasa de una referencia a un
semáforo (series fraccionadas):

| Rango | Lectura |
|---|---|
| 0–3 | por debajo de la dosis mínima efectiva |
| 4–9 | poco volumen, pero el más eficiente por serie |
| 10–19 | zona de trabajo habitual |
| 20–29 | volumen alto, retorno por serie ya bajo |
| 30+ | fuera de lo bien estudiado |

---

## Fuentes

- [Pelland et al. (2026), _The Resistance Training Dose Response_, Sports Medicine](https://link.springer.com/article/10.1007/s40279-025-02344-w) · [PubMed](https://pubmed.ncbi.nlm.nih.gov/41343037/) · [preprint SportRxiv](https://sportrxiv.org/index.php/server/preprint/view/460)
- [Remmert et al. (2025), _Is There Too Much of a Good Thing?_ (volumen por sesión), preprint SportRxiv](https://sportrxiv.org/index.php/server/preprint/view/537)
- [Robinson et al. (2024), proximidad al fallo, Sports Medicine](https://link.springer.com/article/10.1007/s40279-024-02069-2)
- [Baz-Valle et al. (2022), revisión sistemática de volúmenes, PubMed](https://pubmed.ncbi.nlm.nih.gov/35291645/) · [PDF](https://bazmanscience.com/wp-content/uploads/2024/02/Baz-Valleetal.-2022-ASystematicReviewoftheEffectsofDifferentResistanceTrainingVolumesonMuscleHypertrophy.pdf)
- [Cuantificación de volumen semanal en atletas de físico (2025), Frontiers](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2025.1536360/full)
- [Volume landmarks MEV/MAV/MRV — RP Strength](https://rpstrength.com/blogs/articles/training-volume-landmarks-muscle-growth) (marco práctico, no evidencia revisada)

De esta lista **solo he leído entero el primero** (Pelland). Los demás están
citados a partir de resúmenes. Stronger by Science aparecía antes en esta lista
y lo he quitado: su servidor devolvió 403 y nunca llegué a abrirlo.

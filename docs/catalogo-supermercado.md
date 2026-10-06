# El catálogo de tu supermercado

Spec del 6 de octubre de 2026. Sale de una sesión en la que los platos y la lista
de la compra de una semana se montaron a mano, cruzando el sitemap de Mercadona con
Open Food Facts y CIQUAL. Funcionó para esa semana y no escala: cada semana
dependería de repetirlo. Esto es lo que tiene que hacer la app para no necesitarlo.

## 0. En una frase

> **La app sabe qué vende tu súper, con cifras fiables, y monta los platos y la
> compra a partir de eso.**

## 1. El problema, con datos de prod (5 oct)

- **El repertorio no sirve para definición.** 6 platos: pizza, pasta al pesto,
  tortilla de patatas, chips de plátano, un bowl de yogur y una pechuga. Con eso el
  planificador no llega a 202 g de proteína en 2.569 kcal.
- **El plan no llega al súper.** La única semana generada (28-sep) tuvo 1 comida
  confirmada de 28. No había lista de la compra, así que se comió lo que había en
  casa, y se apuntó a mano (110 entradas en 15 días).
- **Planificar va antes de comprar** (decidido el 5 oct). Eso pide tener los
  productos en el catálogo **antes** de haberlos comprado y escaneado.

## 2. Qué cubre ya CIQUAL y qué no

De los 320 productos de Mercadona útiles para definición (carne, pescado, embutido,
lácteos, huevos, hidratos, legumbre):

| | Productos | Fuente fiable |
|---|---|---|
| Fresco y básicos (pechuga, merluza, sepia, huevos, patata, arroz, legumbre seca) | 164 | **CIQUAL**: una pechuga es igual en cualquier súper, y ya está en la app |
| Envasado de marca (queso batido 0 % Hacendado, leche proteínas, pavo 92 %, postre de proteínas, pan 100 % integral) | ~70 | **Sólo la etiqueta**: CIQUAL tiene una media genérica o nada |
| Sin dato en ninguna fuente | 86 | Escanear al comprar |

**Consecuencia: la fase 1 no importa «alimentos». Importa envasados de marca.** Lo
fresco se queda en CIQUAL.

## 3. Fase 1 — El catálogo de tu súper

### Qué entra
- Productos de **Hacendado (Mercadona)** y **Eroski** de Open Food Facts, sólo de
  alimentación (carne y embutido, pescado, lácteos y huevos, panes y cereales,
  pasta y arroz, legumbre, conservas, congelados sin rebozar). Ni droguería, ni
  bebida alcohólica, ni bollería.
- Por cada producto: nombre, marca, **código de barras**, macros por 100 g,
  **formato del envase** (`quantity`: «500 g», «4 × 125 g») y **ración**
  (`serving_size`) cuando la ficha la trae.
- Hacendado tiene ~10.000 fichas en Open Food Facts (comprobado). Tras filtrar por
  alimentación y coherencia quedarán unos pocos miles. Eroski: sin medir.

### Cómo entra
- **Un script, como `import_ciqual`**, que se ejecuta a mano y no desde la app.
  Clave `(source="off", source_ref=<EAN>)`, la misma restricción única que hace
  idempotente el de CIQUAL. Mismas tres decisiones: **no toca nada tuyo**
  (sólo `user_id IS NULL`), **no borra**, y no reescribe un nombre ya corregido.
- **La validación es la del escáner, no una segunda.** `app/openfoodfacts.py`
  (`read_product`) ya decide qué ficha de Open Food Facts vale y cuál no; el script
  la reutiliza entera. Un producto que el escáner rechazaría tampoco se importa.
  Encima, la comprobación que esta sesión mostró necesaria: si `4·P + 4·H + 9·G`
  se aleja de las kcal declaradas, la ficha está mal rellenada y no entra. Un
  producto sin cifra no se inventa: `NULL` no es `0`.
- **El artefacto se versiona**, como `data/ciqual_es.json`: `data/off_supermercados.json`.
  Rehacer la base no vuelve a pedirle miles de fichas a Open Food Facts, y prod no
  depende de que su API responda el día del import.

### Medidas caseras, gratis para lo envasado
La ración de la etiqueta es **dato identificado**, no interpretado: la puso el
fabricante. Así que entra sola como `Portion` («1 tarrina = 125 g», «1 loncha =
10 g»), sin pantalla de revisión. Es la mitad del agujero de las 0 medidas caseras
que hay hoy. La otra mitad, lo fresco («1 pechuga ≈ 180 g»), sigue siendo dato
interpretado y va por revisión, en otra spec.

### Dos cambios fuera del script
1. **Escanear mira también el catálogo compartido.** Hoy `GET /foods/barcode/{ean}`
   sólo busca entre tus alimentos (`Food.user_id == user_id`). Con el catálogo
   importado, escanear un queso batido de Mercadona tiene que encontrarlo ahí sin
   salir a la red: es la regla de «un producto conocido no consulta a nadie»
   extendida al catálogo. Si tú tienes ese mismo EAN dado de alta, **manda lo tuyo**.
2. **Búsqueda sin duplicados.** Si tienes un producto tuyo con el mismo EAN que uno
   del catálogo, la búsqueda enseña el tuyo y no los dos.

### En pantalla
- **Buscar alimento:** «queso batido» enseña el de Hacendado con su marca, sin
  haberlo escaneado. Mismo aspecto que cualquier resultado; la marca va donde ya va.
- **Perfil → «Tu súper»:** Mercadona / Eroski. En la fase 1 sólo ordena: los
  productos de tu súper salen antes al buscar. Copy a aprobar.

### Escenarios (`tests/features/supermarket_catalogue.feature`)
- Un producto con macros coherentes entra en el catálogo compartido con su EAN.
- Un producto cuyas macros no cuadran con sus kcal no entra.
- Un nutriente que la ficha no trae entra como desconocido, no como cero.
- La ración de la etiqueta entra como medida casera.
- Importar dos veces actualiza, no duplica.
- El import no toca ningún alimento con `user_id`.
- Escanear un EAN del catálogo no consulta Open Food Facts.
- Escanear un EAN que tienes tuyo y está en el catálogo devuelve el tuyo.
- Buscar no enseña dos veces el mismo EAN.

## 4. Fase 2 — La lista de la compra

- Sale de la semana generada: la suma de ingredientes de los 7 días.
- **Habla en productos del súper:** «Queso fresco batido 0 % Hacendado · 3 × 500 g»,
  gracias al formato importado. Lo fresco, en gramos de compra («Filetes pechuga
  pollo · ~560 g»), con el % de desperdicio que la app ya conoce.
- Agrupada por pasillo, con casillas para tachar y «ya lo tengo» para lo de siempre
  (aceite, sal, especias).
- Vive en «Planificar la semana que viene», debajo de la semana generada.
- **Diseño con `/design-shotgun`** antes de programarla: varias variantes contra
  `DESIGN.md`, se elige una y se construye esa.

## 5. Fase 3 — Platos desde tu súper

- «Proponme platos» deja de mirar sólo lo que ya has comido: mira **tu súper**,
  filtrado por lo que has marcado que te gusta.
- La IA sigue proponiendo **qué combinar**; las cifras, `nutrition.py`.
- **Control determinista por hueco** (nuevo): un plato de comida o cena para
  definición tiene que aportar al menos N g de proteína por ración, o no entra en
  el repertorio. Es lo que impide que vuelva a colarse una pizza. N sale del
  objetivo: con 202 g en cuatro tomas, ~40 g en comida y cena.
- Tachar y «me gusta» alimentan las siguientes propuestas, con la cuota de
  exploración que ya existe para no converger en cinco platos.

## 6. Fase 4 — Que no se pudra

- El script se vuelve a ejecutar cada mes.
- El sitemap de Mercadona (permitido por su `robots.txt`; `/api` no lo está y no
  se usa) marca qué productos **se venden hoy**. Uno descatalogado no se borra —el
  diario lo apunta—, se marca.
- Un plato con un producto descatalogado lo dice y propone el más parecido del
  mismo tipo.
- El diario no se entera: sus macros están congeladas en cada entrada.

## 7. Reglas de la casa que esto respeta

- **`NULL` no es `0`.** Un nutriente que la etiqueta no trae se importa como
  desconocido.
- **`log_entries` congela.** Que un producto cambie de receta no reescribe ningún día.
- **Toda la aritmética en `nutrition.py`.** El script no calcula macros: copia las
  de la etiqueta y las valida.
- **El catálogo compartido se lee, no se edita.** Lo importado es `user_id IS NULL`.
- **Dato identificado contra dato interpretado.** Etiqueta y código: entran sin
  pantalla de revisión. Lo que estime un modelo: con ella.

## 8. Cambio en CLAUDE.md

La regla dice «`POST /foods` es la única puerta. Ni un import, ni un parser…», y
dos líneas más abajo que el catálogo compartido es «CIQUAL, y luego Open Food
Facts». `import_ciqual` ya escribe en ese catálogo sin pasar por `POST /foods`, así
que la regla siempre ha querido decir **tus** alimentos. Propuesta de texto:

> **`POST /foods` es la única puerta para tus alimentos** (`user_id` no nulo). El
> catálogo compartido (`user_id IS NULL`) lo escriben sólo los scripts de import
> —CIQUAL y Open Food Facts—, a mano, idempotentes y sin tocar nada tuyo.

## 9. Decisiones

**Tomadas**
1. Planificar va antes de comprar (5 oct).
2. Lo fresco se queda en CIQUAL; se importan sólo envasados de marca.
3. Mercadona y Eroski.
4. La lista de la compra se diseña con `/design-shotgun`.

**Abiertas**
5. **Confirmar el texto del §8.** Es una regla tuya.
6. **Licencia de Open Food Facts (ODbL).** Para una app personal no cambia nada.
   Si algún día tuviera usuarios, obliga a compartir de vuelta la base derivada.
   No verificado a fondo.
7. **¿Un solo súper o varios a la vez?** La fase 1 admite los dos importados;
   «Tu súper» decide cuál sale primero.

## Apéndice: de dónde sale lo que dice esta spec

| Afirmación | Fuente | Confianza |
|---|---|---|
| 6 platos, 1/28 confirmadas, 110 entradas en 15 días | Neon prod, 5 oct | **Alta** |
| 164 / ~70 / 86 sobre 320 productos útiles | Cruce sitemap + OFF + CIQUAL de esta sesión | **Media**: emparejado por nombre |
| Hacendado ~10.000 fichas en OFF | search.openfoodfacts.org, `brands:hacendado`: 9.972 | **Alta** |
| `robots.txt` de Mercadona prohíbe `/api` y permite `/product` y el sitemap | Leído el 5 oct | **Alta** |
| El escáner sólo busca entre tus alimentos | `routers/foods.py`, `Food.user_id == user_id` | **Alta** (código leído) |
| `import_ciqual` es idempotente por `(source, source_ref)` | `scripts/import_ciqual.py`, `uq_foods_source_source_ref` | **Alta** |
| `read_product` valida fichas de OFF | `app/openfoodfacts.py` | **Alta** |
| Fichas de OFF mal rellenadas (lomo con 40 g de proteína y 117 kcal) | Visto en esta sesión | **Alta** |
| Implicaciones de la ODbL | De memoria | **Baja** |

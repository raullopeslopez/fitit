# Reglas de normalización de CIQUAL

Cómo se convierte la tabla de composición de ANSES en filas de `foods`.
Ejecutable en `scripts/ciqual.py`, probado en `backend/tests/unit/test_ciqual.py`.
Este documento explica **por qué**; el código dice **qué**.

## El fichero

- **Fuente:** Table Ciqual 2020 (ANSES, Francia), `Table Ciqual 2020_FR_2020 07 07.xls`,
  descargable de <https://ciqual.anses.fr>. Hoja única `compo`, 3.186 alimentos,
  76 columnas.
- **Por qué CIQUAL y no otra:** convención europea de hidratos (la fibra va aparte, que
  es como está impresa una etiqueta española), buena cobertura mediterránea, y distingue
  crudo de cocido — que en un diario de comida es la diferencia entre 130 y 350 kcal.
- **Por qué no CALNUT.** ANSES publica también CALNUT, la misma tabla con los huecos
  rellenados por imputación estadística. Es justo lo contrario de lo que este proyecto
  quiere: un hueco relleno con una estimación entra en la base de datos indistinguible de
  una medición, y aquí `NULL` significa «nadie lo midió» precisamente para que se pueda
  distinguir.

## Las cinco formas de valor

El fichero entero contiene exactamente cinco. Cualquier otra **detiene el import**
(`CiqualValueError`) en vez de convertirse en `NULL`: una forma nueva en una edición
futura tiene que hacerse notar, no colarse como miles de nutrientes desconocidos que
nadie va a revisar.

| Forma | Ocurrencias | Regla | Por qué |
|---|---|---|---|
| `45,4` | 129.676 | → `45.4` | Coma decimal y espacios de millar (normal y fino insecable), que es como escribe los números un fichero francés. |
| `-` | 63.688 | → `NULL` | Es el «non déterminé» de CIQUAL: nadie lo midió. |
| `< 0,3` | 16.630 | → `0.15` | Por debajo del límite de cuantificación. Se guarda el punto medio de `[0, X]`, que es el único valor del intervalo que no elige un extremo. |
| `traces` | 1.904 | → `0.0` | **No `NULL`.** Ver abajo. |
| vacío | 1.564 | → `NULL` | Lo mismo que `-`, sin la raya. |

Un `0` explícito se guarda como `0.0`, nunca como `NULL`. Es una medición: decir «no se
sabe» de algo que sí se sabe es tan falso como lo contrario.

### Por qué `traces` es 0 y no `NULL`

Es la única regla que roza la invariante del proyecto, así que se decidió a propósito
(usuario, 2026-08-31). `traces` no es la ausencia de una medición: es su **resultado** —
alguien miró y la cantidad está por debajo de lo cuantificable. Guardarlo como
desconocido tiraría esa información, y con la regla de sumas del día (`sumar_nutrientes`:
un solo desconocido deja el total en desconocido) bastaría un alimento con trazas de
vitamina C para dejar la vitamina C del día entero sin número, cuando lo que se sabe es
que es casi nada.

`NULL` sigue significando exactamente lo que decía: **nadie lo midió**.

## Mapeo de columnas

| CIQUAL | `foods` |
|---|---|
| `alim_nom_fr` | `name` (y `name_folded`, plegado con `fold_exercise_name`) |
| `alim_code` | `source_ref`, con `source = 'ciqual'` |
| — | `user_id = NULL` — catálogo compartido, de sólo lectura desde la API |
| — | `carb_convention = 'available'` |
| `Energie, Règlement UE N° 1169/2011 (kcal/100 g)` | `kcal_100g` |
| `Protéines, N x facteur de Jones (g/100 g)` | `protein_100g` |
| `Lipides (g/100 g)` | `fat_100g` |
| `Glucides (g/100 g)` | `carbs_100g` |
| `Fibres alimentaires (g/100 g)` | `fiber_100g` |
| las otras 58 columnas | `nutrients_json` |

Dos columnas tienen alternativa en el fichero y hay que elegir una:

- **Energía:** el Reglamento UE 1169/2011, no «N x facteur Jones, avec fibres». Es el
  número que aparece impreso en una etiqueta española. Las dos tienen idéntica cobertura
  (72,1 %), así que no se gana nada eligiendo la otra.
- **Proteína:** el factor de Jones, que es la referencia de CIQUAL, no el N × 6,25
  genérico. Cobertura idéntica también (99,4 %).

`Glucides` son glúcidos **disponibles**, con la fibra contada aparte — que es exactamente
lo que afirma `carb_convention = 'available'`, y la razón de que esa columna exista.

### Claves de `nutrients_json`

`'Sodium (mg/100 g)'` → `sodium_mg`. La unidad va **dentro de la clave** porque el valor
es un número desnudo: sin ella, sumar hierro en mg con yodo en µg no tendría forma de
saber que está mezclando escalas. La unidad se lee del **último** paréntesis de la
cabecera, no de cualquiera — hay nombres con paréntesis propios
(`AG 18:2 9c,12c (n-6), linoléique (g/100 g)`).

Las claves se quedan en francés. No se enseñan todavía (la fase 1 sólo pinta las cinco
macros) y así siguen siendo rastreables hasta la columna exacta del fichero.

## Lo que el import NO hace

- **No deriva energía.** 888 alimentos (28 %) no traen kcal, y 794 de ellos sí traen las
  tres macros, así que se podrían calcular por Atwater. No se hace (decisión de usuario,
  2026-08-31): en `foods` sólo vive lo que alguien midió. El coste es visible y aceptado —
  registrar una «Ensalada de arroz» deja el total de kcal del día en `—` con su pie
  explicándolo. Si molesta durante la pausa de uso real, derivarlas después es volver a
  ejecutar el import.
- **No traduce.** Los nombres entran en francés. La traducción a español con alias es un
  paso aparte y explícito: `scripts/translate_foods.py`.
- **No inventa porciones.** CIQUAL no las trae y este script no se las pone.

## Idempotencia

La clave es `(source, source_ref)`, con restricción única en la base de datos
(`uq_foods_source_source_ref`, migración `b8d0f42a6e17`) y no sólo en el script: volver a
ejecutar el import actualiza las filas en vez de duplicarlas, y la garantía la da la base
de datos en vez de que el script se acuerde de mirar.

**Un duplicado real en el origen:** CIQUAL 2020 trae `Son de blé` dos veces con el código
9621 — una fila vacía y otra con datos. Gana la que más nutrientes trae medidos
(`measured_count`).

## Lo que el import no puede pisar

Una fila de `foods` con `user_id` no nulo es un alimento que diste de alta tú, y el
import **nunca** la toca: sólo escribe filas de catálogo (`user_id IS NULL`). Tampoco
borra: un alimento que desaparezca de una edición futura de CIQUAL se queda, porque hay
entradas del diario apuntándolo.

## Criterios de traducción (FR → ES)

Aplicados a `data/ciqual_es.json`. Escritos aquí porque el fichero se genera por
tandas y la coherencia entre la primera y la última es lo que se rompe solo.

- **`cru` / `cuit` no se pierden nunca.** Es la mitad del valor del dato: entre una
  patata cruda y una cocida hay 130 kcal contra 350. Lo mismo con `sec`, `surgelé`,
  `appertisé`, `égoutté`, `préemballé`.
- **Nomenclatura española, no calco.** Los cortes de carne y los nombres de pescado van
  como los llama una pescadería o una carnicería de aquí: `tende de tranche` → `tapa`,
  `bar ou loup` → `lubina`. Un calco literal es un nombre que nadie busca.
- **Alias de España.** Tres a cinco sinónimos con los que alguien buscaría aquí, incluidos
  regionalismos peninsulares (`bajocas`, `presec`, `codony`). Los americanismos entran
  sólo cuando también se usan aquí (`batata`, `camote`).
- **Ningún alias que sea otro alimento.** Es la regla que más recorta: en `dorada` no va
  `besugo`, en `hígado de oca` no va `foie` a secas (sugiere foie gras), en `rösti` no va
  `tortilla de patata`. Un alias que apunta a otra cosa no es un atajo, es un error de
  registro esperando a pasar.
- **Lo que no se reconoce se transcribe literal y se apoya en los alias.** `Chadèque` se
  queda `chadeque` con `pomelo` y `pampelmusa` al lado. Un nombre aproximado es peor que
  uno literal: el literal se nota, el aproximado no.
- **`aliment moyen` → `alimento medio`.** Es una categoría de CIQUAL, no un alimento, y
  conviene que se siga notando.

"""Lo que se hace con lo que dice haber leído el modelo.

Este fichero es lo que sustituye a medir la lectura con un juego de fotos de
muestra. Un eval te dice qué tal iba el modelo el día que lo corriste; esto
corre en cada foto, para siempre, y **no confía en el modelo**: le obliga a
enseñar de dónde saca cada número y tira lo que no pueda enseñar.

Dos errores motivan todo el módulo, y los dos son invisibles en pantalla:

- Un `0` en un nutriente que la etiqueta no declara. Nadie lo nota — un cero
  parece un dato — y una vez congelado en `log_entries` ya no hay forma de
  distinguirlo de una medición. Es el único error de esta feature que no se
  puede deshacer después.
- La columna «por ración» leída como si fuera «por 100 g». Sale un número
  perfectamente creíble, escalado por un factor que nadie eligió.

Ninguno de los dos se arregla pidiéndole al modelo que se porte bien. Se
arreglan comprobando lo que dice contra lo que transcribe.
"""

import pytest

from app.label import ColumnRefused, read_from_payload


def payload(**overrides):
    """Una lectura correcta, para ir estropeándola de una en una."""
    base = {
        "name": "Yogur natural",
        "brand": "Hacendado",
        "column_header": "por 100 g",
        "rows": [
            "Valor energético 61 kcal",
            "Grasas 3,2 g",
            "Hidratos de carbono 4,5 g",
            "Fibra alimentaria 0 g",
            "Proteínas 3,8 g",
        ],
        "nutrients": {"kcal": 61, "fat": 3.2, "carbs": 4.5, "fiber": 0, "protein": 3.8},
    }
    base.update(overrides)
    return base


def test_it_reads_a_clean_label():
    read = read_from_payload(payload())
    assert read.name == "Yogur natural"
    assert read.brand == "Hacendado"
    assert read.nutrients["kcal"] == 61
    assert read.nutrients["protein"] == 3.8


def test_a_declared_zero_is_a_zero():
    """«Fibra alimentaria 0 g» está impreso: alguien lo midió y no hay."""
    read = read_from_payload(payload())
    assert read.nutrients["fiber"] == 0
    assert "fiber" not in read.dropped


def test_a_number_no_row_backs_becomes_unknown():
    """El fallo grave. La etiqueta no habla de fibra y el modelo manda un 0."""
    rows = [r for r in payload()["rows"] if "Fibra" not in r]
    read = read_from_payload(payload(rows=rows))
    assert read.nutrients["fiber"] is None
    assert "fiber" in read.dropped


def test_an_invented_figure_becomes_unknown_even_when_it_is_not_zero():
    """No es sólo el cero: cualquier cifra sin fila que la respalde se cae."""
    rows = [r for r in payload()["rows"] if "Proteínas" not in r]
    read = read_from_payload(payload(rows=rows))
    assert read.nutrients["protein"] is None
    assert "protein" in read.dropped


def test_the_rest_survives_a_dropped_nutrient():
    """Tirar un número no puede tirar la lectura entera: los otros cuatro son
    buenos y escribirlos a mano otra vez es justo lo que se venía a evitar."""
    rows = [r for r in payload()["rows"] if "Fibra" not in r]
    read = read_from_payload(payload(rows=rows))
    assert read.nutrients["kcal"] == 61
    assert read.nutrients["carbs"] == 4.5


@pytest.mark.parametrize(
    "header",
    ["por 100 g", "Por 100g", "100 g", "/100 g", "por 100 gramos", "por  100  G"],
)
def test_the_hundred_gram_column_is_accepted_however_it_is_printed(header):
    assert read_from_payload(payload(column_header=header)).nutrients["kcal"] == 61


@pytest.mark.parametrize(
    "header",
    ["por ración", "por racion (125 g)", "por porción", "por unidad", "por envase"],
)
def test_a_per_ration_column_is_refused(header):
    """Rechazada, no reescalada. El factor lo tendríamos que inventar nosotros,
    y un número inventado aquí es indistinguible de uno medido."""
    with pytest.raises(ColumnRefused):
        read_from_payload(payload(column_header=header))


@pytest.mark.parametrize("header", ["por 100 ml", "100 ml", "por 100 mL", "ø/100 ml"])
def test_a_per_100_ml_column_is_read_and_flagged(header):
    """Media nevera se etiqueta por volumen —leche, bebidas vegetales, zumos—,
    así que rechazarlas dejaba la cámara inservible para todas ellas.

    Se leen y se marcan: en un líquido acuoso 100 ml son ~103 g, un 3% menos
    error que pesar una ración a ojo. Aceptar no es convertir a escondidas —los
    números se guardan tal cual y la pantalla dice de qué unidad salen antes de
    que nadie pulse guardar—, que es lo que la regla prohíbe de verdad.
    """
    read = read_from_payload(payload(column_header=header))
    assert read.per == "100ml"
    assert read.nutrients["kcal"] == 61


def test_a_per_100_g_column_says_so():
    assert read_from_payload(payload()).per == "100g"


def test_a_column_it_could_not_read_is_refused():
    """Sin cabecera no hay forma de saber a qué se refieren los números."""
    with pytest.raises(ColumnRefused):
        read_from_payload(payload(column_header=None))


def test_a_label_with_no_readable_figure_reads_as_nothing():
    """La foto salió mal. Todo desconocido — pero no es un error: el formulario
    se abre igual, con el nombre puesto, y lo tecleas."""
    read = read_from_payload(payload(rows=[], nutrients={}))
    assert all(value is None for value in read.nutrients.values())
    assert read.name == "Yogur natural"


def test_a_missing_brand_is_none_not_empty():
    read = read_from_payload(payload(brand=""))
    assert read.brand is None


def test_a_nutrient_the_model_never_mentioned_is_unknown():
    """Lo que el modelo omite del todo es desconocido, no cero."""
    read = read_from_payload(payload(nutrients={"kcal": 61}))
    assert read.nutrients["protein"] is None
    assert read.nutrients["fiber"] is None


def test_a_negative_or_absurd_figure_is_refused_as_unknown():
    """Un macro negativo no existe, y más de 100 g de proteína en 100 g de
    comida tampoco. Es una lectura mal hecha, no un alimento raro."""
    read = read_from_payload(payload(nutrients={**payload()["nutrients"], "protein": -3}))
    assert read.nutrients["protein"] is None
    read = read_from_payload(payload(nutrients={**payload()["nutrients"], "fat": 140}))
    assert read.nutrients["fat"] is None


def test_kcal_may_exceed_a_hundred():
    """El aceite anda por 900 kcal/100 g. El tope de los gramos no le aplica."""
    rows = ["Valor energético 900 kcal"]
    read = read_from_payload(payload(rows=rows, nutrients={"kcal": 900}))
    assert read.nutrients["kcal"] == 900

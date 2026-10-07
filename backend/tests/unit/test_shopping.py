"""A qué pasillo va cada cosa de la lista de la compra.

Lo de CIQUAL trae su familia y manda ella. Lo que no la trae —los envasados de
Mercadona y Eroski, lo tuyo sin decir— se clasifica por palabras del nombre, en
vez de caer todo en «Otros», que con una compra de súper sería el pasillo más
grande.
"""

from types import SimpleNamespace

import pytest

from app.shopping import PASILLOS, pasillo


def alimento(name, subgroup_code=None):
    return SimpleNamespace(name=name, subgroup_code=subgroup_code)


def test_charcuteria_es_un_pasillo_entre_carne_y_pescado():
    assert PASILLOS.index("Carne") < PASILLOS.index("Charcutería") < PASILLOS.index("Pescado")


@pytest.mark.parametrize(
    ("nombre", "esperado"),
    [
        ("Filetes pechuga pollo", "Carne"),
        ("Solomillo de pavo", "Carne"),
        ("Pechuga de Pavo Cocida 92%", "Charcutería"),
        ("Jamón cocido extra finas lonchas", "Charcutería"),
        ("Lomo embuchado", "Charcutería"),
        ("Lomos de merluza", "Pescado"),
        ("Filetes de merluza del Cabo", "Pescado"),
        ("Atún claro al natural", "Pescado"),
        ("Gamba pelada cruda", "Pescado"),
        ("Queso Fresco Batido", "Lácteos y huevos"),
        ("Leche desnatada +Proteínas", "Lácteos y huevos"),
        ("Claras de huevo pasteurizadas", "Lácteos y huevos"),
        ("Postre lácteo Proteínas con arándanos", "Lácteos y huevos"),
        ("Arroz basmati", "Hidratos"),
        ("Pan de molde 100% integral", "Hidratos"),
        ("Copos de avena", "Hidratos"),
        ("Tortitas de maíz", "Hidratos"),
        ("Garbanzos cocidos", "Hidratos"),
        ("Brócoli", "Fruta y verdura"),
        ("Fresas", "Fruta y verdura"),
        ("Aceite de oliva virgen extra", "Despensa"),
        ("Tomate frito", "Despensa"),
        ("Crema de cacahuete", "Despensa"),
        ("Gelatina neutra", "Otros"),
    ],
)
def test_sin_familia_va_por_el_nombre(nombre, esperado):
    assert pasillo(alimento(nombre)) == esperado


def test_pan_no_es_panceta():
    assert pasillo(alimento("Panceta curada")) != "Hidratos"


def test_la_familia_de_ciqual_manda_sobre_el_nombre():
    # «Patata, sin piel, cruda» es tubérculo en CIQUAL: Hidratos, aunque el
    # nombre no diga nada de pasillos.
    assert pasillo(alimento("Patata, sin piel, cruda", "0202")) == "Hidratos"
    # Y los derivados cárnicos de CIQUAL son charcutería, no carne fresca.
    assert pasillo(alimento("Jamón cocido, extra", "0404")) == "Charcutería"
    assert pasillo(alimento("Pollo, pechuga, sin piel, cruda", "0402")) == "Carne"

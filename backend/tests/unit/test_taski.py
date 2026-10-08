"""Las reglas del envío a Taski: categoría, nombre y cantidad."""

from datetime import date

from app.shopping import Articulo
from app.taski import cantidad, categoria, nombre, nota


def _art(name="Pollo", brand=None, grams=4200, packs=None, package_grams=None):
    return Articulo(1, name, brand, grams, packs, package_grams)


def test_el_pan_va_a_panaderia_y_el_arroz_a_otros():
    assert categoria("Hidratos", "Pan de molde integral") == "Panadería"
    assert categoria("Hidratos", "Arroz redondo") == "Otros"
    assert categoria("Hidratos", "Panceta") == "Otros"


def test_cada_pasillo_va_a_su_categoria():
    assert categoria("Charcutería", "Jamón cocido") == "Carne y pescado"
    assert categoria("Fruta y verdura", "Plátano") == "Frutas y verduras"
    assert categoria("Despensa", "Aceite") == "Otros"


def test_la_cantidad_es_la_que_pinta_la_lista():
    assert cantidad(_art(grams=4200)) == "~4,2 kg"
    assert cantidad(_art(grams=444)) == "~440 g"
    assert cantidad(_art(grams=12000)) == "~12 kg"
    assert cantidad(_art(packs=3, package_grams=500.0)) == "3 × 500 g"
    assert cantidad(_art(packs=2, package_grams=1500.0)) == "2 × 1,5 kg"


def test_la_marca_se_anade_si_no_va_ya_en_el_nombre():
    assert nombre(_art("Queso fresco", "Hacendado")) == "Queso fresco Hacendado"
    assert nombre(_art("Queso fresco Hacendado", "Hacendado")) == "Queso fresco Hacendado"


def test_la_nota_dice_la_semana():
    assert nota(date(2026, 10, 12)) == "Plan de Fitit · semana del 12 oct"

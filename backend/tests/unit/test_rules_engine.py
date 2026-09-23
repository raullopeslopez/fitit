"""El motor de reglas, sin base de datos de por medio.

Los escenarios fijan lo que se ve desde fuera; esto fija los bordes — y el
borde que más importa es la diferencia entre **incumplir** y **no poder saber**.
"""

from datetime import date, timedelta

import pytest

from app.rules import (
    Comida,
    Contexto,
    Dia,
    RuleRefused,
    aceptable,
    aplica,
    evaluar,
    validar,
)

HOY = date(2026, 9, 23)


def regla(**fields):
    base = {
        "id": 1,
        "type": "macro_per_kg",
        "scope": "day",
        "slot": None,
        "day_condition": None,
        "hardness": "hard",
        "params": {"macro": "protein", "min": 1.5, "max": 2},
        "active_from": HOY - timedelta(days=30),
        "active_to": None,
    }
    base.update(fields)
    return base


def dia(**fields):
    base = {"fecha": HOY, "entrenado": False, "macros": {}, "comidas": (), "metodos": ()}
    base.update(fields)
    return Dia(**base)


# --- el catálogo cerrado ------------------------------------------------------
def test_un_tipo_que_nadie_ha_escrito_se_rechaza():
    with pytest.raises(RuleRefused):
        validar(regla(type="come_mejor"))


def test_un_tipo_en_el_ambito_equivocado_se_rechaza():
    """La proteína por kilo es del día; no tiene sentido por hueco."""
    with pytest.raises(RuleRefused):
        validar(regla(scope="slot", slot="cena"))


def test_una_regla_de_hueco_tiene_que_decir_cual():
    with pytest.raises(RuleRefused):
        validar(regla(type="group_presence", scope="slot", slot=None, params={"familia": "verdura"}))


def test_una_familia_inventada_se_rechaza():
    with pytest.raises(RuleRefused):
        validar(regla(type="group_presence", scope="slot", slot="comida", params={"familia": "chuches"}))


def test_un_maximo_por_debajo_del_minimo_se_rechaza():
    with pytest.raises(RuleRefused):
        validar(regla(params={"macro": "protein", "min": 2, "max": 1.5}))


# --- proteína por kilo --------------------------------------------------------
def test_por_debajo_de_la_banda_dice_por_cuanto():
    ctx = Contexto(dia=dia(macros={"protein": 100}), kg=78)
    (v,) = evaluar([regla()], ctx)
    assert v.state == "broken"
    assert v.short_by == 17.0


def test_por_encima_de_la_banda_tambien_incumple():
    ctx = Contexto(dia=dia(macros={"protein": 200}), kg=78)
    (v,) = evaluar([regla()], ctx)
    assert v.state == "broken"


def test_sin_tendencia_de_peso_no_se_puede_saber():
    """Y no saber **no es** incumplir."""
    ctx = Contexto(dia=dia(macros={"protein": 100}), kg=None)
    (v,) = evaluar([regla()], ctx)
    assert v.state == "unknown"


def test_un_dia_que_no_suma_proteina_tampoco_se_puede_juzgar():
    ctx = Contexto(dia=dia(macros={"protein": None}), kg=78)
    (v,) = evaluar([regla()], ctx)
    assert v.state == "unknown"


# --- grupos, y la regla del NULL ---------------------------------------------
VERDURA = regla(type="group_presence", scope="slot", slot="comida", params={"familia": "verdura"})


def test_la_verdura_en_su_hueco_cumple():
    ctx = Contexto(dia=dia(comidas=(Comida(slot="comida", familias=("verdura",)),)))
    assert evaluar([VERDURA], ctx)[0].state == "met"


def test_la_verdura_en_otro_hueco_no_cuenta():
    ctx = Contexto(dia=dia(comidas=(Comida(slot="cena", familias=("verdura",)),)))
    assert evaluar([VERDURA], ctx)[0].state == "broken"


def test_un_alimento_sin_clasificar_no_es_no_es_verdura():
    ctx = Contexto(dia=dia(comidas=(Comida(slot="comida", familias=(None,)),)))
    (v,) = evaluar([VERDURA], ctx)
    assert v.state == "unknown"
    assert v.unclassified == 1


def test_con_verdura_dentro_lo_sin_clasificar_ya_da_igual():
    ctx = Contexto(dia=dia(comidas=(Comida(slot="comida", familias=("verdura", None)),)))
    assert evaluar([VERDURA], ctx)[0].state == "met"


# --- condición y vigencia -----------------------------------------------------
def test_una_regla_de_dias_de_entreno_se_calla_los_demas():
    solo_entreno = regla(day_condition="training")
    assert aplica(solo_entreno, dia(entrenado=False)) is False
    assert aplica(solo_entreno, dia(entrenado=True)) is True


def test_una_regla_retirada_no_se_juzga():
    retirada = regla(active_to=HOY - timedelta(days=1))
    assert aplica(retirada, dia()) is False


def test_una_regla_futura_tampoco():
    futura = regla(active_from=HOY + timedelta(days=1))
    assert aplica(futura, dia()) is False


# --- dureza -------------------------------------------------------------------
def test_una_dura_rota_estropea_el_dia():
    ctx = Contexto(dia=dia(macros={"protein": 100}), kg=78)
    assert aceptable(evaluar([regla(hardness="hard")], ctx)) is False


def test_una_blanda_rota_solo_lo_empeora():
    ctx = Contexto(dia=dia(macros={"protein": 100}), kg=78)
    assert aceptable(evaluar([regla(hardness="soft")], ctx)) is True


def test_no_saber_no_estropea_el_dia():
    """Un `unknown` es la ausencia de un juicio, no un juicio negativo."""
    ctx = Contexto(dia=dia(macros={"protein": 100}), kg=None)
    assert aceptable(evaluar([regla(hardness="hard")], ctx)) is True

"""El generador: la semana que no se repite.

No es un solver. Es un voraz aleatorizado con reinicios, **determinista dada la
semilla**, y eso es lo que permite que el plan sea el mismo el martes que el
jueves y que regenerar con una regla nueva se pueda comparar con el anterior.
"""

from datetime import date, timedelta

import pytest

from app.nutrition import Ajustable
from app.planner import HUECOS, PlanImposible, PlatoCandidato, generar

LUNES = date(2026, 9, 21)
SEMANA = tuple(LUNES + timedelta(days=i) for i in range(7))

ARROZ = {"kcal": 350.0, "protein": 7.0, "fat": 1.0, "carbs": 78.0, "fiber": 1.0}


def _plato(id, nombre, **kwargs):
    kwargs.setdefault("fijo", {"kcal": 500.0, "protein": 35.0, "fat": 15.0, "carbs": 45.0})
    return PlatoCandidato(id=id, nombre=nombre, **kwargs)


def _repertorio(n=12, **kwargs):
    return [_plato(i, f"plato {i}", **kwargs) for i in range(1, n + 1)]


def _objetivos(kcal=2200.0):
    return {dia: {"kcal": kcal, "protein": 160.0, "fat": 70.0, "carbs": 230.0} for dia in SEMANA}


def test_llena_la_semana_entera():
    plan = generar(dias=SEMANA, candidatos=_repertorio(20), objetivos=_objetivos(), seed=7)
    assert len(plan.entradas) == 7 * len(HUECOS)
    assert {e.fecha for e in plan.entradas} == set(SEMANA)
    assert {e.slot for e in plan.entradas} == set(HUECOS)


def test_la_misma_semilla_da_el_mismo_plan():
    """Es lo que hace que el plan sea el mismo el martes que el jueves (§22)."""
    args = dict(dias=SEMANA, candidatos=_repertorio(20), objetivos=_objetivos(), seed=3)
    uno = generar(**args)
    otro = generar(**args)
    assert [(e.fecha, e.slot, e.dish_id) for e in uno.entradas] == [
        (e.fecha, e.slot, e.dish_id) for e in otro.entradas
    ]


def test_otra_semilla_da_otra_semana():
    args = dict(dias=SEMANA, candidatos=_repertorio(20), objetivos=_objetivos())
    uno = generar(seed=1, **args)
    otro = generar(seed=2, **args)
    assert [e.dish_id for e in uno.entradas] != [e.dish_id for e in otro.entradas]


def test_no_repite_dos_dias_seguidos():
    """«Distancia, mejor que tope» (§14): un enfriamiento por plato."""
    plan = generar(dias=SEMANA, candidatos=_repertorio(20), objetivos=_objetivos(), seed=11)
    por_dia = {}
    for entrada in plan.entradas:
        por_dia.setdefault(entrada.fecha, set()).add(entrada.dish_id)
    for uno, siguiente in zip(SEMANA, SEMANA[1:]):
        assert not (por_dia[uno] & por_dia[siguiente])


def test_no_repite_lo_de_la_semana_pasada():
    """Sin mirar atrás, el generador puede devolverte la misma semana otra vez."""
    repertorio = _repertorio(20)
    gastados = {plato.id: LUNES - timedelta(days=2) for plato in repertorio[:8]}
    plan = generar(
        dias=SEMANA,
        candidatos=repertorio,
        objetivos=_objetivos(),
        historial=gastados,
        seed=5,
    )
    assert not ({e.dish_id for e in plan.entradas} & set(gastados))


def test_un_plato_solo_va_a_sus_huecos():
    """Unas lentejas no son un desayuno, y el plato es quien lo sabe."""
    candidatos = [
        _plato(1, "tostada", slots=("desayuno",)),
        *[_plato(i, f"plato {i}", slots=("comida", "cena", "snack")) for i in range(2, 14)],
    ]
    plan = generar(dias=SEMANA, candidatos=candidatos, objetivos=_objetivos(), seed=2)
    for entrada in plan.entradas:
        if entrada.dish_id == 1:
            assert entrada.slot == "desayuno"
        else:
            assert entrada.slot != "desayuno"


def test_un_plato_sin_huecos_declarados_vale_para_cualquiera():
    """`slots` vacío es «no lo has dicho», y no se traduce en «no vale para nada»."""
    plan = generar(dias=SEMANA, candidatos=_repertorio(20), objetivos=_objetivos(), seed=4)
    assert {e.slot for e in plan.entradas} == set(HUECOS)


def test_una_regla_dura_de_hueco_filtra_candidatos():
    """Verdura en la comida: lo que no la lleva no entra ahí, ni un día."""
    reglas = [
        {
            "id": 1,
            "type": "group_presence",
            "scope": "slot",
            "slot": "comida",
            "hardness": "hard",
            "params": {"familia": "verdura"},
        }
    ]
    con = [_plato(i, f"con verdura {i}", familias=("verdura", "cereal")) for i in range(1, 8)]
    sin = [_plato(i, f"sin verdura {i}", familias=("cereal",)) for i in range(8, 20)]
    plan = generar(dias=SEMANA, candidatos=con + sin, objetivos=_objetivos(), reglas=reglas, seed=6)
    comidas = [e.dish_id for e in plan.entradas if e.slot == "comida"]
    assert comidas and all(id <= 7 for id in comidas)


def test_el_dia_se_ajusta_contra_su_objetivo():
    """Los gramos del arroz se mueven hasta que el día cuadra."""
    candidatos = [
        _plato(
            i,
            f"plato {i}",
            fijo={"kcal": 300.0, "protein": 30.0, "fat": 10.0, "carbs": 5.0},
            ajustables=(Ajustable(por_100g=ARROZ, gramos=50.0, minimo=0.0, maximo=300.0),),
        )
        for i in range(1, 16)
    ]
    plan = generar(dias=SEMANA, candidatos=candidatos, objetivos=_objetivos(2000.0), seed=8)
    for fecha in SEMANA:
        del_dia = [e for e in plan.entradas if e.fecha == fecha]
        assert sum(e.gramos[0] for e in del_dia if e.gramos) > 4 * 50.0


def test_un_bloque_no_aporta_ajuste_y_el_resto_compensa():
    """Las lentejas de tu madre son 450 kcal y punto; el día cierra por otro lado."""
    guiso = PlatoCandidato(
        id=99,
        nombre="lentejas de mamá",
        slots=("comida",),
        bloque=True,
        fijo={"kcal": 450.0, "protein": 25.0, "fat": 12.0, "carbs": 55.0},
        ajustables=(Ajustable(por_100g=ARROZ, gramos=80.0, minimo=0.0, maximo=300.0),),
    )
    otros = [
        _plato(
            i,
            f"plato {i}",
            slots=("desayuno", "cena", "snack"),
            fijo={"kcal": 300.0, "protein": 30.0, "fat": 10.0, "carbs": 5.0},
            ajustables=(Ajustable(por_100g=ARROZ, gramos=50.0, minimo=0.0, maximo=400.0),),
        )
        for i in range(1, 16)
    ]
    plan = generar(dias=SEMANA, candidatos=[guiso, *otros], objetivos=_objetivos(2200.0), seed=9)
    lentejas = [e for e in plan.entradas if e.dish_id == 99]
    assert lentejas
    assert all(e.gramos == (80.0,) for e in lentejas)


def test_devuelve_el_porque():
    """Un plan que no cumple algo lo dice, y dice por cuánto."""
    reglas = [
        {
            "id": 2,
            "type": "group_frequency",
            "scope": "week",
            "hardness": "soft",
            "params": {"familia": "legumbre", "min": 3},
        }
    ]
    plan = generar(
        dias=SEMANA,
        candidatos=_repertorio(20, familias=("cereal",)),
        objetivos=_objetivos(),
        reglas=reglas,
        seed=10,
    )
    rotas = [v for v in plan.veredictos if v.state == "broken"]
    assert [v.type for v in rotas] == ["group_frequency"]
    assert rotas[0].short_by == 3


def test_sin_candidatos_para_un_hueco_se_dice():
    """No hay 500 escondido: se nombra el hueco que no se pudo llenar."""
    with pytest.raises(PlanImposible) as refusal:
        generar(
            dias=SEMANA,
            candidatos=[_plato(1, "tostada", slots=("desayuno",))],
            objetivos=_objetivos(),
            seed=1,
        )
    assert refusal.value.slot in HUECOS
    assert refusal.value.slot != "desayuno"


def test_un_repertorio_corto_no_bloquea_la_semana():
    """Con cuatro platos justos el enfriamiento cede antes que el plan.

    Preferir un plan con repeticiones a no dar plan es la misma decisión que
    tomó `repertoire.py`: lo que no se puede hacer perfecto se hace, y se dice.
    """
    candidatos = [_plato(i, f"plato {i}") for i in range(1, 5)]
    plan = generar(dias=SEMANA, candidatos=candidatos, objetivos=_objetivos(), seed=12)
    assert len(plan.entradas) == 7 * len(HUECOS)


def test_un_ingrediente_a_cero_no_vuelve_desconocido_el_plato():
    """Cero gramos aportan cero, que no es lo mismo que «no se sabe».

    Si un ajustable se va al mínimo y eso borrase las kcal del plato, el hueco
    dejaría de poder juzgarse por un tope de cena.
    """
    candidatos = [
        _plato(
            i,
            f"plato {i}",
            fijo={"kcal": 600.0, "protein": 45.0, "fat": 20.0, "carbs": 50.0, "fiber": 3.0},
            ajustables=(Ajustable(por_100g=ARROZ, gramos=60.0, minimo=0.0, maximo=200.0),),
        )
        for i in range(1, 16)
    ]
    # Un objetivo por debajo de lo que ya suma lo fijo: el ajuste no tiene más
    # remedio que irse al mínimo.
    plan = generar(dias=SEMANA, candidatos=candidatos, objetivos=_objetivos(1200.0), seed=13)
    assert any(e.gramos == (0.0,) for e in plan.entradas)
    assert all(e.kcal is not None for e in plan.entradas)


def test_no_se_ajusta_lo_que_no_se_midio_pero_el_plan_sale():
    """Un ingrediente sin el macro que se persigue se queda quieto, no revienta.

    Es la regla del `NULL` leída desde el generador: no se puede ajustar sobre
    lo que nadie midió, y eso no puede dejar sin plan a la semana entera.
    """
    sin_carbs = dict(ARROZ, carbs=None)
    candidatos = [
        _plato(
            i,
            f"plato {i}",
            ajustables=(Ajustable(por_100g=sin_carbs, gramos=70.0, minimo=0.0, maximo=300.0),),
        )
        for i in range(1, 16)
    ]
    plan = generar(dias=SEMANA, candidatos=candidatos, objetivos=_objetivos(), seed=14)
    assert len(plan.entradas) == 7 * len(HUECOS)
    assert all(e.gramos == (70.0,) for e in plan.entradas)


def test_a_dish_weighs_more_the_more_of_it_is_at_home():
    """Fase 6.2: lo que hay en casa empuja al generador sin obligarlo. Nada en
    casa pesa lo de siempre; todo en casa, el triple."""
    from app.planner import peso_en_casa

    assert peso_en_casa([1, 2], set()) == 1.0
    assert peso_en_casa([1, 2], {1}) == 2.0
    assert peso_en_casa([1, 2], {1, 2}) == 3.0
    assert peso_en_casa([], {1}) == 1.0

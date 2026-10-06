"""El import del catálogo del súper (docs/catalogo-supermercado.md, fase 1).

Dos cosas que vigilar, y las dos silenciosas. Qué entra: una ficha de Open Food
Facts la rellena cualquiera, y una cifra mala en el catálogo compartido es una
cifra mala en todos los platos que la usen. Y qué pisa: como el de CIQUAL, se
ejecuta más de una vez, y ni duplica ni toca nada tuyo.
"""

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models import Base, Food, Portion, User
from scripts.import_off import load
from scripts.off_catalogue import product_to_food, serving_portion

QUESO = {
    "code": "8480000510716",
    "product_name": "Queso Fresco Batido",
    "brands": "Hacendado",
    "nutrition_data_per": "100g",
    "quantity": "500 g",
    "serving_size": "1 tarrina (125 g)",
    "nutriments": {
        "energy-kcal_100g": 46,
        "proteins_100g": 8.0,
        "fat_100g": 0.1,
        "carbohydrates_100g": 3.5,
        "fiber_100g": 0,
    },
}


def ficha(**cambios):
    return {**QUESO, **cambios}


def nutrientes(**cambios):
    return {**QUESO["nutriments"], **cambios}


# --- qué entra ---------------------------------------------------------------


def test_una_ficha_coherente_entra_con_su_codigo_y_su_marca():
    food = product_to_food(QUESO)
    assert food["barcode"] == "8480000510716"
    assert food["source_ref"] == "8480000510716"
    assert food["name"] == "Queso Fresco Batido"
    assert food["brand"] == "Hacendado"
    assert food["protein_100g"] == 8.0
    assert food["kcal_100g"] == 46


def test_las_marcas_en_lista_del_buscador_valen_igual():
    assert product_to_food(ficha(brands=["Hacendado", "Mercadona"]))["brand"] == "Hacendado"


def test_macros_que_no_cuadran_con_sus_kcal_no_entran():
    # Visto en Open Food Facts: un «lomo adobado» con 40 g de proteína y 117
    # kcal. Sólo la proteína ya son 160 kcal.
    lomo = ficha(nutriments=nutrientes(**{"energy-kcal_100g": 117, "proteins_100g": 40.0, "fat_100g": 7.2, "carbohydrates_100g": 1.6}))
    assert product_to_food(lomo) is None


def test_la_misma_validacion_que_el_escaner_por_racion_no_entra():
    assert product_to_food(ficha(nutrition_data_per="serving")) is None


def test_sin_kcal_no_entra():
    sin = {k: v for k, v in QUESO["nutriments"].items() if k != "energy-kcal_100g"}
    assert product_to_food(ficha(nutriments=sin)) is None


def test_sin_nombre_no_entra():
    assert product_to_food(ficha(product_name="")) is None


def test_un_nutriente_que_no_trae_es_desconocido_no_cero():
    sin_fibra = {k: v for k, v in QUESO["nutriments"].items() if k != "fiber_100g"}
    food = product_to_food(ficha(nutriments=sin_fibra))
    assert food["fiber_100g"] is None


def test_sin_algun_macro_no_se_puede_juzgar_la_coherencia_y_entra():
    # Juzgar exige los tres macros; con uno desconocido no hay suma que hacer,
    # y descartar por eso dejaría fuera media base. Entra, con su raya.
    sin_grasa = {k: v for k, v in QUESO["nutriments"].items() if k != "fat_100g"}
    food = product_to_food(ficha(nutriments=sin_grasa))
    assert food is not None
    assert food["fat_100g"] is None


# --- la ración de la etiqueta, como medida casera -------------------------------


@pytest.mark.parametrize(
    ("texto", "esperado"),
    [
        ("1 tarrina (125 g)", ("1 tarrina", 125.0)),
        ("125 g", ("1 ración", 125.0)),
        ("30g", ("1 ración", 30.0)),
        ("2 lonchas (22,5 g)", ("2 lonchas", 22.5)),
        ("250 ml", None),
        ("1 unidad", None),
        ("", None),
        (None, None),
    ],
)
def test_la_racion_sale_de_la_etiqueta_solo_si_viene_en_gramos(texto, esperado):
    assert serving_portion(texto) == esperado


def test_la_racion_viaja_con_el_alimento():
    assert product_to_food(QUESO)["portion"] == ("1 tarrina", 125.0)


# --- qué pisa --------------------------------------------------------------------


@pytest.fixture()
def db():
    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    async def create():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)

    asyncio.run(create())
    yield async_sessionmaker(engine, expire_on_commit=False)
    asyncio.run(engine.dispose())


def run(sessionmaker, coro_factory):
    async def go():
        async with sessionmaker() as session:
            return await coro_factory(session)

    return asyncio.run(go())


def todos(sessionmaker, model):
    return run(sessionmaker, lambda s: _all(s, model))


async def _all(session, model):
    return list((await session.execute(select(model))).scalars())


def test_entra_en_el_catalogo_compartido(db):
    run(db, lambda s: load(s, [product_to_food(QUESO)]))
    (food,) = todos(db, Food)
    assert food.user_id is None
    assert food.source == "off"
    assert food.barcode == "8480000510716"
    assert food.brand_folded == "hacendado"


def test_importar_dos_veces_actualiza_y_no_duplica(db):
    run(db, lambda s: load(s, [product_to_food(QUESO)]))
    otra = product_to_food(ficha(nutriments=nutrientes(**{"proteins_100g": 8.5, "energy-kcal_100g": 48})))
    created, updated = run(db, lambda s: load(s, [otra]))
    assert (created, updated) == (0, 1)
    (food,) = todos(db, Food)
    assert food.protein_100g == 8.5


def test_la_racion_entra_una_vez_aunque_se_importe_dos(db):
    run(db, lambda s: load(s, [product_to_food(QUESO)]))
    run(db, lambda s: load(s, [product_to_food(QUESO)]))
    (portion,) = todos(db, Portion)
    assert (portion.label, portion.grams, portion.is_default) == ("1 tarrina", 125.0, True)


def test_no_toca_un_alimento_tuyo_con_el_mismo_codigo(db):
    async def mio(session):
        user = User(username="raul")
        session.add(user)
        await session.flush()
        session.add(Food(user_id=user.id, name="Mi queso", name_folded="mi queso",
                         barcode="8480000510716", kcal_100g=50, protein_100g=7.0))
        await session.commit()

    run(db, mio)
    run(db, lambda s: load(s, [product_to_food(QUESO)]))
    foods = sorted(todos(db, Food), key=lambda f: f.user_id is None)
    assert [(f.name, f.kcal_100g) for f in foods] == [("Mi queso", 50), ("Queso Fresco Batido", 46)]

"""El import de CIQUAL escribe, y lo que escribe encima es lo que hay que vigilar.

Tres cosas pueden salir mal en un import que se ejecuta más de una vez, y las
tres son silenciosas: duplicar el catálogo, pisar un alimento que diste de alta
tú, y devolver al francés unos nombres que ya se habían traducido.
"""

import asyncio
import json

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models import Base, Food, User
from scripts.ciqual import row_to_food
from scripts.import_ciqual import deduplicate, load


def ciqual_row(code, name, kcal="100", **extra):
    row = {
        "alim_code": code,
        "alim_nom_fr": name,
        "alim_grp_nom_fr": "produits céréaliers",
        "Energie, Règlement UE N° 1169/2011 (kcal/100 g)": kcal,
        "Protéines, N x facteur de Jones (g/100 g)": "8",
        "Lipides (g/100 g)": "3",
        "Glucides (g/100 g)": "48",
        "Fibres alimentaires (g/100 g)": "2,6",
        "Sodium (mg/100 g)": "12",
    }
    row.update(extra)
    return row


def parsed(*rows):
    out = []
    for row in rows:
        food = row_to_food(row)
        food["_measured"] = sum(
            1 for k, v in row.items() if k.endswith("/100 g)") and str(v).strip() not in ("", "-")
        )
        out.append(food)
    return out


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


def all_foods(sessionmaker):
    return run(sessionmaker, lambda s: s.execute(select(Food)))


def test_dos_ejecuciones_no_duplican(db):
    foods = parsed(ciqual_row(9621, "Son de blé"), ciqual_row(25945, "Soupe au potiron"))
    first = run(db, lambda s: load(s, foods))
    second = run(db, lambda s: load(s, foods))
    assert first == (2, 0)
    assert second == (0, 2), "la segunda pasada tiene que actualizar, no insertar"
    assert len(all_foods(db).scalars().all()) == 2


def test_la_segunda_pasada_trae_los_valores_corregidos(db):
    run(db, lambda s: load(s, parsed(ciqual_row(9621, "Son de blé", kcal="279"))))
    run(db, lambda s: load(s, parsed(ciqual_row(9621, "Son de blé", kcal="285"))))
    (food,) = all_foods(db).scalars().all()
    assert food.kcal_100g == 285


def test_el_catalogo_no_es_de_nadie(db):
    run(db, lambda s: load(s, parsed(ciqual_row(9621, "Son de blé"))))
    (food,) = all_foods(db).scalars().all()
    assert food.user_id is None
    assert food.source == "ciqual"
    assert food.source_ref == "9621"


def test_no_pisa_un_alimento_tuyo(db):
    async def seed(session):
        session.add(User(id=1, username="yo", password_hash="x"))
        session.add(
            Food(
                user_id=1,
                name="Pan de la panadería",
                name_folded="pan de la panaderia",
                source="manual",
                carb_convention="available",
                kcal_100g=250,
            )
        )
        await session.commit()

    run(db, seed)
    run(db, lambda s: load(s, parsed(ciqual_row(9621, "Son de blé"))))
    mine = [f for f in all_foods(db).scalars().all() if f.user_id == 1]
    assert len(mine) == 1
    assert mine[0].kcal_100g == 250, "el import no tiene nada que decir sobre lo tuyo"


def test_no_devuelve_al_frances_lo_ya_traducido(db):
    """El fallo que se paga caro: traduces 3.185 nombres, vuelves a ejecutar el
    import por cualquier motivo y el catálogo entero regresa al francés."""
    run(db, lambda s: load(s, parsed(ciqual_row(9621, "Son de blé"))))

    async def translate(session):
        food = (await session.execute(select(Food))).scalar_one()
        food.name = "Salvado de trigo"
        food.name_folded = "salvado de trigo"
        await session.commit()

    run(db, translate)
    run(db, lambda s: load(s, parsed(ciqual_row(9621, "Son de blé", kcal="285"))))

    (food,) = all_foods(db).scalars().all()
    assert food.name == "Salvado de trigo", "la traducción no se pisa"
    assert food.kcal_100g == 285, "...pero los nutrientes sí se actualizan"


def test_los_micronutrientes_van_al_json(db):
    run(db, lambda s: load(s, parsed(ciqual_row(9621, "Son de blé"))))
    (food,) = all_foods(db).scalars().all()
    assert json.loads(food.nutrients_json)["sodium_mg"] == 12


def test_un_codigo_repetido_lo_gana_la_fila_con_mas_datos():
    # El duplicado real de CIQUAL 2020: mismo código, una fila vacía.
    vacia = ciqual_row(
        9621,
        "Son de blé",
        kcal="-",
        **{
            "Protéines, N x facteur de Jones (g/100 g)": "-",
            "Lipides (g/100 g)": "-",
            "Glucides (g/100 g)": "-",
            "Fibres alimentaires (g/100 g)": "-",
            "Sodium (mg/100 g)": "-",
        },
    )
    kept = deduplicate(parsed(vacia, ciqual_row(9621, "Son de blé", kcal="279")))
    assert len(kept) == 1
    assert kept[0]["kcal_100g"] == 279

"""Las medidas de pieza: «2 huevos» en vez de «110 g».

Las cucharadas tienen su tabla fija (`MEDIDAS`). Lo que va por piezas —un huevo,
una rebanada, una loncha— sólo existe con un alimento concreto, y su sitio es
`portions` (docs/medidas-caseras.md §2). En producción había cero filas: este
script siembra las del catálogo, y sólo las del catálogo.
"""

import asyncio
import json
from pathlib import Path

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models import Base, Food, Portion, User
from app.nutrition import medida_de_pieza
from scripts.seed_portions import sembrar

DATA = Path(__file__).resolve().parents[2] / "data" / "raciones.json"


@pytest.fixture()
def db():
    engine = create_async_engine(
        "sqlite+aiosqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    async def create():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with async_sessionmaker(engine)() as s:
            user = User(username="u", password_hash="x")
            s.add(user)
            await s.flush()
            s.add_all(
                [
                    Food(name="Huevo, crudo", name_folded="huevo, crudo", kcal_100g=140),
                    # Uno tuyo con el mismo nombre: el catálogo no es tuyo y lo tuyo no se toca.
                    Food(name="Huevo, crudo", name_folded="huevo, crudo", kcal_100g=150, user_id=user.id),
                ]
            )
            await s.commit()

    asyncio.run(create())
    yield async_sessionmaker(engine, expire_on_commit=False)
    asyncio.run(engine.dispose())


def run(sessionmaker, fn):
    async def go():
        async with sessionmaker() as session:
            return await fn(session)

    return asyncio.run(go())


RACIONES = [
    {"food": "Huevo, crudo", "label": "huevo", "grams": 55},
    {"food": "Alimento que no existe", "label": "pieza", "grams": 10},
]


def test_siembra_en_el_alimento_del_catalogo(db):
    assert run(db, lambda s: sembrar(s, RACIONES)) == (1, 0, ["Alimento que no existe"])
    filas = run(db, lambda s: s.execute(select(Portion, Food).join(Food))).all()
    assert [(p.label, p.grams, p.user_id, f.user_id, p.is_default) for p, f in filas] == [
        ("huevo", 55, None, None, True)
    ]


def test_dos_pasadas_no_duplican(db):
    run(db, lambda s: sembrar(s, RACIONES))
    assert run(db, lambda s: sembrar(s, RACIONES)) == (0, 1, ["Alimento que no existe"])
    assert len(run(db, lambda s: s.execute(select(Portion))).all()) == 1


def test_la_lista_del_repo_es_valida():
    raciones = json.loads(DATA.read_text(encoding="utf-8"))
    assert raciones
    assert all(r["food"] and r["label"] and r["grams"] > 0 for r in raciones)
    # Una sola palabra: el plural se forma sobre ella («2 lonchas»).
    assert all(" " not in r["label"] for r in raciones)


@pytest.mark.parametrize(
    ("gramos", "pieza", "etiqueta", "esperado"),
    [
        (110, 55, "huevo", "2 huevos"),
        (55, 55, "huevo", "1 huevo"),
        (70, 30, "rebanada", "2½ rebanadas"),
        (50, 110, "cebolla", "½ cebolla"),
        (225, 200, "vaso", "1 vaso"),
        (180, 120, "plátano", "1½ plátanos"),
        (250, 250, "calabacín", "1 calabacín"),
        (500, 250, "calabacín", "2 calabacines"),
        (20, 120, "tomate", None),  # menos de media pieza no ayuda
        (900, 12, "fresa", None),  # más de ocho, tampoco: se pesa
        (100, None, "huevo", None),
    ],
)
def test_medida_de_pieza(gramos, pieza, etiqueta, esperado):
    assert medida_de_pieza(gramos, pieza, etiqueta) == esperado


def test_un_nombre_repetido_en_el_catalogo_lleva_la_racion_en_todas(db):
    async def otro(s):
        s.add(Food(name="Huevo, crudo", name_folded="huevo, crudo", kcal_100g=141))
        await s.commit()

    run(db, otro)
    assert run(db, lambda s: sembrar(s, RACIONES))[0] == 2

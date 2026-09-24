"""`check_catalogue` es lo que se mira justo después de cargar producción.

Desde que existen los códigos de grupo (`e7b3c02a91d8`), «cargado» y «en
español» ya no bastan: un catálogo entero puede estar presente, traducido y
buscable, y aun así tener las 3.185 filas sin clasificar porque nadie volvió a
pasar el import. Las reglas de dieta contestan entonces «no puedo saberlo» a
todo, y la comprobación anterior daba verde.
"""

import asyncio

import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models import Base, Food, User
from scripts.check_catalogue import contar_grupos, linea_grupos


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


def catalogo(code, name, group=("03", "0305")):
    grupo, subgrupo = group if group else (None, None)
    return Food(
        user_id=None,
        name=name,
        name_folded=name.lower(),
        source="ciqual",
        source_ref=str(code),
        carb_convention="available",
        group_code=grupo,
        subgroup_code=subgrupo,
        kcal_100g=100,
    )


def sembrar(sessionmaker, *foods):
    async def seed(session):
        for food in foods:
            session.add(food)
        await session.commit()

    run(sessionmaker, seed)


def test_cuenta_los_que_no_traen_subgrupo(db):
    sembrar(
        db,
        catalogo(9621, "Salvado de trigo"),
        catalogo(25945, "Sopa de calabaza"),
        catalogo(31000, "Postre (alimento medio)", group=None),
    )
    assert run(db, contar_grupos) == (3, 1)


def test_un_catalogo_recien_migrado_esta_entero_sin_clasificar(db):
    """El estado exacto que este import arregla: columnas creadas, todas NULL."""
    sembrar(db, catalogo(9621, "Salvado", group=None), catalogo(25945, "Sopa", group=None))
    assert run(db, contar_grupos) == (2, 2)


def test_no_mira_los_alimentos_tuyos(db):
    """Un alimento dado de alta a mano no trae código y no tiene por qué: la
    comprobación es sobre el catálogo compartido, no sobre lo tuyo."""

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
    sembrar(db, catalogo(9621, "Salvado de trigo"))
    assert run(db, contar_grupos) == (1, 0), "sólo cuenta las filas de CIQUAL"


def test_la_linea_pasa_cuando_no_queda_ninguno_sin_clasificar():
    ok, linea = linea_grupos(3185, 0)
    assert ok is True
    assert linea.startswith("[ok] ")
    assert "3185" in linea


def test_la_linea_falla_si_queda_alguno_sin_clasificar():
    ok, linea = linea_grupos(3185, 3185)
    assert ok is False
    assert linea.startswith("[!!] ")
    assert "3185" in linea, "hay que ver cuántos faltan, no sólo que falla"


def test_basta_uno_sin_clasificar_para_fallar():
    """No hay margen: las 3.185 filas de CIQUAL traen código."""
    ok, _ = linea_grupos(3185, 1)
    assert ok is False

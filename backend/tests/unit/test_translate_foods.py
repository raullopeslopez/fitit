"""La traducción: qué se acepta del modelo, y qué escribe en la base.

El paso que llama a Gemini no se prueba aquí (no hay red ni clave en la suite).
Lo que sí se prueba es lo que rodea a esa llamada, que es donde puede colarse
basura en el catálogo: qué respuesta se acepta, y que aplicarla dos veces no
duplique alias ni pise nada.
"""

import asyncio
import json

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.models import Base, Food, FoodAlias
from scripts.translate_foods import apply_to_db, validate

BATCH = [{"id": "9621", "fr": "Son de blé"}, {"id": "25945", "fr": "Soupe au potiron"}]


class TestValidate:
    def test_acepta_una_respuesta_bien_formada(self):
        got = validate(BATCH, [{"id": "9621", "es": "Salvado de trigo", "alias": ["salvado"]}])
        assert got == {"9621": {"es": "Salvado de trigo", "alias": ["salvado"]}}

    def test_descarta_un_id_que_no_estaba_en_el_lote(self):
        # El modelo devolviendo un alimento que nadie le pidió: si se aceptara,
        # entraría en el catálogo un nombre inventado atado a un código real.
        assert validate(BATCH, [{"id": "0000", "es": "Cualquier cosa"}]) == {}

    def test_descarta_un_nombre_vacio(self):
        assert validate(BATCH, [{"id": "9621", "es": "   "}]) == {}

    @pytest.mark.parametrize("answer", [None, {}, "texto suelto", [None, 3]])
    def test_aguanta_una_respuesta_que_no_es_lo_pactado(self, answer):
        # Sin excepción: la fila se queda sin traducir y la siguiente ejecución
        # la vuelve a pedir, porque el paso 1 es reanudable.
        assert validate(BATCH, answer) == {}

    def test_corta_los_alias_a_cinco(self):
        got = validate(BATCH, [{"id": "9621", "es": "Salvado", "alias": list("abcdefgh")}])
        assert len(got["9621"]["alias"]) == 5

    def test_un_frances_intacto_es_preferible_a_un_espanol_inventado(self):
        # La regla que resume las de arriba: nada dudoso entra. En francés se
        # nota que falta traducir; un nombre inventado no se nota nunca.
        assert validate(BATCH, [{"id": "9621"}, {"es": "Sopa"}]) == {}


@pytest.fixture()
def db(tmp_path):
    url = f"sqlite+aiosqlite:///{tmp_path / 't.db'}"
    engine = create_async_engine(
        url, connect_args={"check_same_thread": False}, poolclass=StaticPool
    )

    async def create():
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        async with async_sessionmaker(engine)() as session:
            session.add(
                Food(
                    user_id=None,
                    name="Son de blé",
                    name_folded="son de ble",
                    source="ciqual",
                    source_ref="9621",
                    carb_convention="available",
                    kcal_100g=279,
                )
            )
            await session.commit()

    asyncio.run(create())
    asyncio.run(engine.dispose())
    return url


@pytest.fixture()
def translations(tmp_path):
    path = tmp_path / "es.json"
    path.write_text(
        json.dumps({"9621": {"es": "Salvado de trigo", "alias": ["salvado", "afrecho"]}}),
        encoding="utf-8",
    )
    return path


def read(url):
    async def go():
        engine = create_async_engine(
            url, connect_args={"check_same_thread": False}, poolclass=StaticPool
        )
        async with async_sessionmaker(engine)() as session:
            foods = (await session.execute(select(Food))).scalars().all()
            aliases = (await session.execute(select(FoodAlias))).scalars().all()
            out = ([(f.name, f.name_folded) for f in foods], [a.alias for a in aliases])
        await engine.dispose()
        return out

    return asyncio.run(go())


def test_aplica_nombre_y_alias(db, translations):
    asyncio.run(apply_to_db(translations, db))
    foods, aliases = read(db)
    assert foods == [("Salvado de trigo", "salvado de trigo")]
    assert sorted(aliases) == ["afrecho", "salvado"]


def test_aplicarlo_dos_veces_no_duplica_alias(db, translations):
    # El JSON es reaplicable a propósito: si rehaces la base de datos, se vuelve
    # a poner en español sin gastar una llamada. Eso exige que no se acumule.
    asyncio.run(apply_to_db(translations, db))
    asyncio.run(apply_to_db(translations, db))
    _, aliases = read(db)
    assert sorted(aliases) == ["afrecho", "salvado"]


def test_el_nombre_plegado_sigue_al_traducido(db, translations):
    # Si no, el alimento deja de contestar a su propio nombre en el buscador.
    asyncio.run(apply_to_db(translations, db))
    foods, _ = read(db)
    assert foods[0][1] == "salvado de trigo"

"""¿Está el catálogo cargado y en español? Se ejecuta contra la base que quieras.

    uv run python -m scripts.check_catalogue
    uv run python -m scripts.check_catalogue --database-url postgresql://...

Existe porque la comprobación se hace justo después de cargar el catálogo en
producción, que es el momento con más prisa y menos ganas de pelearse con las
comillas de un one-liner en PowerShell. Y porque hay que repetirla cada vez que
se recargue.

Sólo lee. No escribe nada.
"""

import argparse
import asyncio
import sys

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Food, FoodAlias
from app.naming import fold_exercise_name as fold
from app.routers.foods import _rank, search_stmt

# Lo que tiene que haber tras `import_ciqual` + `translate_foods --apply`.
ESPERADO_ALIMENTOS = 3185
ESPERADO_ALIAS = 5962

# Y desde `e7b3c02a91d8`, con código de grupo. Las 3.185 filas de CIQUAL traen
# uno: las 45 que la hoja deja en blanco son los *nombres* (`alim_grp_nom_fr`),
# no los códigos — 44 de esas 45 llevan igualmente ('03', '0305'), y la
# restante el centinela ('00', '0000'). Así que aquí no se tolera ninguna sin
# clasificar: un solo NULL significa que el import no ha vuelto a pasar, y una
# regla de dieta que cuente verduras contestará «no puedo saberlo».
ESPERADO_SIN_GRUPO = 0

# Cuatro búsquedas que sólo funcionan si la traducción se aplicó entera: ninguna
# de las cuatro palabras aparece en el nombre del alimento que tiene que salir.
# `verdel` llega a la caballa, `aove` al aceite de oliva, `quark` al queso
# batido y `chicharro` al jurel — todas por alias. Si salen, están puestos.
SONDAS = ("pollo", "arroz", "verdel", "aove", "quark", "chicharro")


async def contar_grupos(session) -> tuple[int, int]:
    """(alimentos de catálogo, cuántos de ellos sin `subgroup_code`).

    Mira sólo las filas de CIQUAL. Un alimento que diste de alta a mano no trae
    código de grupo y no tiene por qué: nadie le ha preguntado de qué familia es.
    """
    total = (
        await session.execute(select(func.count(Food.id)).where(Food.source == "ciqual"))
    ).scalar()
    sin_codigo = (
        await session.execute(
            select(func.count(Food.id)).where(Food.source == "ciqual", Food.subgroup_code.is_(None))
        )
    ).scalar()
    return total, sin_codigo


def linea_grupos(total: int, sin_codigo: int) -> tuple[bool, str]:
    """El veredicto y su línea, en el mismo formato que las demás."""
    ok = sin_codigo == ESPERADO_SIN_GRUPO
    marca = "ok" if ok else "!!"
    linea = f"[{marca}] códigos de grupo:      {total - sin_codigo} de {total} clasificados"
    if not ok:
        linea += f" — {sin_codigo} sin clasificar"
    return ok, linea


async def revisar(database_url: str | None) -> bool:
    from app.config import settings

    engine = create_async_engine(database_url or settings.database_url)
    ok = True
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        alimentos = (
            await session.execute(select(func.count(Food.id)).where(Food.source == "ciqual"))
        ).scalar()
        alias = (await session.execute(select(func.count(FoodAlias.id)))).scalar()

        marca = "ok" if alimentos == ESPERADO_ALIMENTOS else "!!"
        print(f"[{marca}] alimentos de catálogo: {alimentos} (esperado {ESPERADO_ALIMENTOS})")
        marca = "ok" if alias == ESPERADO_ALIAS else "!!"
        print(f"[{marca}] alias:                 {alias} (esperado {ESPERADO_ALIAS})")
        ok = alimentos == ESPERADO_ALIMENTOS and alias == ESPERADO_ALIAS

        total_grupos, sin_grupo = await contar_grupos(session)
        ok_grupos, linea = linea_grupos(total_grupos, sin_grupo)
        print(linea)
        ok = ok and ok_grupos

        print("\nbúsquedas:")
        for consulta in SONDAS:
            needle = fold(consulta)
            filas = list((await session.execute(search_stmt(0, needle))).unique().scalars().all())
            golpes = set(
                (
                    await session.execute(
                        select(FoodAlias.food_id).where(FoodAlias.alias_folded.contains(needle))
                    )
                )
                .scalars()
                .all()
            )
            filas.sort(key=lambda f: _rank(f, needle, golpes))
            if filas:
                print(f"  [ok] {consulta:<10} {len(filas):>3} → {filas[0].name[:46]}")
            else:
                print(f"  [!!] {consulta:<10} sin resultados")
                ok = False
    await engine.dispose()
    return ok


def main() -> None:
    parser = argparse.ArgumentParser(description="Comprueba el catálogo de alimentos.")
    parser.add_argument("--database-url", help="por defecto, la de app.config (DATABASE_URL)")
    args = parser.parse_args()

    if asyncio.run(revisar(args.database_url)):
        print("\nEl catálogo está cargado y en español.")
    else:
        print("\nAlgo falta. Vuelve a lanzar import_ciqual y translate_foods --apply.")
        sys.exit(1)


if __name__ == "__main__":
    main()

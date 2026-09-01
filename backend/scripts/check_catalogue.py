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

# Cuatro búsquedas que sólo funcionan si la traducción se aplicó entera: ninguna
# de las cuatro palabras aparece en el nombre del alimento que tiene que salir.
# `verdel` llega a la caballa, `aove` al aceite de oliva, `quark` al queso
# batido y `chicharro` al jurel — todas por alias. Si salen, están puestos.
SONDAS = ("pollo", "arroz", "verdel", "aove", "quark", "chicharro")


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

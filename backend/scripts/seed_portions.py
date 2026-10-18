"""Siembra las medidas de pieza del catálogo: «1 huevo = 55 g», «1 loncha = 15 g».

    uv run python -m scripts.seed_portions                 # contra settings.database_url
    uv run python -m scripts.seed_portions --dry-run       # dice qué haría, no escribe
    uv run python -m scripts.seed_portions --database-url postgresql://...

La lista vive en `data/raciones.json`, escrita a mano y versionada: se lee, se
corrige y se vuelve a pasar. Como los imports del catálogo (CLAUDE.md), es
**idempotente y no toca nada tuyo**: sólo escribe raciones sin `user_id` sobre
alimentos sin `user_id`, nunca borra, y una ración que ya existe con esa
etiqueta se queda como está. Un nombre que no está en el catálogo se dice y se
salta: inventarle una fila sería escribir el catálogo por otra puerta.
"""

import argparse
import asyncio
import json
import sys
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Food, Portion

DATA = Path(__file__).resolve().parents[1] / "data" / "raciones.json"


async def sembrar(session, raciones, *, guardar: bool = True) -> tuple[int, int, list[str]]:
    """(raciones nuevas, las que ya estaban, nombres que no están en el catálogo)."""
    nuevas = 0
    ya = 0
    faltan: list[str] = []
    for r in raciones:
        # Todas las filas del catálogo con ese nombre: hay nombres repetidos
        # («Jamón serrano» tres veces) y tus platos usan una cualquiera de ellas.
        foods = (
            await session.execute(select(Food).where(Food.name == r["food"], Food.user_id.is_(None)))
        ).scalars().all()
        if not foods:
            faltan.append(r["food"])
            continue
        for food in foods:
            existe = (
                await session.execute(
                    select(Portion.id).where(
                        Portion.food_id == food.id,
                        Portion.user_id.is_(None),
                        Portion.label == r["label"],
                    )
                )
            ).first()
            if existe:
                ya += 1
                continue
            session.add(Portion(food_id=food.id, label=r["label"], grams=r["grams"], is_default=True))
            nuevas += 1
    if guardar:
        await session.commit()
    else:
        await session.rollback()
    return nuevas, ya, faltan


async def _main(database_url: str | None, dry_run: bool) -> int:
    from app.config import settings

    raciones = json.loads(DATA.read_text(encoding="utf-8"))
    engine = create_async_engine(database_url or settings.database_url)
    try:
        async with async_sessionmaker(engine, expire_on_commit=False)() as session:
            nuevas, ya, faltan = await sembrar(session, raciones, guardar=not dry_run)
    finally:
        await engine.dispose()
    print(f"{'(simulado) ' if dry_run else ''}{nuevas} nuevas, {ya} ya estaban")
    for nombre in faltan:
        print(f"  no está en el catálogo: {nombre}")
    return 1 if faltan else 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--database-url")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()
    sys.exit(asyncio.run(_main(args.database_url, args.dry_run)))


if __name__ == "__main__":
    main()

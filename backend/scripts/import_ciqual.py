"""Carga la tabla CIQUAL en `foods`. Se ejecuta a mano, no desde la app.

    uv run python -m scripts.import_ciqual --file Table\\ Ciqual\\ 2020_FR....xls
    uv run python -m scripts.import_ciqual --download        # la baja de ANSES
    uv run python -m scripts.import_ciqual --file ... --dry-run

Idempotente: la clave es `(source, source_ref)` con restricción única en la base
de datos, así que ejecutarlo dos veces actualiza en vez de duplicar.

Tres cosas que este script no hace, y que son decisiones y no olvidos:

- **No toca ningún alimento tuyo.** Sólo escribe filas de catálogo
  (`user_id IS NULL`). Una fila con `user_id` es algo que diste de alta a mano y
  el import no tiene nada que decir sobre ella.
- **No borra.** Un alimento que desaparezca de una edición futura se queda: hay
  entradas del diario apuntándolo, y el histórico no se reescribe.
- **No traduce.** Los nombres entran en francés; `scripts/translate_foods.py` es
  un paso aparte y explícito.

Las reglas de normalización están en `scripts/ciqual_rules.md`.
"""

import argparse
import asyncio
import json
import sys
import urllib.request
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.models import Food
from app.naming import fold_exercise_name as fold
from scripts.ciqual import measured_count, row_to_food

CIQUAL_URL = (
    "https://ciqual.anses.fr/cms/sites/default/files/inline-files/"
    "Table%20Ciqual%202020_FR_2020%2007%2007.xls"
)
DEFAULT_FILE = Path("data/ciqual2020.xls")
# ANSES pide un agente identificable, igual que Open Food Facts.
USER_AGENT = "Fitit/0.1 (personal workout+food tracker; github.com/raullopeslopez/fitit)"


def download(target: Path) -> Path:
    target.parent.mkdir(parents=True, exist_ok=True)
    print(f"descargando CIQUAL → {target}")
    request = urllib.request.Request(CIQUAL_URL, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=120) as response, target.open("wb") as out:
        out.write(response.read())
    return target


def read_rows(path: Path) -> list[dict]:
    """La hoja `compo` como lista de dicts {cabecera: celda}."""
    try:
        import xlrd
    except ModuleNotFoundError:  # pragma: no cover - depende del entorno
        sys.exit("falta xlrd: uv add --dev xlrd")

    sheet = xlrd.open_workbook(str(path)).sheet_by_index(0)
    headers = [str(h).strip() for h in sheet.row_values(0)]
    return [dict(zip(headers, sheet.row_values(r), strict=True)) for r in range(1, sheet.nrows)]


def deduplicate(foods: list[dict]) -> list[dict]:
    """Un `source_ref` por alimento; gana la fila con más nutrientes medidos.

    CIQUAL 2020 trae `Son de blé` dos veces con el código 9621, una fila vacía y
    otra con datos. Sin este desempate el resultado depende del orden de lectura.
    """
    best: dict[str, dict] = {}
    for food in foods:
        current = best.get(food["source_ref"])
        if current is None or food["_measured"] > current["_measured"]:
            best[food["source_ref"]] = food
    return list(best.values())


async def load(session: AsyncSession, foods: list[dict]) -> tuple[int, int]:
    """Inserta o actualiza. Devuelve (nuevos, actualizados)."""
    existing = {
        food.source_ref: food
        for food in (await session.execute(select(Food).where(Food.source == "ciqual"))).scalars()
    }
    created = updated = 0
    for row in foods:
        fields = {
            "name": row["name"],
            "name_folded": fold(row["name"]),
            "source": "ciqual",
            "source_ref": row["source_ref"],
            "carb_convention": row["carb_convention"],
            "group_code": row["group_code"],
            "subgroup_code": row["subgroup_code"],
            "kcal_100g": row["kcal_100g"],
            "kcal_estimated": row["kcal_estimated"],
            "protein_100g": row["protein_100g"],
            "fat_100g": row["fat_100g"],
            "carbs_100g": row["carbs_100g"],
            "fiber_100g": row["fiber_100g"],
            "nutrients_json": json.dumps(row["nutrients"], sort_keys=True),
        }
        food = existing.get(row["source_ref"])
        if food is None:
            # `user_id=None` explícito: esto es catálogo compartido, no de nadie.
            session.add(Food(user_id=None, **fields))
            created += 1
        else:
            # El nombre NO se pisa si ya está traducido: volver a ejecutar el
            # import detrás de `translate_foods.py` devolvería el catálogo
            # entero al francés, que es la peor forma de perder ese trabajo.
            if food.name != row["name"] and fold(food.name) != fold(row["name"]):
                fields.pop("name")
                fields.pop("name_folded")
            for key, value in fields.items():
                setattr(food, key, value)
            updated += 1
    await session.commit()
    return created, updated


async def main() -> None:
    parser = argparse.ArgumentParser(description="Importa la tabla CIQUAL a `foods`.")
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE, help="el .xls de ANSES")
    parser.add_argument("--download", action="store_true", help="bájalo si no está")
    parser.add_argument("--database-url", help="por defecto, la de app.config")
    parser.add_argument("--dry-run", action="store_true", help="parsea y cuenta, sin escribir")
    args = parser.parse_args()

    path = args.file
    if not path.exists():
        if not args.download:
            sys.exit(f"no existe {path}. Pásalo con --file o usa --download.")
        path = download(path)

    rows = read_rows(path)
    foods = []
    for row in rows:
        food = row_to_food(row)
        food["_measured"] = measured_count(row)
        foods.append(food)
    foods = deduplicate(foods)

    sin_kcal = sum(1 for f in foods if f["kcal_100g"] is None)
    estimadas = sum(1 for f in foods if f["kcal_estimated"])
    print(f"{len(rows)} filas → {len(foods)} alimentos ({len(rows) - len(foods)} duplicados)")
    print(f"{estimadas} con kcal estimadas por Atwater (ver ciqual_rules.md)")
    print(f"{sin_kcal} sin kcal — les falta un macro para estimarlas, se quedan en NULL")
    if args.dry_run:
        print("--dry-run: no se ha escrito nada")
        return

    from app.config import settings

    engine = create_async_engine(args.database_url or settings.database_url)
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        created, updated = await load(session, foods)
    await engine.dispose()
    print(f"listo: {created} nuevos, {updated} actualizados")


if __name__ == "__main__":
    asyncio.run(main())

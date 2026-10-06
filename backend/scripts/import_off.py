"""Carga el catálogo del súper en `foods`. Se ejecuta a mano, no desde la app.

    uv run python -m scripts.import_off --download          # baja de OFF y escribe el artefacto
    uv run python -m scripts.import_off                     # importa data/off_supermercados.json
    uv run python -m scripts.import_off --dry-run           # cuenta qué entraría, sin escribir

Envasados de marca de Hacendado (Mercadona) y Eroski, de Open Food Facts. Lo
fresco no: una pechuga es igual en cualquier súper y CIQUAL ya la tiene
(docs/catalogo-supermercado.md, §2).

El artefacto, `data/off_supermercados.json`, se versiona por lo mismo que
`ciqual_es.json`: rehacer la base no vuelve a pedirle miles de fichas a OFF, y
prod no depende de que su API conteste el día del import.

Las mismas tres decisiones que `import_ciqual`, por los mismos motivos:

- **No toca ningún alimento tuyo.** Sólo escribe `user_id IS NULL`. Si tú tienes
  ese código de barras dado de alta, el escáner y la búsqueda te dan el tuyo.
- **No borra.** Un producto que desaparezca de OFF se queda: el diario puede
  estar apuntándolo.
- **Es idempotente.** La clave es `(source="off", source_ref=<EAN>)`, con su
  restricción única en la base.
"""

import argparse
import asyncio
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import selectinload

from app.models import Food, Portion
from app.naming import fold_exercise_name as fold
from app.openfoodfacts import USER_AGENT
from scripts.off_catalogue import product_to_food

DEFAULT_FILE = Path("data/off_supermercados.json")
MARCAS = ("hacendado", "eroski")
SEARCH = "https://search.openfoodfacts.org/search"
CAMPOS = ("code", "product_name", "brands", "quantity", "serving_size", "nutrition_data_per",
          "product_quantity_unit", "categories_tags", "nutriments")
NUTRIENTES_OFF = ("energy-kcal_100g", "proteins_100g", "fat_100g", "carbohydrates_100g", "fiber_100g")
# Lo que OFF tiene de esas marcas y no es comida que apuntar.
FUERA = ("en:alcoholic-beverages", "en:pet-food", "en:dog-food", "en:cat-food")


def download(target: Path) -> Path:
    """Baja las fichas de las marcas y guarda sólo lo que el import necesita."""
    productos = []
    for marca in MARCAS:
        pagina = 1
        while True:
            params = urllib.parse.urlencode({
                "q": f"brands:{marca}", "page": pagina, "page_size": 100, "fields": ",".join(CAMPOS),
            })
            req = urllib.request.Request(f"{SEARCH}?{params}", headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(req, timeout=60) as resp:
                datos = json.load(resp)
            hits = datos.get("hits") or []
            for p in hits:
                if any(tag in (p.get("categories_tags") or []) for tag in FUERA):
                    continue
                nut = p.get("nutriments") or {}
                p["nutriments"] = {k: nut[k] for k in NUTRIENTES_OFF if k in nut}
                p.pop("categories_tags", None)
                productos.append(p)
            print(f"  {marca}: página {pagina}/{datos.get('page_count')}", file=sys.stderr)
            if pagina >= (datos.get("page_count") or 0) or not hits:
                break
            pagina += 1
            time.sleep(0.5)  # OFF lo pide: sin ráfagas
    # Un EAN, una ficha. El orden de OFF no es estable entre descargas.
    unicos = {str(p.get("code")): p for p in productos if p.get("code")}
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(
        json.dumps(sorted(unicos.values(), key=lambda p: str(p["code"])), ensure_ascii=False, indent=0),
        encoding="utf-8",
    )
    return target


async def load(session: AsyncSession, foods: list[dict]) -> tuple[int, int]:
    """Inserta o actualiza. Devuelve (nuevos, actualizados)."""
    existing = {
        food.source_ref: food
        for food in (
            await session.execute(
                select(Food).options(selectinload(Food.portions)).where(Food.source == "off")
            )
        ).scalars()
    }
    created = updated = 0
    for row in foods:
        fields = {
            "name": row["name"],
            "name_folded": fold(row["name"]),
            "brand": row["brand"],
            "brand_folded": fold(row["brand"]) if row["brand"] else None,
            "barcode": row["barcode"],
            "source": "off",
            "source_ref": row["source_ref"],
            "kcal_100g": row["kcal_100g"],
            "protein_100g": row["protein_100g"],
            "fat_100g": row["fat_100g"],
            "carbs_100g": row["carbs_100g"],
            "fiber_100g": row["fiber_100g"],
        }
        food = existing.get(row["source_ref"])
        if food is None:
            # `user_id=None` explícito: catálogo compartido, no de nadie.
            food = Food(user_id=None, **fields)
            food.portions = []
            session.add(food)
            existing[row["source_ref"]] = food
            created += 1
        else:
            for key, value in fields.items():
                setattr(food, key, value)
            updated += 1
        portion = row.get("portion")
        if portion and all(p.label != portion[0] for p in food.portions):
            label, grams = portion
            food.portions.append(Portion(label=label, grams=grams, is_default=not food.portions))
    await session.commit()
    return created, updated


async def main() -> None:
    parser = argparse.ArgumentParser(description="Importa el catálogo del súper a `foods`.")
    parser.add_argument("--file", type=Path, default=DEFAULT_FILE)
    parser.add_argument("--download", action="store_true", help="bájalo de OFF antes")
    parser.add_argument("--database-url", help="por defecto, la de app.config")
    parser.add_argument("--dry-run", action="store_true", help="cuenta qué entraría, sin escribir")
    args = parser.parse_args()

    if args.download:
        download(args.file)
    if not args.file.exists():
        sys.exit(f"no existe {args.file}. Usa --download.")

    productos = json.loads(args.file.read_text(encoding="utf-8"))
    foods = [f for f in (product_to_food(p) for p in productos) if f]
    con_racion = sum(1 for f in foods if f["portion"])
    print(f"{len(productos)} fichas → {len(foods)} entran ({len(productos) - len(foods)} descartadas)")
    print(f"{con_racion} con medida casera de la etiqueta")
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

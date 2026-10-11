"""Traduce los nombres de CIQUAL al español, una vez y para siempre.

Dos pasos deliberadamente separados, y la separación es el diseño:

    # 1. Llama a Gemini y deja el resultado en un fichero. Reanudable.
    GEMINI_API_KEY=... uv run python -m scripts.translate_foods \
        --file data/ciqual2020.xls --out data/ciqual_es.json

    # 2. Escribe ese fichero en la base de datos. Sin red, sin clave, sin IA.
    uv run python -m scripts.translate_foods --apply data/ciqual_es.json

La traducción es un **artefacto de datos**, no una mutación de la base. Vive en
un JSON que se puede leer, corregir a mano, commitear y volver a aplicar: si un
día rehaces la base de datos, el paso 2 la deja en español otra vez sin gastar
una sola llamada. Y si el modelo se equivoca en «Blé dur», lo arreglas editando
una línea en vez de volviendo a traducir tres mil alimentos.

Reanudable: el paso 1 lee lo que ya haya en `--out` y sólo pide lo que falta,
así que una llamada fallida a mitad no obliga a empezar de cero.

Ninguna IA en tiempo de ejecución. Esto se ejecuta a mano, una vez.
"""

import argparse
import asyncio
import json
import os
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.models import Food, FoodAlias
from app.naming import fold_exercise_name as fold
from scripts.ciqual import CODE_COLUMN, NAME_COLUMN
from scripts.import_ciqual import read_rows

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"

PROMPT = """Traduces nombres de alimentos del francés al español de España, para el
buscador de un diario de comida.

REGLAS:
- Devuelve SOLO un array JSON. Sin markdown, sin explicación.
- Un objeto por alimento de la entrada, con su mismo "id":
  {"id": "<el id de la entrada>", "es": "<nombre en español>", "alias": ["...", "..."]}
- Conserva la precisión culinaria: "cru"/"cuit" son "crudo"/"cocido", y esa
  distinción es la mitad del valor del dato — no la pierdas ni la resumas.
- 3 a 5 alias de búsqueda: sinónimos reales y regionalismos con los que alguien
  buscaría ese alimento en España ("judías", "alubias", "habichuelas"). Sin
  acentos no hace falta: el buscador ya los ignora.
- No inventes. Si no reconoces el alimento, transcribe lo más literal posible y
  deja "alias" vacío. Un nombre aproximado es peor que uno literal.
- No añadas ni quites alimentos. Mismo número de objetos que de entradas.

ENTRADAS:
{items}"""


def call_gemini(model: str, api_key: str, batch: list[dict], timeout: int = 120) -> list[dict]:
    items = "\n".join(f'{{"id": "{f["id"]}", "fr": "{f["fr"]}"}}' for f in batch)
    body = json.dumps(
        {
            "contents": [{"parts": [{"text": PROMPT.replace("{items}", items)}]}],
            "generationConfig": {"responseMimeType": "application/json", "temperature": 0},
        }
    ).encode()
    request = urllib.request.Request(
        API.format(model=model),
        data=body,
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        payload = json.loads(response.read())
    text = payload["candidates"][0]["content"]["parts"][0]["text"]
    return json.loads(text)


def validate(batch: list[dict], answer) -> dict[str, dict]:
    """Quédate sólo con lo que el modelo ha contestado bien.

    Un id que no estaba en el lote, un nombre vacío: fuera. No se reintenta la
    fila, se deja sin traducir — y como el paso 1 es reanudable, la siguiente
    ejecución la vuelve a pedir. Meter en el catálogo un nombre que el modelo se
    inventó es peor que dejar uno en francés, porque en francés se nota.
    """
    wanted = {f["id"] for f in batch}
    out = {}
    for item in answer if isinstance(answer, list) else []:
        if not isinstance(item, dict):
            continue
        key = str(item.get("id", "")).strip()
        name = str(item.get("es", "")).strip()
        if key not in wanted or not name:
            continue
        alias = [str(a).strip() for a in item.get("alias", []) if str(a).strip()]
        out[key] = {"es": name, "alias": alias[:5]}
    return out


def translate(args) -> None:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key and not args.dry_run:
        sys.exit("falta GEMINI_API_KEY en el entorno (o usa --dry-run para ver los lotes)")

    rows = read_rows(args.file)
    foods = [
        {
            "id": str(int(r[CODE_COLUMN]))
            if isinstance(r[CODE_COLUMN], float)
            else str(r[CODE_COLUMN]),
            "fr": str(r[NAME_COLUMN]).strip().replace('"', "'"),
        }
        for r in rows
    ]

    done: dict[str, dict] = {}
    if args.out.exists():
        done = json.loads(args.out.read_text(encoding="utf-8"))
        print(f"reanudando: {len(done)} ya traducidos en {args.out}")

    pending = [f for f in foods if f["id"] not in done]
    if args.limit:
        pending = pending[: args.limit]
    batches = [pending[i : i + args.batch] for i in range(0, len(pending), args.batch)]
    print(f"{len(pending)} pendientes en {len(batches)} lotes de {args.batch}")
    if args.dry_run:
        print(
            "--dry-run: primer lote\n"
            + "\n".join(f"  {f['id']}  {f['fr'][:60]}" for f in batches[0][:5])
            if batches
            else ""
        )
        return

    for index, batch in enumerate(batches, 1):
        try:
            got = validate(batch, call_gemini(args.model, api_key, batch))
        except (urllib.error.URLError, KeyError, ValueError) as exc:
            # Se guarda lo que haya y se para: reanudar es volver a lanzarlo.
            print(f"lote {index} falló ({exc}); guardando lo conseguido y parando")
            break
        done.update(got)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        # Escrito en cada lote, no al final: un corte a mitad no puede costar
        # ochenta llamadas ya pagadas.
        args.out.write_text(
            json.dumps(done, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8"
        )
        print(f"lote {index}/{len(batches)}: {len(got)}/{len(batch)} — total {len(done)}")
        time.sleep(args.sleep)

    print(f"listo: {len(done)} traducciones en {args.out}")


async def apply_to_db(path: Path, database_url: str | None) -> None:
    translations = json.loads(path.read_text(encoding="utf-8"))
    from app.config import settings

    engine = create_async_engine(database_url or settings.database_url)
    renamed = aliased = 0
    async with async_sessionmaker(engine, expire_on_commit=False)() as session:
        foods = (await session.execute(select(Food).where(Food.source == "ciqual"))).scalars().all()
        existing = {
            (a.food_id, a.alias_folded)
            for a in (await session.execute(select(FoodAlias))).scalars()
        }
        for food in foods:
            entry = translations.get(food.source_ref)
            if entry is None:
                continue
            if food.name != entry["es"]:
                food.name = entry["es"]
                food.name_folded = fold(entry["es"])
                renamed += 1
            for alias in entry["alias"]:
                folded = fold(alias)
                # Reaplicable: los alias no se duplican al volver a ejecutarlo.
                if folded and (food.id, folded) not in existing:
                    session.add(FoodAlias(food_id=food.id, alias=alias, alias_folded=folded))
                    existing.add((food.id, folded))
                    aliased += 1
        await session.commit()
    await engine.dispose()
    print(f"aplicado: {renamed} nombres, {aliased} alias nuevos")


def main() -> None:
    parser = argparse.ArgumentParser(description="Traduce el catálogo CIQUAL al español.")
    parser.add_argument("--file", type=Path, default=Path("data/ciqual2020.xls"))
    parser.add_argument("--out", type=Path, default=Path("data/ciqual_es.json"))
    parser.add_argument("--apply", type=Path, help="escribe un JSON ya traducido en la BD")
    parser.add_argument("--model", default="gemini-3.8-flash")
    parser.add_argument("--batch", type=int, default=40, help="alimentos por llamada")
    parser.add_argument("--limit", type=int, help="para probar con unos pocos")
    parser.add_argument("--sleep", type=float, default=1.0, help="segundos entre llamadas")
    parser.add_argument("--database-url")
    parser.add_argument("--dry-run", action="store_true", help="enseña los lotes, no llama")
    args = parser.parse_args()

    if args.apply:
        asyncio.run(apply_to_db(args.apply, args.database_url))
    else:
        translate(args)


if __name__ == "__main__":
    main()

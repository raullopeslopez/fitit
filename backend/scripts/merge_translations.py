"""Une los trozos de `data/es_parts/` en `data/ciqual_es.json`.

La traducción se escribe por tandas para que un corte a mitad no cueste todo lo
anterior; este paso es el que produce el fichero que `translate_foods --apply`
consume. Idempotente: se puede volver a ejecutar en cualquier momento.
"""

import json
from pathlib import Path

PARTS = Path("data/es_parts")
OUT = Path("data/ciqual_es.json")


def main() -> None:
    merged: dict[str, dict] = {}
    for part in sorted(PARTS.glob("*.json")):
        merged.update(json.loads(part.read_text(encoding="utf-8")))
    OUT.write_text(
        json.dumps(merged, ensure_ascii=False, indent=1, sort_keys=True), encoding="utf-8"
    )
    print(f"{len(merged)} traducciones → {OUT}")


if __name__ == "__main__":
    main()

"""La tabla de medidas caseras del frontend es copia de la del backend.

`nutrition.MEDIDAS` manda: con ella se guardan los gramos. `frontend/src/food.js`
lleva una copia para enseñar «≈ 30 g» mientras eliges, sin ir al servidor. Si
se separan, la hoja promete una cifra y el diario guarda otra, sin error en
ninguna parte — lo mismo que vigila el par `food_log_date` / `foodDayIso`.
"""

import re
from pathlib import Path

from app.nutrition import MEDIDAS

FOOD_JS = Path(__file__).resolve().parents[3] / "frontend" / "src" / "food.js"


def test_las_medidas_del_frontend_son_las_del_backend():
    source = FOOD_JS.read_text(encoding="utf-8")
    match = re.search(r"export const MEASURES = \{([^}]*)\}", source)
    assert match, "food.js ya no exporta MEASURES"
    pairs = dict(re.findall(r"(\w+):\s*([\d.]+)", match.group(1)))
    assert {k: float(v) for k, v in pairs.items()} == MEDIDAS

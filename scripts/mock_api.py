"""Un backend de mentira para mirar el frontend en el navegador.

No hay backend local (Postgres, sin `.env`): el dev server proxea `/api` a
`localhost:8000`, y esto contesta ahí lo justo para que Plan y Comida pinten.
Es para verificar pantallas, no para probar lógica: la lógica la prueban los
escenarios del backend.

    python -I scripts/mock_api.py          # en otra terminal: npm run dev

Datos, con «hoy» el día en que se arranca:
- Plan de esta semana y de la anterior, con la cena de ayer y el desayuno de
  anteayer sin decir, y el resto de días pasados dichos. Cada plato pesa
  662 g, y la comida de hoy gana hidrato por el entreno.
- Días cuidados: cuatro de los seis días anteriores.
- Lista de la compra de 35 artículos en 7 pasillos.
- Revisión semanal pendiente, con el recuento del plan.
- Una comida de fuera estimada en tres líneas, una por elegir.
- Dos sitios («Bar Paco», «Táper de mamá»), y la cena de hoy reservada en
  «Bar Paco».
- Seis semanas de entrenos para Días: empuje, tirón y pierna a días alternos,
  que encienden los diez músculos.

`ThreadingHTTPServer` a propósito: con el de un solo hilo la página se queda
a medio cargar, porque el navegador pide varias cosas a la vez.
"""

import json
import re
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOY = date.today()
HUECOS = ("desayuno", "comida", "cena", "snack")
PLATOS = {"desayuno": "Tostadas con tomate", "comida": "Pollo con arroz",
          "cena": "Merluza al horno", "snack": "Yogur con nueces"}
SIN_DECIR = {(HOY - timedelta(days=1), "cena"), (HOY - timedelta(days=2), "desayuno")}


ENTRENOS = {
    "Empuje": [("Press banca", "Pecho"), ("Press militar", "Hombro"), ("Fondos", "Tríceps")],
    "Tirón": [("Remo con barra", "Espalda"), ("Curl de bíceps", "Bíceps"), ("Plancha", "Core")],
    "Pierna": [("Sentadilla", "Cuádriceps"), ("Peso muerto rumano", "Femoral"),
               ("Hip thrust", "Glúteo"), ("Gemelo de pie", "Gemelo")],
}


def dias_entreno():
    out, n = [], 0
    for atras in range(1, 43, 2):
        d = (HOY - timedelta(days=atras)).isoformat()
        nombre = list(ENTRENOS)[atras // 2 % 3]
        sets = []
        for i, (ej, grupo) in enumerate(ENTRENOS[nombre]):
            for k in range(3):
                n += 1
                sets.append({"id": n, "exercise_id": i + 1, "exercise_name": ej, "kind": "strength",
                             "muscle_group": grupo, "secondary_groups": [], "set_index": k, "reps": 8,
                             "weight": 50, "rpe": None, "note": None, "duration_seconds": None,
                             "distance": None, "created_at": f"{d}T18:{i}{k}:00Z"})
        out.append({"id": atras, "date": d, "workouts": [{"id": atras, "date": d, "name": nombre, "sets": sets}]})
    return out


def entreno_en_curso(wid):
    # Un entreno de hoy a medias: dos series del primero, la primera hace 32 min.
    from datetime import datetime, timezone
    ahora = datetime.now(timezone.utc)
    base = next(d for d in dias_entreno() if d["id"] == wid) if wid % 2 else dias_entreno()[0]
    w = dict(base["workouts"][0], id=wid, date=HOY.isoformat())
    primero = w["sets"][0]["exercise_name"]
    sets = [s for s in w["sets"] if s["exercise_name"] == primero][:2]
    for k, s in enumerate(sets):
        s["created_at"] = (ahora - timedelta(minutes=32 - 3 * k)).isoformat().replace("+00:00", "Z")
    return dict(w, sets=sets)


def lunes(d):
    return d - timedelta(days=d.weekday())


def plan(semana):
    entradas, n = [], 0
    for i in range(7):
        dia = semana + timedelta(days=i)
        for slot in HUECOS:
            n += 1
            dicho = dia < HOY and (dia, slot) not in SIN_DECIR
            entradas.append({
                "id": int(semana.strftime("%m%d")) * 100 + n, "log_date": dia.isoformat(),
                "slot": slot, "dish_id": HUECOS.index(slot) + 1, "dish_name": PLATOS[slot],
                "grams": [150], "kcal": 500,
                "items": [{"food_name": "Base", "grams": 400}, {"food_name": "Guarnición", "grams": 262}],
                "carbs_shift": 30 if (dia == HOY and slot == "comida") else None,
                "status": "done" if dicho else None, "log_entry_id": None,
            })
            if dia == HOY and slot == "cena":
                entradas[-1].update(dish_id=70, dish_name="Bar Paco", kcal=951.4, place=True)
    return {"id": 1, "week_start": semana.isoformat(), "seed": 1, "score": 0,
            "verdicts": [], "entries": entradas}


PLANES = {s.isoformat(): plan(s) for s in (lunes(HOY), lunes(HOY) - timedelta(days=7))}
AISLES = [{"name": f"Pasillo {p}", "items": [
    {"food_id": p * 10 + i, "name": f"Alimento {p}-{i}", "grams": 300,
     "packs": None, "package_grams": None} for i in range(5)]} for p in range(1, 8)]


def dia_comida(iso):
    return {"date": iso, "entries": [], "totals": {"kcal": 1450, "protein": 98, "fat": 50,
            "carbs": 140, "fiber": 20}, "target_kcal": 2150, "target_protein": 160,
            "remaining_protein": 62, "unknown": {}, "label_reading": True}


SITIOS = [
    {"id": 70, "name": "Bar Paco", "kind": "fuera", "estimated": True, "servings": 1,
     "basis": "cooked", "per_serving": {"kcal": 951.4},
     "ingredients": [{"id": 1, "food_id": 1, "food_name": "Lentejas estofadas", "grams": 250},
                     {"id": 2, "food_id": 2, "food_name": "Ternera, filete", "grams": 150},
                     {"id": 3, "food_id": 4, "food_name": "Aceite de oliva", "grams": 15}]},
    {"id": 71, "name": "Táper de mamá", "kind": "fuera", "estimated": False, "servings": 1,
     "basis": "cooked", "per_serving": {"kcal": 620},
     "ingredients": [{"id": 4, "food_id": 1, "food_name": "Lentejas estofadas", "grams": 400}]},
]


CASA = [
    {"id": 2, "name": "Pollo con arroz", "kind": "casa", "servings": 4, "basis": "raw",
     "slots": ["comida"], "is_block": False, "per_serving": {"kcal": 620, "protein": 45},
     "batch": {"id": 3, "cooked_grams": 2400, "cooked_on": HOY.isoformat()},
     "ingredients": [{"id": 9, "food_id": 5, "food_name": "Pollo, pechuga", "grams": 800},
                     {"id": 10, "food_id": 6, "food_name": "Arroz blanco", "grams": 400}]},
    {"id": 3, "name": "Merluza al horno", "kind": "casa", "servings": 1, "basis": "raw",
     "slots": ["cena"], "is_block": False, "per_serving": {"kcal": 500, "protein": 40}, "batch": None,
     "ingredients": [{"id": 11, "food_id": 7, "food_name": "Merluza", "grams": 250}]},
    {"id": 4, "name": "Lentejas con verduras", "kind": "casa", "servings": 1, "basis": "raw",
     "slots": ["comida"], "is_block": False, "per_serving": {"kcal": 540, "protein": 28}, "batch": None,
     "at_home": 1, "ingredients": [{"id": 12, "food_id": 8, "food_name": "Lentejas", "grams": 80},
                                   {"id": 13, "food_id": 9, "food_name": "Zanahoria", "grams": 100}]},
    {"id": 5, "name": "Garbanzos con espinacas", "kind": "casa", "servings": 1, "basis": "raw",
     "slots": ["comida"], "is_block": False, "per_serving": {"kcal": 580, "protein": 26}, "batch": None,
     "at_home": 0, "ingredients": [{"id": 14, "food_id": 10, "food_name": "Garbanzos", "grams": 80}]},
]


class H(BaseHTTPRequestHandler):
    def _send(self, code, body):
        data = json.dumps(body).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        ruta, _, query = self.path.partition("?")
        if ruta == "/days":
            return self._send(200, dias_entreno())
        if m := re.fullmatch(r"/workouts/(\d+)", ruta):
            return self._send(200, entreno_en_curso(int(m[1])))
        if ruta == "/exercises/previous":
            from urllib.parse import parse_qs
            nombre = parse_qs(query).get("name", [""])[0]
            d = (HOY - timedelta(days=6)).isoformat()
            serie = lambda i, kg, reps: {"id": 900 + i, "exercise_name": nombre, "kind": "strength", "reps": reps,
                                         "weight": kg, "set_index": i, "created_at": f"{d}T18:0{i}:00Z"}
            return self._send(200, {"exercise_name": nombre, "found": True,
                                    "sets": [serie(0, 80, 10), serie(1, 82.5, 8), serie(2, 82.5, 8)],
                                    "best_by_reps": [{"reps": 8, "weight": 82.5}], "best_one_rm": 104})
        if ruta == "/cared-days":
            # Días cuidados (Hoy → los siete puntos): cuatro de los seis anteriores.
            dias = [(HOY - timedelta(days=k)).isoformat() for k in (1, 2, 4, 5)]
            return self._send(200, {"days": dias})
        if ruta == "/foods/frequent":
            # «Otra cosa»: lo que sueles comer, con tu cantidad.
            filas = [("Mozzarella", 67), ("Leche sin lactosa semidesnatada", 400),
                     ("Queso cottage", 90), ("Tortillas", 135), ("Aguacate", 75)]
            return self._send(200, [{"food_id": 100 + i, "name": n, "brand": None, "grams": g,
                                     "kcal": None, "meal_slot": "cena", "times": 3, "with_bone": False,
                                     "measure": None, "measure_count": None} for i, (n, g) in enumerate(filas)])
        if ruta == "/food-log":
            return self._send(200, dia_comida(query.removeprefix("date=")))
        if m := re.fullmatch(r"/plans/(\d{4}-\d\d-\d\d)/shopping", ruta):
            return self._send(200, {"week_start": m[1], "aisles": AISLES})
        if m := re.fullmatch(r"/plans/(\d{4}-\d\d-\d\d)", ruta):
            return self._send(200, PLANES[m[1]]) if m[1] in PLANES else self._send(404, {"detail": "no"})
        if ruta == "/targets/review":
            return self._send(200, {"due": True, "answer": None, "plan_meals": 28, "plan_meals_said": 26})
        if ruta.startswith("/targets"):
            return self._send(200, {"objetivo_kcal": 2150})
        if ruta == "/rules/verdicts":
            return self._send(200, {"verdicts": []})
        if ruta == "/dishes" and "kind=fuera" in query:
            return self._send(200, SITIOS)
        if ruta == "/dishes":
            return self._send(200, CASA)
        if ruta.endswith("/adherence"):
            return self._send(200, {"weakest_slot": "cena", "days": 0, "decided": 0, "pending": 0})
        if ruta.startswith("/plans") or "adherence" in ruta:
            return self._send(404, {"detail": "no"})
        return self._send(200, [])

    def do_PATCH(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        if m := re.fullmatch(r"/plans/entries/(\d+)", self.path):
            for p in PLANES.values():
                for e in p["entries"]:
                    if e["id"] == int(m[1]):
                        e["status"] = body.get("status")
                        print("PATCH", e["log_date"], e["slot"], body, flush=True)
                        return self._send(200, e)
        return self._send(404, {"detail": "no"})

    def do_PUT(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        if m := re.fullmatch(r"/plans/entries/(\d+)/dish", self.path):
            sitio = next((s for s in SITIOS if s["id"] == body.get("dish_id")), None)
            for p in PLANES.values():
                for e in p["entries"]:
                    if e["id"] == int(m[1]) and sitio:
                        e.update(dish_id=sitio["id"], dish_name=sitio["name"],
                                 kcal=sitio["per_serving"]["kcal"], place=True)
                        print("PUT", e["log_date"], e["slot"], body, flush=True)
                        return self._send(200, e)
        return self._send(404, {"detail": "no"})

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        crudo = self.rfile.read(n)
        # Una subida (PDF) llega en multipart: no es JSON y no se lee.
        es_json = "json" in (self.headers.get("Content-Type") or "")
        body = json.loads(crudo or b"{}") if es_json else {}
        if self.path == "/food-log/text":
            # «Apuntar lo que has escrito»: tarda 2,5 s para poder ver la espera.
            import time
            time.sleep(2.5)
            linea = lambda t, i, n, g: {"text": t, "status": "chosen", "food": {"id": i, "name": n},
                                        "candidates": [], "grams": g, "measure": None,
                                        "measure_count": None, "estimated": True, "unit_question": None}
            return self._send(200, {"transcript": body.get("text"), "refusal": None, "lines": [
                linea("lentejas", 1, "Lentejas estofadas", 350),
                linea("un filete", 2, "Filete de ternera a la plancha", 150),
                linea("patatas", 3, "Patatas fritas", 120),
                linea("aceite", 4, "Aceite de oliva", 15)]})
        if self.path == "/plans/out/estimate":
            return self._send(200, {"refusal": None, "lines": [
                {"text": "250 g lentejas estofadas", "quantity": 250, "unit": "g", "recipe_grams": 250,
                 "grams": 250, "status": "chosen", "food": {"id": 1, "name": "Lentejas estofadas"},
                 "candidates": []},
                {"text": "150 g filete de ternera", "quantity": 150, "unit": "g", "recipe_grams": 150,
                 "grams": 150, "status": "ambiguous", "food": None,
                 "candidates": [{"id": 2, "name": "Ternera, filete"}, {"id": 3, "name": "Ternera picada"}]},
                {"text": "15 g aceite de oliva", "quantity": 15, "unit": "g", "recipe_grams": 15,
                 "grams": 15, "status": "chosen", "food": {"id": 4, "name": "Aceite de oliva"},
                 "candidates": []},
            ]})
        if m := re.fullmatch(r"/dishes/(\d+)/batches", self.path):
            print("POST batch", m[1], body, flush=True)
            return self._send(201, {"id": 9, "cooked_grams": body["cooked_grams"], "cooked_on": body["date"]})
        if self.path == "/pantry/ticket":
            return self._send(200, {"refusal": None, "lines": [
                {"text": "1000 g melón", "grams": 1000, "status": "chosen",
                 "food": {"id": 8, "name": "Melón"}, "candidates": []},
                {"text": "6000 g leche semidesnatada sin lactosa", "grams": 6000, "status": "ambiguous",
                 "food": None, "candidates": [{"id": 9, "name": "Leche semidesnatada sin lactosa"},
                                              {"id": 10, "name": "Leche semidesnatada"}]},
                {"text": "600 g relleno para fajitas", "grams": 600, "status": "missing",
                 "food": None, "candidates": []},
            ]})
        if self.path == "/pantry":
            print("POST pantry", body, flush=True)
            return self._send(201, {"saved": len(body["items"]), "in_list": 21, "off_list": 2,
                                    "missing": ["Merluza"]})
        if self.path == "/plans":
            w = body.get("week_start")
            PLANES[w] = plan(date.fromisoformat(w))
            return self._send(201, PLANES[w])
        return self._send(200, {})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8000), H).serve_forever()

"""Un backend de mentira para mirar el frontend en el navegador.

No hay backend local (Postgres, sin `.env`): el dev server proxea `/api` a
`localhost:8000`, y esto contesta ahí lo justo para que Plan y Comida pinten.
Es para verificar pantallas, no para probar lógica: la lógica la prueban los
escenarios del backend.

    python -I scripts/mock_api.py          # en otra terminal: npm run dev

Datos, con «hoy» el día en que se arranca:
- Plan de esta semana y de la anterior, con la cena de ayer y el desayuno de
  anteayer sin decir, y el resto de días pasados dichos.
- Lista de la compra de 35 artículos en 7 pasillos.
- Revisión semanal pendiente, con el recuento del plan.
- Una comida de fuera estimada en tres líneas, una por elegir.

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
                "grams": [150], "items": [], "kcal": 500,
                "status": "done" if dicho else None, "log_entry_id": None,
            })
    return {"id": 1, "week_start": semana.isoformat(), "seed": 1, "score": 0,
            "verdicts": [], "entries": entradas}


PLANES = {s.isoformat(): plan(s) for s in (lunes(HOY), lunes(HOY) - timedelta(days=7))}
AISLES = [{"name": f"Pasillo {p}", "items": [
    {"food_id": p * 10 + i, "name": f"Alimento {p}-{i}", "grams": 300,
     "packs": None, "package_grams": None} for i in range(5)]} for p in range(1, 8)]


def dia_comida(iso):
    return {"date": iso, "entries": [], "totals": {"kcal": 1450, "protein": 98, "fat": 50,
            "carbs": 140, "fiber": 20}, "target_kcal": 2150, "target_protein": 160,
            "remaining_protein": 62, "unknown": {}}


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

    def do_POST(self):
        n = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
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
        if self.path == "/plans":
            w = body.get("week_start")
            PLANES[w] = plan(date.fromisoformat(w))
            return self._send(201, PLANES[w])
        return self._send(200, {})

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", 8000), H).serve_forever()

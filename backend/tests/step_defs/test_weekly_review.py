"""La revisión semanal: «¿Apuntaste todo lo que comiste?»"""

import asyncio
from datetime import UTC, date, datetime, timedelta

from pytest_bdd import given, parsers, scenarios, then, when
from sqlalchemy import select

from app.db import get_session
from app.main import app

scenarios("../features/weekly_review.feature")


def _perfil(client, **fields):
    resp = client.patch("/targets", json=fields)
    assert resp.status_code == 200, resp.text


COMIDAS = ("desayuno", "comida", "cena", "snack")


def _comer(client, kcal_dia, *, dias, desde, comidas=4):
    """Un alimento de 100 kcal/100 g, `dias` días seguidos desde hace `desde`
    hacia atrás (100 kcal/100 g ⇒ los gramos son las kcal), repartido en
    `comidas` comidas. Cuatro por defecto: un día del que se mide el gasto es un
    día entero, y con menos de tres comidas apuntadas no cuenta."""
    food = client.post(
        "/foods", json={"name": f"Comida {kcal_dia}-{desde}-{comidas}", "kcal_100g": 100}
    ).json()
    for atras in range(desde, desde + dias):
        momento = datetime.now(UTC).replace(hour=12) - timedelta(days=atras)
        for slot in COMIDAS[:comidas]:
            resp = client.post(
                "/food-log",
                json={"food_id": food["id"], "grams": kcal_dia / comidas,
                      "logged_at": momento.isoformat(), "meal_slot": slot},
            )
            assert resp.status_code == 201, resp.text


def _en_la_base(fn):
    """Ejecuta `fn(session)` sobre la misma base que ve `client`. La fila de la
    revisión no sale por HTTP —`accepted` no es de la API—, así que se lee por debajo."""

    async def go():
        gen = app.dependency_overrides[get_session]()
        session = await gen.__anext__()
        try:
            return await fn(session)
        finally:
            await gen.aclose()

    return asyncio.run(go())


def _filas():
    from app.models import WeeklyReview

    async def leer(session):
        return list((await session.execute(select(WeeklyReview))).scalars())

    return _en_la_base(leer)


@given(parsers.parse("I answered the weekly review {dias:d} days ago"))
def given_answered_before(client, dias):
    # Por debajo y no por HTTP: la API sólo contesta con fecha de hoy, y lo que
    # se fija aquí es cuánto hace que se contestó.
    from app.models import WeeklyReview

    user_id = client.get("/auth/me").json()["id"]

    async def escribir(session):
        session.add(
            WeeklyReview(
                user_id=user_id, review_date=date.today() - timedelta(days=dias), answer="all"
            )
        )
        await session.commit()

    _en_la_base(escribir)


@given("I logged food two days ago")
def given_logged(client):
    _comer(client, 500, dias=1, desde=2)


@given(parsers.parse("I am a {age:d} year old man, {cm:g} cm, weighing {kg:g} kg"))
def given_body(client, age, cm, kg):
    _perfil(client, height_cm=cm, birth_year=date.today().year - age, sex="male")
    for atras in (20, 19, 1, 0):  # dos pesadas por extremo: tendencia en cada mitad
        resp = client.post(
            "/body-weight",
            json={"measured_on": (date.today() - timedelta(days=atras)).isoformat(), "kg": kg},
        )
        assert resp.status_code == 201, resp.text


@given("my goal is to maintain")
def given_maintain(client):
    _perfil(client, goal="maintain", goal_rate=0)


@given(
    parsers.parse(
        "I ate {antes:d} kcal a day in the two weeks before "
        "and {semana:d} in the week to review"
    )
)
def given_two_weeks(client, antes, semana):
    # La semana revisada es [hoy−7, hoy−1]; las dos de antes, hasta hoy−21.
    _comer(client, semana, dias=7, desde=1)
    _comer(client, antes, dias=14, desde=8)


@when("I ask about the weekly review", target_fixture="revision")
def when_ask_review(client):
    resp = client.get("/targets/review")
    assert resp.status_code == 200, resp.text
    return resp.json()


@then("the review is due")
def then_due(revision):
    assert revision["due"] is True


@then("the review is not due")
def then_not_due(revision):
    assert revision["due"] is False


@then("it covers the seven days before today")
def then_period(revision):
    assert revision["review_date"] == date.today().isoformat()
    assert revision["period_from"] == (date.today() - timedelta(days=7)).isoformat()
    assert revision["period_to"] == (date.today() - timedelta(days=1)).isoformat()


@when(parsers.parse('I answer the weekly review with "{answer}"'), target_fixture="propuesta")
def when_answer(client, answer):
    resp = client.post("/targets/review", json={"answer": answer})
    assert resp.status_code == 200, resp.text
    return resp.json()


@then(parsers.parse('the stored answer is "{answer}"'))
def then_stored(revision, answer):
    assert revision["answer"] == answer


@when("I ask what I should eat", target_fixture="propuesta")
def when_ask_proposal(client):
    resp = client.get("/targets/proposal")
    assert resp.status_code == 200, resp.text
    return resp.json()


@then("it returns a proposal")
def then_proposal(propuesta):
    assert propuesta["kcal"] is not None
    assert propuesta["source"] in ("formula", "measured")


@then("my daily target has not changed")
def then_unchanged(client):
    assert client.get("/targets").json()["objetivo_kcal"] is None


@then("the proposal says the number came from my own data")
def then_measured(propuesta):
    assert propuesta["source"] == "measured"


@then(parsers.parse("the proposal is {kcal:d} kcal"))
def then_proposal_is(propuesta, kcal):
    assert propuesta["kcal"] == kcal


@when("I accept the proposal the review returned")
def when_accept_returned(client, propuesta):
    resp = client.post("/targets/accept", json={"kcal": propuesta["kcal"]})
    assert resp.status_code == 200, resp.text


@when(parsers.parse("I accept a target of {kcal:g} kcal"))
def when_accept_other(client, kcal):
    resp = client.post("/targets/accept", json={"kcal": kcal})
    assert resp.status_code == 200, resp.text


@then("the review is marked accepted")
def then_accepted():
    (fila,) = _filas()
    assert fila.accepted is True


@then("the review is not marked accepted")
def then_not_accepted():
    (fila,) = _filas()
    assert fila.accepted is False


@then("there is one review stored")
def then_one_row():
    assert len(_filas()) == 1


@then(parsers.parse('the stored answer in the database is "{answer}"'))
def then_db_answer(answer):
    (fila,) = _filas()
    assert fila.answer == answer



@given(
    parsers.parse(
        "I ate {antes:d} kcal a day in the two weeks before "
        "and {semana:d} in {comidas:d} meals a day in the week to review"
    )
)
def given_two_weeks_meals(client, antes, semana, comidas):
    _comer(client, semana, dias=7, desde=1, comidas=comidas)
    _comer(client, antes, dias=14, desde=8)


@then(parsers.parse("the proposal says {n:d} days were left out as half-logged"))
def then_half_logged(propuesta, n):
    assert propuesta["partial_days"] == n


# --- registro sin huecos, fase 1 ---------------------------------------------
def _repertorio(client):
    food = client.post(
        "/foods",
        json={"name": "Pollo", "kcal_100g": 165, "protein_100g": 31, "fat_100g": 3.6,
              "carbs_100g": 0, "familia": "carne"},
    ).json()
    for i in range(1, 13):
        resp = client.post(
            "/dishes",
            json={"name": f"Plato {i}", "servings": 1,
                  "ingredients": [{"food_id": food["id"], "grams": 150}]},
        )
        assert resp.status_code == 201, resp.text


def _planes_de_la_semana_revisada(client):
    """Las filas del plan de los siete días revisados (de ayer hacia atrás), que
    pueden caer en dos semanas distintas."""
    _repertorio(client)
    dias = {(date.today() - timedelta(days=atras)).isoformat() for atras in range(1, 8)}
    lunes = {date.fromisoformat(d) - timedelta(days=date.fromisoformat(d).weekday()) for d in dias}
    filas = []
    for semana in sorted(lunes):
        resp = client.post("/plans", json={"week_start": semana.isoformat()})
        assert resp.status_code == 201, resp.text
        filas += [e for e in resp.json()["entries"] if e["log_date"] in dias]
    return filas


def _decir(client, filas):
    # Saltarse no escribe en el diario: lo que se comprueba es que el día quede
    # dicho, no qué se comió.
    for fila in filas:
        resp = client.patch(f"/plans/entries/{fila['id']}", json={"status": "skipped"})
        assert resp.status_code == 200, resp.text


@given("I said something about every planned meal of the week to review")
def given_said_everything(client):
    _decir(client, _planes_de_la_semana_revisada(client))


@given(parsers.parse("a plan for the week to review where I said {n:d} meals"))
def given_plan_some_said(client, n):
    _decir(client, _planes_de_la_semana_revisada(client)[:n])


@then(parsers.parse("it counts {n:d} of the planned meals as said"))
def then_counts_said(revision, n):
    assert revision["plan_meals"] == 28
    assert revision["plan_meals_said"] == n


@given("I said I don't know about every planned meal of the week to review")
def given_dont_know(client):
    for fila in _planes_de_la_semana_revisada(client):
        resp = client.patch(f"/plans/entries/{fila['id']}", json={"status": "unknown"})
        assert resp.status_code == 200, resp.text

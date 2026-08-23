"""Exercise names match regardless of case, accents and surrounding whitespace,
so "Bench Press", "bench press" and " Bench  Press " are the same exercise — and
so are "Extensión de tríceps" and "Extension de triceps", because nobody holds
down a key for the accent between two sets."""


def _log(client, workout_id, name, reps, weight):
    r = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": reps, "weight": weight},
    )
    assert r.status_code == 201, r.text
    return r


def test_previous_marks_match_name_case_insensitively(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Bench Press", 8, 60)

    resp = client.get("/exercises/previous", params={"name": "  bench press "})

    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["found"] is True
    assert len(body["sets"]) == 1
    assert body["sets"][0]["weight"] == 60


def test_logging_a_name_variant_reuses_the_same_exercise(client):
    w1 = client.post("/workouts", json={}).json()
    _log(client, w1["id"], "Bench Press", 8, 60)
    w2 = client.post("/workouts", json={}).json()
    _log(client, w2["id"], "bench press", 5, 70)

    # Previous marks resolve to the most recent (w2) set — proving the variant
    # reused the same exercise instead of creating a second one.
    resp = client.get("/exercises/previous", params={"name": "BENCH PRESS"})

    body = resp.json()
    assert body["found"] is True
    assert len(body["sets"]) == 1
    assert body["sets"][0]["weight"] == 70


def test_logging_without_the_accents_reuses_the_accented_exercise(client):
    """Typed on a phone, mid-set, the accent is the first thing that goes. If
    that made a second exercise, half the history would live on each spelling
    and the mark to beat would be whichever one the card happened to ask for."""
    w1 = client.post("/workouts", json={}).json()
    _log(client, w1["id"], "Extensión de tríceps", 12, 25)
    w2 = client.post("/workouts", json={}).json()
    _log(client, w2["id"], "extension de triceps", 10, 30)

    names = [e["name"] for e in client.get("/exercises").json()]
    assert names == ["Extensión de tríceps"]  # one row, keeping the spelling it was created with

    body = client.get("/exercises/previous", params={"name": "Extension de triceps"}).json()
    assert body["found"] is True
    assert body["sets"][0]["weight"] == 30


def test_an_uppercase_accented_name_still_matches_its_lowercase_spelling(client):
    """`func.lower` is the database's idea of lowercase, and SQLite's only
    covers ASCII — so "BÚLGARA" and "búlgara" agreed in Postgres and not in the
    test suite. Folding in Python makes both answer the same."""
    w1 = client.post("/workouts", json={}).json()
    _log(client, w1["id"], "SENTADILLA BÚLGARA", 8, 40)
    w2 = client.post("/workouts", json={}).json()
    _log(client, w2["id"], "Sentadilla búlgara", 8, 45)

    assert len(client.get("/exercises").json()) == 1

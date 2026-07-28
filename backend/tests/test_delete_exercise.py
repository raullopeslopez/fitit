"""Deleting and merging exercises: the two ways to clean up a mistyped name.

Both are destructive, so both are scoped to the owner and both take the sets
with them — delete drops them, merge moves them. Spec:
tests/features/manage_exercises.feature
"""


def _log(client, workout_id, name, reps=5, weight=50.0):
    r = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": reps, "weight": weight},
    )
    assert r.status_code == 201, r.text
    return r.json()


def _exercise(client, name):
    return next((e for e in client.get("/exercises").json() if e["name"] == name), None)


def test_delete_an_exercise_with_no_sets(client):
    created = client.post("/exercises", json={"name": "Fondo"}).json()
    assert client.delete(f"/exercises/{created['id']}").status_code == 204
    assert _exercise(client, "Fondo") is None


def test_delete_takes_its_sets_with_it(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Fondo")
    _log(client, workout["id"], "Press banca")
    fondo = _exercise(client, "Fondo")

    assert client.delete(f"/exercises/{fondo['id']}").status_code == 204

    # Only its own sets go; the rest of the workout is untouched.
    remaining = client.get(f"/workouts/{workout['id']}").json()["sets"]
    assert [s["exercise_name"] for s in remaining] == ["Press banca"]
    # And it leaves nothing behind in the derived views.
    assert client.get("/exercises/history", params={"name": "Fondo"}).json() == []
    assert client.get("/exercises/previous", params={"name": "Fondo"}).json()["found"] is False


def test_delete_missing_exercise_is_404(client):
    assert client.delete("/exercises/9999").status_code == 404


def test_delete_reindexes_the_sets_left_behind(client):
    """The next set logged must not reuse a live index — set_index is assigned
    from the count of sets in the workout, so a hole would collide."""
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Fondo")  # index 0
    _log(client, workout["id"], "Press banca")  # index 1
    client.delete(f"/exercises/{_exercise(client, 'Fondo')['id']}")

    body = _log(client, workout["id"], "Press banca")
    assert sorted(s["set_index"] for s in body["sets"]) == [0, 1]


def test_merge_moves_the_sets_and_drops_the_duplicate(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Fondos", reps=5, weight=30)
    _log(client, workout["id"], "Fondo", reps=8, weight=20)
    fondo, fondos = _exercise(client, "Fondo"), _exercise(client, "Fondos")

    r = client.post(f"/exercises/{fondo['id']}/merge", json={"into_id": fondos["id"]})
    assert r.status_code == 200, r.text
    assert r.json()["name"] == "Fondos"

    assert _exercise(client, "Fondo") is None
    sets = client.get(f"/workouts/{workout['id']}").json()["sets"]
    assert [s["exercise_name"] for s in sets] == ["Fondos", "Fondos"]
    # The history of both is now one history.
    prev = client.get("/exercises/previous", params={"name": "Fondos"}).json()
    assert len(prev["sets"]) == 2


def test_merge_keeps_the_indexes_unique(client):
    workout = client.post("/workouts", json={}).json()
    _log(client, workout["id"], "Fondos")
    _log(client, workout["id"], "Fondo")
    fondo, fondos = _exercise(client, "Fondo"), _exercise(client, "Fondos")

    client.post(f"/exercises/{fondo['id']}/merge", json={"into_id": fondos["id"]})

    sets = client.get(f"/workouts/{workout['id']}").json()["sets"]
    assert sorted(s["set_index"] for s in sets) == [0, 1]


def test_merge_into_itself_is_rejected(client):
    ex = client.post("/exercises", json={"name": "Fondos"}).json()
    r = client.post(f"/exercises/{ex['id']}/merge", json={"into_id": ex["id"]})
    assert r.status_code == 422, r.text


def test_merge_across_kinds_is_rejected(client):
    """A cardio row and a strength row hold different metrics; folding one into
    the other would leave sets whose kind no longer matches their exercise."""
    strength = client.post("/exercises", json={"name": "Remo"}).json()
    cardio = client.post("/exercises", json={"name": "Remo máquina", "kind": "cardio"}).json()

    r = client.post(f"/exercises/{cardio['id']}/merge", json={"into_id": strength["id"]})
    assert r.status_code == 409, r.text


def test_merge_missing_target_is_404(client):
    ex = client.post("/exercises", json={"name": "Fondos"}).json()
    assert client.post(f"/exercises/{ex['id']}/merge", json={"into_id": 9999}).status_code == 404

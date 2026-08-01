"""`set_count` — how many sets an exercise already holds.

The muscle group lives on the exercise, not on the set, so re-tagging one
silently re-buckets every set ever logged against it: weeks of per-muscle
totals move at a tap. The client has to be able to say how much is about to
move before it moves, and the screen where you re-tag (a card mid-workout)
doesn't hold the log to count it from. So the count travels with the exercise.
"""


def _log(client, workout_id, name):
    resp = client.post(
        f"/workouts/{workout_id}/sets",
        json={"exercise_name": name, "reps": 8, "weight": 60},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _by_name(client):
    return {e["name"]: e for e in client.get("/exercises").json()}


def test_listing_counts_the_sets_of_each_exercise(client):
    workout = client.post("/workouts", json={"date": "2026-07-20"}).json()
    _log(client, workout["id"], "Press banca")
    _log(client, workout["id"], "Press banca")
    _log(client, workout["id"], "Dominadas")

    listed = _by_name(client)

    assert listed["Press banca"]["set_count"] == 2
    assert listed["Dominadas"]["set_count"] == 1


def test_an_exercise_with_no_sets_counts_zero(client):
    """A LEFT JOIN's worth of care: an exercise created but never logged has to
    appear in the listing with 0, not drop out of it."""
    client.post("/exercises", json={"name": "Zancada"})

    assert _by_name(client)["Zancada"]["set_count"] == 0


def test_the_count_spans_every_workout(client):
    """The blast radius of a re-tag is the whole history, not today's session."""
    monday = client.post("/workouts", json={"date": "2026-07-20"}).json()
    friday = client.post("/workouts", json={"date": "2026-07-24"}).json()
    _log(client, monday["id"], "Sentadilla")
    _log(client, monday["id"], "Sentadilla")
    _log(client, friday["id"], "Sentadilla")

    assert _by_name(client)["Sentadilla"]["set_count"] == 3


def test_the_count_is_scoped_to_your_own_sets(unauthed_client):
    """Two users can hold exercises of the same name (uniqueness is per-user),
    so the count has to be reached through the exercise's own id rather than by
    name — otherwise Alice's confirmation quotes Bob's sets."""

    def register(username):
        resp = unauthed_client.post(
            "/auth/register", json={"username": username, "password": "s3cretpass"}
        )
        assert resp.status_code == 201, resp.text
        return {"Authorization": f"Bearer {resp.json()['access_token']}"}

    def log(headers, workout_id):
        resp = unauthed_client.post(
            f"/workouts/{workout_id}/sets",
            json={"exercise_name": "Sentadilla", "reps": 8, "weight": 60},
            headers=headers,
        )
        assert resp.status_code == 201, resp.text

    alice, bob = register("alice"), register("bob")
    hers = unauthed_client.post("/workouts", json={}, headers=alice).json()
    his = unauthed_client.post("/workouts", json={}, headers=bob).json()
    log(alice, hers["id"])
    log(bob, his["id"])
    log(bob, his["id"])

    counts = [
        unauthed_client.get("/exercises", headers=who).json()[0]["set_count"]
        for who in (alice, bob)
    ]

    assert counts == [1, 2]


def test_the_patch_that_re_tags_reports_the_count_it_moved(client):
    """The response to the re-tag carries the count too, so a client that acted
    on a stale listing still learns the real number."""
    workout = client.post("/workouts", json={"date": "2026-07-20"}).json()
    logged = _log(client, workout["id"], "Press banca")
    _log(client, workout["id"], "Press banca")
    exercise_id = logged["sets"][0]["exercise_id"]

    resp = client.patch(f"/exercises/{exercise_id}", json={"muscle_group": "Hombro"})

    assert resp.status_code == 200, resp.text
    assert resp.json()["set_count"] == 2


def test_a_merge_reports_the_sets_the_survivor_ends_up_with(client):
    workout = client.post("/workouts", json={"date": "2026-07-20"}).json()
    _log(client, workout["id"], "Fondo")
    _log(client, workout["id"], "Fondos")
    _log(client, workout["id"], "Fondos")
    listed = _by_name(client)

    resp = client.post(
        f"/exercises/{listed['Fondo']['id']}/merge",
        json={"into_id": listed["Fondos"]["id"]},
    )

    assert resp.status_code == 200, resp.text
    assert resp.json()["set_count"] == 3

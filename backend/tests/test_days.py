"""A day groups one or more workouts; workouts are created for a chosen date."""

import datetime


def test_workouts_on_the_same_date_group_into_one_day(client):
    w1 = client.post("/workouts", json={"date": "2026-07-10", "name": "Morning"})
    assert w1.status_code == 201, w1.text
    w2 = client.post("/workouts", json={"date": "2026-07-10", "name": "Evening"})
    assert w2.status_code == 201, w2.text
    client.post("/workouts", json={"date": "2026-07-12", "name": "Push"})

    resp = client.get("/days")

    assert resp.status_code == 200, resp.text
    days = resp.json()
    assert [d["date"] for d in days] == ["2026-07-12", "2026-07-10"]  # newest first
    jul10 = next(d for d in days if d["date"] == "2026-07-10")
    assert [w["name"] for w in jul10["workouts"]] == ["Morning", "Evening"]


def test_create_workout_defaults_to_today(client):
    resp = client.post("/workouts", json={"name": "Quick"})
    assert resp.status_code == 201, resp.text
    assert resp.json()["date"] == datetime.date.today().isoformat()

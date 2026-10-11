"""`read_plan_payload`: qué se cree de lo que el modelo leyó de un PDF."""

from app.plan_import import read_plan_payload


def test_days_and_meals_are_read_however_they_are_written():
    read = read_plan_payload(
        {
            "week": [
                {"day": "Miércoles", "slot": "Media mañana", "dish": "Fruta"},
                {"day": "SÁBADO", "slot": "Almuerzo", "dish": "Paella"},
            ]
        }
    )
    assert [(c.day, c.slot) for c in read.week] == [(2, "snack"), (5, "comida")]


def test_a_dish_repeated_in_the_week_is_one_dish():
    read = read_plan_payload(
        {
            "dishes": [{"name": "Avena", "ingredients": ["40 g avena"]}],
            "week": [
                {"day": "lunes", "slot": "desayuno", "dish": "avena"},
                {"day": "martes", "slot": "desayuno", "dish": "Avena"},
            ],
        }
    )
    assert [d.name for d in read.dishes] == ["Avena"]
    assert {c.dish for c in read.week} == {0}
    assert read.dishes[0].slots == ["desayuno"]


def test_two_dishes_in_one_slot_keep_the_first():
    read = read_plan_payload(
        {
            "week": [
                {"day": "lunes", "slot": "media mañana", "dish": "Fruta"},
                {"day": "lunes", "slot": "merienda", "dish": "Yogur"},
            ]
        }
    )
    assert len(read.week) == 1
    assert read.dishes[read.week[0].dish].name == "Fruta"


def test_what_cannot_be_placed_is_dropped_not_the_plan():
    read = read_plan_payload(
        {
            "dishes": [{"name": ""}, {"name": "Lentejas"}, "basura"],
            "week": [
                {"day": "el finde", "slot": "comida", "dish": "Lentejas"},
                {"day": "lunes", "slot": "comida", "dish": "Lentejas"},
            ],
        }
    )
    assert [d.name for d in read.dishes] == ["Lentejas"]
    assert len(read.week) == 1


def test_an_answer_of_another_shape_is_an_empty_plan():
    assert read_plan_payload(["no", "es", "un", "plan"]).dishes == []
    assert read_plan_payload(None).week == []

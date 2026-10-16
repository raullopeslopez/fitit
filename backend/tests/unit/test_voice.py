"""Lo que contesta el modelo no se da por bueno: `parse_heard` lo limpia."""

from app.voice import Heard, parse_heard


def test_una_respuesta_que_no_es_un_objeto_no_tiene_lineas():
    assert parse_heard(None) == ("", [])
    assert parse_heard(["huevo"]) == ("", [])


def test_una_linea_sin_nombre_no_es_una_linea():
    _, lines = parse_heard({"transcript": "eh", "lines": [{"text": "eh"}, "pan", {"name": "  "}]})
    assert lines == []


def test_un_numero_que_no_lo_es_queda_desconocido_y_no_en_cero():
    _, [line] = parse_heard(
        {"lines": [{"name": "huevo", "quantity": "dos", "unit_grams": -5, "portion_grams": True}]}
    )
    assert line == Heard(text="huevo", name="huevo")

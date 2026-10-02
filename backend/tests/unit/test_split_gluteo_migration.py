"""a7c2e9f41d36 separa Glúteo de Femoral.

El grupo vive en el ejercicio, así que todo hip thrust guardado hasta hoy dice
«Femoral» en la base de producción. La migración relee el nombre de cada fila
guardada como Femoral y mueve a Glúteo sólo las que son trabajo de glúteo; el
resto de la bisagra se queda donde estaba. Corre contra datos reales en el
deploy, así que se prueba directamente, igual que la partición de «Pierna».
"""

import importlib.util
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text

BACKEND = Path(__file__).resolve().parents[2]
SPLIT_GLUTEO = BACKEND / "alembic" / "versions" / "a7c2e9f41d36_split_gluteo_from_femoral.py"

SCHEMA = """
CREATE TABLE exercises (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name VARCHAR(120) NOT NULL,
    muscle_group VARCHAR(60),
    kind VARCHAR(16) NOT NULL DEFAULT 'strength'
);
"""

ROWS = [
    (1, "Hip thrust", "Femoral"),
    (2, "Patada de glúteo", "Femoral"),
    (3, "Puente de glúteo", "Femoral"),
    (4, "Rear Kick Máq", "Femoral"),
    # Un abductor sólo podía estar en Femoral porque lo etiquetó alguien a mano,
    # a falta de un sitio mejor. Ahora lo hay.
    (5, "Abductores en máquina", "Femoral"),
    (6, "Curl femoral tumbado", "Femoral"),  # se queda
    (7, "Peso muerto rumano", "Femoral"),  # se queda: la bisagra es Femoral
    (8, "Hiperextensiones", "Femoral"),  # se queda
    (9, "Aductores en máquina", "Femoral"),  # se queda: aductor ≠ abductor
    (10, "Aparato raro", "Femoral"),  # etiquetado a mano, nombre ilegible: se respeta
    # Fuera de Femoral no se toca nada, aunque el nombre diga glúteo: si alguien
    # lo puso en Cuádriceps, lo decidió él.
    (11, "Sentadilla para glúteo", "Cuádriceps"),
    (12, "Abductor", None),  # NULL es «que lo diga el clasificador»: se lee, no se escribe
    (13, "Press banca", "Pecho"),
]


def _load(path: Path, name: str):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _run(direction="upgrade"):
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text(SCHEMA))
        for id_, name, group in ROWS:
            conn.execute(
                text(
                    "INSERT INTO exercises (id, user_id, name, muscle_group, kind) "
                    "VALUES (:id, 1, :name, :group, 'strength')"
                ),
                {"id": id_, "name": name, "group": group},
            )
        context = MigrationContext.configure(conn)
        with Operations.context(context):
            module = _load(SPLIT_GLUTEO, "migration_split_gluteo_from_femoral")
            module.upgrade()
            if direction == "downgrade":
                module.downgrade()
        rows = conn.execute(text("SELECT id, muscle_group FROM exercises")).all()
    engine.dispose()
    return {row.id: row.muscle_group for row in rows}


@pytest.fixture(scope="module")
def migrated():
    return _run()


@pytest.fixture(scope="module")
def round_tripped():
    return _run("downgrade")


@pytest.mark.parametrize("exercise_id", [1, 2, 3, 4, 5])
def test_glute_work_moves_to_gluteo(migrated, exercise_id):
    assert migrated[exercise_id] == "Glúteo"


@pytest.mark.parametrize("exercise_id", [6, 7, 8, 9, 10])
def test_hamstring_and_hinge_work_stays_femoral(migrated, exercise_id):
    assert migrated[exercise_id] == "Femoral"


def test_other_groups_and_unset_rows_are_left_alone(migrated):
    assert migrated[11] == "Cuádriceps"
    assert migrated[12] is None
    assert migrated[13] == "Pecho"


def test_downgrade_folds_gluteo_back_into_femoral(round_tripped):
    assert [round_tripped[i] for i in range(1, 11)] == ["Femoral"] * 10
    assert round_tripped[11] == "Cuádriceps"
    assert round_tripped[12] is None


def test_the_migration_does_not_read_the_live_classifier():
    """Una migración que importa `classify` cambia de resultado cada vez que
    alguien toca las keywords, y deja de describir lo que hizo en su día. La
    de «Pierna» ya lo paga. Ésta congela su propia lista."""
    source = SPLIT_GLUTEO.read_text(encoding="utf-8")
    assert "app.muscles" not in source

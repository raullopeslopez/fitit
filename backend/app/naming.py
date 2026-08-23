import unicodedata


def normalize_exercise_name(name: str) -> str:
    """Collapse surrounding and repeated inner whitespace.

    This is the *display* name: it keeps the caller's casing and accents, so
    "Extensión de tríceps" is stored the way it was written. What counts as the
    same name is a separate question, answered by `fold_exercise_name`.
    """
    return " ".join(name.split())


def fold_exercise_name(name: str) -> str:
    """The key under which two spellings are the same exercise.

    Whitespace-collapsed, accent-stripped, lowercased — so "Extensión de
    tríceps", "extension de triceps" and " EXTENSION  DE TRICEPS " all fold to
    one key. The accent is the first thing that goes when a name is typed on a
    phone between two sets, and a name typed without it must not open a second
    row holding half the history.

    Deliberately identical to `fold()` in the frontend (frontend/src/format.js),
    which is what the client uses to decide a name is taken before it asks. Two
    different notions of "the same name" across the wire means the UI warns
    about collisions the server would accept, or fails to name one it rejects.

    Folded in Python rather than in SQL because there is no portable SQL for it:
    Postgres would need the `unaccent` extension, SQLite has no such thing, and
    even `lower()` disagrees between them — SQLite's only covers ASCII, so
    "BÚLGARA" and "búlgara" matched in production and not in the test suite.
    The comparison is over one user's exercise list, which is tens of rows.
    """
    decomposed = unicodedata.normalize("NFD", normalize_exercise_name(name))
    return "".join(c for c in decomposed if not unicodedata.combining(c)).lower()

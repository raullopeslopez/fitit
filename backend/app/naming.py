def normalize_exercise_name(name: str) -> str:
    """Collapse surrounding and repeated inner whitespace.

    The display name keeps the caller's casing; callers match case-insensitively
    (via ``func.lower``) so "Bench Press", "bench press" and " Bench  Press " all
    resolve to the same exercise.
    """
    return " ".join(name.split())

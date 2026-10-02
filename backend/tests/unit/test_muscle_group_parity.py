"""The muscle groups live in four places. Nothing made them agree.

`MUSCLE_GROUPS` is declared in `backend/app/muscles.py` and again in
`frontend/src/muscles.js`; each group needs a `--m-<slug>` colour token in
`frontend/src/styles.css`, once for light and once for dark; and `BANDS` in
`volume.js` needs a row per group. Only the last pair was tied together
(`volume.test.js` checks `BANDS` against the frontend list), and `volume.js`
can only check the copy it imports — so a tenth group added in Python alone
would pass every suite in the repo and reach the screen in `--muted` grey,
which is what `muscleColor()` returns for a name it does not know.

This is the backend's copy of that check *because* the backend suite is the CI
merge gate: it runs whichever layer the commit touched. Reading two frontend
files as text from Python is the price of that, and it is cheap — the shapes
being parsed are a string array and a list of custom properties.
"""

import re
from pathlib import Path

import pytest

from app.muscles import MUSCLE_GROUPS

FRONTEND = Path(__file__).resolve().parents[3] / "frontend" / "src"
MUSCLES_JS = FRONTEND / "muscles.js"
STYLES_CSS = FRONTEND / "styles.css"


def _js_array(source: str, name: str) -> list[str]:
    """The string entries of `export const <name> = [ ... ]`."""
    match = re.search(rf"export const {name} = \[(.*?)\]", source, re.S)
    assert match, f"{name} not found in muscles.js — did the declaration move?"
    return re.findall(r"'([^']+)'", match.group(1))


def _js_slug_map(source: str) -> dict[str, str]:
    match = re.search(r"const SLUG = \{(.*?)\n\}", source, re.S)
    assert match, "SLUG map not found in muscles.js"
    return dict(re.findall(r"([^\s:{,]+):\s*'([^']+)'", match.group(1)))


@pytest.fixture(scope="module")
def js() -> str:
    return MUSCLES_JS.read_text(encoding="utf-8")


@pytest.fixture(scope="module")
def css() -> str:
    return STYLES_CSS.read_text(encoding="utf-8")


def test_the_two_lists_are_the_same_list(js):
    """Same groups, same order. Order is not incidental: it is the sequence the
    chips and the heatmap rows render in, and the adjacent-pair sequence the
    colourblind validation was run against (DESIGN.md)."""
    assert _js_array(js, "MUSCLE_GROUPS") == MUSCLE_GROUPS


def test_every_group_has_a_slug(js):
    slugs = _js_slug_map(js)
    assert sorted(slugs) == sorted(MUSCLE_GROUPS)


def test_every_slug_has_a_colour_in_both_modes(js, css):
    """`styles.css` declares the tokens twice — once on `:root` for light, once
    inside the dark-mode block. A group with only one of the two renders grey
    in the other theme, which reads as "ungrouped" rather than as a bug."""
    slugs = _js_slug_map(js)
    for group in MUSCLE_GROUPS:
        token = f"--m-{slugs[group]}:"
        assert css.count(token) == 2, (
            f"{group} has {css.count(token)} declarations of {token}, expected 2 "
            "(one light, one dark)"
        )


def test_no_orphan_colour_tokens(js, css):
    """The other direction: a `--m-*` left behind by a group that was renamed or
    removed. "Pierna" outliving the leg split is the case this would have
    caught."""
    declared = {m.group(1) for m in re.finditer(r"--m-([a-z]+):", css)}
    assert declared == set(_js_slug_map(js).values())


def test_the_sentinel_is_not_a_real_group(js):
    """`UNGROUPED` doubles as the selected-filter value on the Progreso chip
    row, which is only safe while no exercise can hold it as an actual group.
    The backend enforces that (`_reject_unknown_group`); this pins the other
    half — that the sentinel never gets added to the canonical list by
    accident."""
    (sentinel,) = re.findall(r"export const UNGROUPED = '([^']+)'", js)
    assert sentinel not in MUSCLE_GROUPS

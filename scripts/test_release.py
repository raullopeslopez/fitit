"""`release.py`, sin git: las cuentas de versión y las ediciones de texto.

    cd backend && uv run python -m pytest ../scripts/test_release.py
"""

import json

import pytest

from release import add_changelog, bump_gradle, bump_lock, bump_package, next_version


@pytest.mark.parametrize(
    ("bump", "expected"),
    [("patch", "0.36.1"), ("minor", "0.37.0"), ("major", "1.0.0"), ("0.40.0", "0.40.0")],
)
def test_la_siguiente_version(bump, expected):
    assert next_version("0.36.0", bump) == expected


@pytest.mark.parametrize("bump", ["0.36.0", "0.35.9", "v0.37", "grande"])
def test_una_version_que_no_sube_se_rechaza(bump):
    with pytest.raises(ValueError):
        next_version("0.36.0", bump)


def test_el_lock_cambia_sus_dos_raices_y_no_una_dependencia_que_coincida():
    lock = {
        "name": "frontend",
        "version": "0.36.0",
        "packages": {
            "": {"name": "frontend", "version": "0.36.0"},
            "node_modules/x": {"version": "0.36.0", "dev": True},
        },
    }
    out = json.loads(bump_lock(json.dumps(lock, indent=2), "0.36.0", "0.37.0"))
    assert out["version"] == "0.37.0"
    assert out["packages"][""]["version"] == "0.37.0"
    assert out["packages"]["node_modules/x"]["version"] == "0.36.0"


def test_gradle_sube_el_codigo_en_uno():
    text = '        versionCode 53\n        versionName "0.36.0"\n'
    out, code = bump_gradle(text, "0.36.0", "0.37.0")
    assert code == 54
    assert out == '        versionCode 54\n        versionName "0.37.0"\n'


def test_package_json():
    assert bump_package('  "version": "0.36.0",\n', "0.36.0", "0.37.0") == '  "version": "0.37.0",\n'


def test_el_changelog_gana_la_linea_arriba_del_todo():
    text = "## [Unreleased]\n\n### Changed\n- **APK 0.36.0: lo de antes.**\n"
    out = add_changelog(text, "0.37.0", "medidas caseras")
    assert out == (
        "## [Unreleased]\n\n### Changed\n- **APK 0.37.0: medidas caseras.**\n"
        "- **APK 0.36.0: lo de antes.**\n"
    )


def test_un_gradle_que_no_lleva_la_version_actual_para_en_seco():
    with pytest.raises(ValueError):
        bump_gradle('versionCode 53\nversionName "0.35.0"\n', "0.36.0", "0.37.0")

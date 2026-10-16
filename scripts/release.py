"""Saca una versión de la APK: sube el número, apunta el CHANGELOG y abre el PR.

    python scripts/release.py minor "medidas caseras"
    python scripts/release.py 0.38.0 "medidas caseras" --dry-run

Al fusionar el PR, `.github/workflows/android.yml` ve una versión que aún no tiene
Release y publica la APK sola. Esto sólo prepara ese PR, igual que se hacía a mano:

1. Rama `apk-<versión>` desde `origin/main` recién traído (nunca desde la rama en la
   que estés: lo que no esté en main no va en la APK).
2. La versión en los cuatro sitios que la llevan: `frontend/package.json`, las dos
   entradas raíz de `frontend/package-lock.json`, y `versionName` + `versionCode`
   (+1) en `frontend/android/app/build.gradle`.
3. Una línea `- **APK <versión>: <título>.**` arriba de `### Changed` en el
   CHANGELOG. El texto que la explica lo escribes tú: un script no sabe qué cambió
   para quien usa la app.
4. Commit `APK <versión>: <título>` con `SKIP_TESTS=1` (sólo cambian números y el
   CHANGELOG: la suite no tiene nada que decir), push y `gh pr create`.

Con `--dry-run` calcula y enseña los cambios sin tocar git ni ficheros.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "frontend" / "package.json"
LOCK = ROOT / "frontend" / "package-lock.json"
GRADLE = ROOT / "frontend" / "android" / "app" / "build.gradle"
CHANGELOG = ROOT / "CHANGELOG.md"

SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)$")
CHANGED = "## [Unreleased]\n\n### Changed\n"


# --- Lo puro: texto entra, texto sale -----------------------------------------


def next_version(current: str, bump: str) -> str:
    """`major`, `minor`, `patch` o una versión exacta, que tiene que ser mayor."""
    major, minor, patch = (int(n) for n in SEMVER.match(current).groups())
    if bump == "major":
        return f"{major + 1}.0.0"
    if bump == "minor":
        return f"{major}.{minor + 1}.0"
    if bump == "patch":
        return f"{major}.{minor}.{patch + 1}"
    match = SEMVER.match(bump)
    if not match:
        raise ValueError(f"«{bump}» no es major, minor, patch ni una versión X.Y.Z")
    if tuple(int(n) for n in match.groups()) <= (major, minor, patch):
        raise ValueError(f"{bump} no es mayor que la actual, {current}")
    return bump


def bump_package(text: str, old: str, new: str) -> str:
    return _replace_once(text, f'"version": "{old}",', f'"version": "{new}",', "package.json")


def bump_lock(text: str, old: str, new: str) -> str:
    """Las dos entradas raíz (la del fichero y `packages[""]`), que son las dos
    primeras. Más abajo hay dependencias que pueden ir por la misma versión por
    casualidad, y ésas no son nuestras."""
    needle = f'"version": "{old}"'
    if text.count(needle) < 2:
        raise ValueError(f"package-lock.json no lleva dos veces {old}")
    out = text.replace(needle, f'"version": "{new}"', 2)
    data = json.loads(out)
    assert data["version"] == new and data["packages"][""]["version"] == new
    return out


def bump_gradle(text: str, old: str, new: str) -> tuple[str, int]:
    """`versionName` a la nueva y `versionCode` uno más: Android no instala encima
    un código que no sea mayor que el que ya tienes."""
    code = re.search(r"versionCode (\d+)", text)
    if not code:
        raise ValueError("build.gradle no tiene versionCode")
    new_code = int(code.group(1)) + 1
    text = _replace_once(text, f"versionCode {code.group(1)}", f"versionCode {new_code}", "build.gradle")
    text = _replace_once(text, f'versionName "{old}"', f'versionName "{new}"', "build.gradle")
    return text, new_code


def add_changelog(text: str, version: str, title: str) -> str:
    return _replace_once(text, CHANGED, f"{CHANGED}- **APK {version}: {title}.**\n", "CHANGELOG.md")


def _replace_once(text: str, old: str, new: str, where: str) -> str:
    if text.count(old) != 1:
        raise ValueError(f"{where}: esperaba «{old.strip()}» una vez, está {text.count(old)}")
    return text.replace(old, new)


# --- Lo que toca el disco y git ---------------------------------------------------


def _git(*args: str, env: dict | None = None) -> str:
    return subprocess.run(
        ["git", *args], cwd=ROOT, check=True, capture_output=True, text=True, env=env
    ).stdout.strip()


def _read(path: Path) -> str:
    # Con `\n` dentro, sea cual sea el fichero: en Windows el checkout lleva CRLF
    # y las búsquedas de arriba se escriben con `\n`.
    return path.read_text(encoding="utf-8")


def _write(path: Path, text: str) -> None:
    # Y de vuelta con los finales que tenía, para que el diff sean sólo los números.
    eol = "\r\n" if b"\r\n" in path.read_bytes() else "\n"
    with path.open("w", encoding="utf-8", newline=eol) as f:
        f.write(text)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    parser.add_argument("bump", help="major | minor | patch | X.Y.Z")
    parser.add_argument("title", help="de qué va, en pocas palabras: «medidas caseras»")
    parser.add_argument("--dry-run", action="store_true", help="enseña los cambios y no toca nada")
    args = parser.parse_args(argv)
    # La consola de Windows no es UTF-8 por defecto, y «→» la tumbaría.
    sys.stdout.reconfigure(encoding="utf-8")

    current = json.loads(_read(PACKAGE))["version"]
    version = next_version(current, args.bump)
    title = args.title.strip().rstrip(".")
    branch = f"apk-{version}"

    if not args.dry_run:
        if _git("status", "--porcelain"):
            print("Hay cambios sin commitear: guárdalos o descártalos antes.", file=sys.stderr)
            return 1
        _git("fetch", "origin")
        # La versión de main, no la de la rama en la que estuvieras.
        current = json.loads(_git("show", "origin/main:frontend/package.json"))["version"]
        version = next_version(current, args.bump)
        branch = f"apk-{version}"
        _git("switch", "-c", branch, "origin/main")

    gradle, code = bump_gradle(_read(GRADLE), current, version)
    changes = {
        PACKAGE: bump_package(_read(PACKAGE), current, version),
        LOCK: bump_lock(_read(LOCK), current, version),
        GRADLE: gradle,
        CHANGELOG: add_changelog(_read(CHANGELOG), version, title),
    }

    print(f"{current} → {version} (versionCode {code}), rama {branch}")
    if args.dry_run:
        print(f"CHANGELOG: - **APK {version}: {title}.**")
        print("--dry-run: no se ha tocado nada.")
        return 0

    for path, text in changes.items():
        _write(path, text)
    _git("add", *(str(p.relative_to(ROOT)) for p in changes))
    _git("commit", "-m", f"APK {version}: {title}", env={**os.environ, "SKIP_TESTS": "1"})
    _git("push", "-u", "origin", branch)
    body = (
        f"Sube la versión a {version} (versionCode {code}) para que `android.yml` "
        "publique la APK al fusionar.\n\nFalta el texto del CHANGELOG: qué cambia para "
        "quien usa la app, con los PRs que recoge."
    )
    pr = subprocess.run(
        ["gh", "pr", "create", "--base", "main", "--head", branch,
         "--title", f"APK {version}: {title}", "--body", body],
        cwd=ROOT, check=True, capture_output=True, text=True,
    ).stdout.strip()
    print(pr)
    print("Escribe en el CHANGELOG qué cambia, commitea y fusiona: la APK sale sola.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

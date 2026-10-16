# Comandos del proyecto. `just` sin nada los lista.
#
# En Windows corre sobre Git Bash, como el resto de scripts del repo.

set windows-shell := ["bash", "-cu"]

default:
    @just --list

# Las reglas son las de `[tool.ruff]` en backend/pyproject.toml: lo mismo que pasan
# el hook de pre-commit y CI, así que verde aquí es verde allí.
#   just lint                 # todo el backend
#   just lint app/nutrition.py
#
# Pasa ruff por el backend
lint *args=".":
    cd backend && uv run ruff check {{args}}

# Pasa ruff por el backend y arregla lo que sabe arreglar solo
lint-fix *args=".":
    cd backend && uv run ruff check --fix {{args}}

# `bump` es major, minor, patch o una versión exacta. Al fusionar el PR, la APK sale sola.
#   just release minor "medidas caseras"
#   just release 0.38.0 "medidas caseras" --dry-run
#
# Saca una versión de la APK: sube el número, apunta el CHANGELOG y abre el PR
release bump title *flags:
    python scripts/release.py {{bump}} "{{title}}" {{flags}}

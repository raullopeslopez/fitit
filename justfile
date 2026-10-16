# Comandos del proyecto. `just` sin nada los lista.
#
# En Windows corre sobre Git Bash, como el resto de scripts del repo.

set windows-shell := ["bash", "-cu"]

default:
    @just --list

# `bump` es major, minor, patch o una versión exacta. Al fusionar el PR, la APK sale sola.
#   just release minor "medidas caseras"
#   just release 0.38.0 "medidas caseras" --dry-run
#
# Saca una versión de la APK: sube el número, apunta el CHANGELOG y abre el PR
release bump title *flags:
    python scripts/release.py {{bump}} "{{title}}" {{flags}}

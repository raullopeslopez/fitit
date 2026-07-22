from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from .main import app as api_app

# Production entrypoint: one service serving both halves.
#   /api/*  -> the FastAPI app (the frontend calls /api/...)
#   /*      -> the built React app (static files)
web = FastAPI(title="Fitit")

web.mount("/api", api_app)

_STATIC_DIR = Path(__file__).resolve().parent.parent / "static"
if _STATIC_DIR.is_dir():  # pragma: no cover - only present once the frontend is built
    web.mount("/", StaticFiles(directory=_STATIC_DIR, html=True), name="spa")

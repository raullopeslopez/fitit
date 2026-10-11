import logging
import sys

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .auth import get_current_user
from .config import settings
from .routers import (
    auth,
    body_weight,
    days,
    dishes,
    exercises,
    food_log,
    foods,
    ideas,
    plan_import,
    plans,
    rules,
    steps,
    targets,
    workouts,
)


def _configure_logging() -> None:
    """Que lo que escribimos salga por donde Render lo recoge.

    Sin esto no salía nada. Un logger sin handler descarta todo lo que esté por
    debajo de `WARNING` —el `lastResort` de Python empieza ahí— y uvicorn
    configura sus propios loggers, no el raíz: así que cada `log.info` de la
    aplicación se tiraba en silencio. En los logs de producción aparecía la
    línea de acceso de uvicorn y ninguna de las nuestras.

    Y no lo veía ninguna prueba, porque `caplog` engancha su propio handler:
    comprobaban que la llamada se hace, no que la línea aparezca.

    A `stdout` y no a `stderr` porque no son errores; con el mismo prefijo que
    usa uvicorn, para que las dos clases de línea se lean como una sola columna.
    `propagate = False` para no duplicarlas si alguien configura el raíz.
    """
    logger = logging.getLogger("app")
    if logger.handlers:
        return
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(logging.Formatter("INFO:     %(message)s"))
    logger.addHandler(handler)
    logger.setLevel(logging.INFO)
    logger.propagate = False


_configure_logging()

app = FastAPI(title="Fitit API", version="0.1.0")


UPGRADE_REQUIRED_DETAIL = "Hay una versión nueva de Fitit. Actualiza la app para seguir."


def _parse_version(raw: str) -> tuple[int, ...] | None:
    """`"0.10.0"` → `(0, 10, 0)`, comparable componente a componente.

    Cualquier cosa que no sean enteros separados por puntos es `None`: no es
    una versión, y lo que no se entiende no se corta.
    """
    parts = raw.strip().split(".")
    if not all(p.isdigit() for p in parts):
        return None
    return tuple(int(p) for p in parts)


def _is_outdated(client_version: str | None) -> bool:
    minimum = _parse_version(settings.min_client_version) if settings.min_client_version else None
    if minimum is None or client_version is None:
        return False
    current = _parse_version(client_version)
    if current is None:
        return False
    # Rellenar con ceros para que "1.0" y "1.0.0" sean la misma versión.
    width = max(len(current), len(minimum))
    return current + (0,) * (width - len(current)) < minimum + (0,) * (width - len(minimum))


@app.middleware("http")
async def client_version_gate(request: Request, call_next):
    """Una app instalada no se actualiza al desplegar: si es más vieja que la
    mínima, se le pide que se actualice (426) en vez de dejar que se rompa.

    Ni el health check ni la pregunta previa de CORS pasan por aquí.
    """
    path = request.url.path.removeprefix(request.scope.get("root_path", ""))
    if (
        request.method != "OPTIONS"
        and path != "/health"
        and _is_outdated(request.headers.get("x-client-version"))
    ):
        return JSONResponse(status_code=426, content={"detail": UPGRADE_REQUIRED_DETAIL})
    return await call_next(request)


# Después del corte para que quede por fuera: un 426 también lleva las
# cabeceras CORS, o la app nativa no podría leer el mensaje.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=False,  # token en `Authorization`, sin cookies
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Client-Version"],
)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# /health and /auth are public; everything else requires a valid token.
app.include_router(auth.router)
app.include_router(days.router, dependencies=[Depends(get_current_user)])
app.include_router(workouts.router, dependencies=[Depends(get_current_user)])
app.include_router(exercises.router, dependencies=[Depends(get_current_user)])
app.include_router(foods.router, dependencies=[Depends(get_current_user)])
app.include_router(food_log.router, dependencies=[Depends(get_current_user)])
app.include_router(body_weight.router, dependencies=[Depends(get_current_user)])
app.include_router(steps.router, dependencies=[Depends(get_current_user)])
app.include_router(dishes.router, dependencies=[Depends(get_current_user)])
app.include_router(targets.router, dependencies=[Depends(get_current_user)])
app.include_router(rules.router, dependencies=[Depends(get_current_user)])
app.include_router(plans.router, dependencies=[Depends(get_current_user)])
app.include_router(plan_import.router, dependencies=[Depends(get_current_user)])
app.include_router(ideas.router, dependencies=[Depends(get_current_user)])

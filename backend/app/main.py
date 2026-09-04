import logging
import sys

from fastapi import Depends, FastAPI

from .auth import get_current_user
from .routers import auth, days, exercises, food_log, foods, workouts


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

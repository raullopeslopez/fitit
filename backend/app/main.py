from fastapi import Depends, FastAPI

from .auth import get_current_user
from .routers import auth, exercises, workouts

app = FastAPI(title="Fitit API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


# /health and /auth are public; everything else requires a valid token.
app.include_router(auth.router)
app.include_router(workouts.router, dependencies=[Depends(get_current_user)])
app.include_router(exercises.router, dependencies=[Depends(get_current_user)])

from fastapi import FastAPI

from .routers import exercises, workouts

app = FastAPI(title="Fitit API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(workouts.router)
app.include_router(exercises.router)

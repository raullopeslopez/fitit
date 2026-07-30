# Backend image — FastAPI on uv.
FROM python:3.12-slim

# uv binary from the official distroless image.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

# Install deps first (cached layer). Lockfile keeps builds reproducible.
# Includes the dev group (pytest, debugpy) — this image is local-dev only,
# never what Render deploys (that's the root Dockerfile, --no-dev).
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen

# App code.
COPY . .

EXPOSE 8000
CMD ["uv", "run", "--no-dev", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

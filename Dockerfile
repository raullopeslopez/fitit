# Production image: build the React app, then serve it + the API from FastAPI.

# --- build the React app ---
FROM node:24-alpine AS frontend
WORKDIR /fe
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# Vite inlines VITE_* at build time, not at boot, so this has to cross into the
# build stage explicitly: Render passes its env vars as docker build args, but
# a build arg no `ARG` line declares is invisible inside `RUN`. Without these
# two lines the variable can be set correctly in the dashboard and the Google
# button still never appears — a misconfiguration with no error anywhere.
ARG VITE_GOOGLE_CLIENT_ID=""
ENV VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID
RUN npm run build

# --- backend + serve everything ---
FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/.venv/bin:$PATH"

# Backend deps (cached layer).
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

# Backend code + the built frontend (served by app/web.py from ./static).
COPY backend/ ./
COPY --from=frontend /fe/dist ./static

EXPOSE 8000
# Migrate then serve. alembic upgrade head is idempotent (no-op when up to date),
# so it's safe to run on every start (free plan can't use a pre-deploy command).
CMD ["sh", "-c", "alembic upgrade head && uvicorn app.web:web --host 0.0.0.0 --port ${PORT:-8000}"]

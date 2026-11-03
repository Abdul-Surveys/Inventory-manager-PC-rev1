# Backend image - FastAPI application served by uvicorn.
# Build context is the repository root (see docker-compose.yml).
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# curl is used by the container healthcheck. No build toolchain needed because
# all Python dependencies ship as prebuilt wheels.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl \
 && rm -rf /var/lib/apt/lists/*

COPY deploy/backend-requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

# Application code (the .env file is excluded via .dockerignore; configuration
# is injected by docker-compose instead).
COPY backend/ ./
# The development-only requirements file is not needed inside the image.
RUN rm -f requirements.txt backend_test* 2>/dev/null || true

EXPOSE 8001

# 2 workers suit a small planning team; adjust in compose for larger loads.
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "2"]

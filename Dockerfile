FROM node:20-alpine AS frontend-build
WORKDIR /build/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ .
RUN npm run build

FROM python:3.11-slim AS runtime

ARG VERSION=dev
ARG BUILD_DATE=unknown
ARG VCS_REF=unknown

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    DATA_DIR=/app/data \
    LDDC_REPO_PATH=/app/3rdparty/LDDC \
    HOST=0.0.0.0 \
    PORT=8000

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libmagic1 \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

COPY backend/ ./
COPY 3rdparty/LDDC ./3rdparty/LDDC
COPY --from=frontend-build /build/frontend/dist ./static

RUN mkdir -p /app/licenses \
    && cp ./3rdparty/LDDC/LICENSE /app/licenses/LDDC-GPL-3.0.txt

RUN useradd --create-home --uid 10001 appuser \
    && mkdir -p /app/data \
    && chown -R appuser:appuser /app

USER appuser

LABEL org.opencontainers.image.title="muze" \
      org.opencontainers.image.description="Muze backend and bundled frontend assets" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.created="${BUILD_DATE}" \
      org.opencontainers.image.revision="${VCS_REF}" \
      org.opencontainers.image.licenses="GPL-3.0"

VOLUME ["/app/data", "/music"]
EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

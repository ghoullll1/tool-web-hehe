# syntax=docker/dockerfile:1.7
FROM python:3.13-slim-bookworm AS build

ARG INSTALL_MARKITDOWN=false
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1
WORKDIR /build
COPY pyproject.toml README.md ./
COPY src ./src
RUN if [ "$INSTALL_MARKITDOWN" = "true" ]; then \
         python -m pip wheel --wheel-dir /wheels '.[markitdown]'; \
       else \
         python -m pip wheel --wheel-dir /wheels .; \
       fi

FROM python:3.13-slim-bookworm

ARG INSTALL_MARKITDOWN=false
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    MARKITDOWN_WORKER_ENVIRONMENT=production \
    MARKITDOWN_WORKER_TEMP_DIRECTORY=/run/markitdown-worker
RUN groupadd --system --gid 10001 appuser \
    && useradd --system --uid 10001 --gid appuser --no-create-home appuser \
    && install -d -o appuser -g appuser -m 0700 /run/markitdown-worker
COPY --from=build /wheels /wheels
RUN if [ "$INSTALL_MARKITDOWN" = "true" ]; then \
      python -m pip install --no-index --find-links=/wheels 'tool-web-markitdown-worker[markitdown]'; \
    else \
      python -m pip install --no-index --find-links=/wheels tool-web-markitdown-worker; \
    fi \
    && rm -rf /wheels
USER 10001:10001
EXPOSE 8091
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8091/health/ready', timeout=3)"]
ENTRYPOINT ["uvicorn", "markitdown_worker.main:app", "--host", "0.0.0.0", "--port", "8091", "--workers", "1", "--no-server-header"]

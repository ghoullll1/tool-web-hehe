# MarkItDown Worker

`markitdown-worker` is an internal FastAPI service used by the Tool Web Java backend. It accepts a bounded binary document stream, invokes Microsoft MarkItDown through a narrow adapter, and returns structured Markdown JSON.

The worker is intentionally not a public upload API. Keep it on loopback or a private container network and let the Java backend own public authentication, job state, rate limiting, storage, and retention.

## Current dependency state

MarkItDown is declared as the optional `markitdown` extra but is **not installed by the base project installation or the default Docker build**. Without it:

- `GET /health/live` returns `200` because the web process is alive.
- `GET /health/ready` returns `503` and explains that MarkItDown is missing.
- `POST /internal/v1/conversions` returns a structured `503 converter_dependency_unavailable` response.
- API tests use an injected fake engine and do not need MarkItDown.

## API contract

### Convert a document

```http
POST /internal/v1/conversions
Authorization: Bearer <internal-token>
Content-Type: application/octet-stream
X-Request-Id: <trace-id>
X-File-Extension: .docx
X-File-Name-B64: 5rWL6K-VLmRvY3g

<raw file bytes>
```

`X-File-Name-B64` is optional URL-safe Base64 without required padding. It transports UTF-8 names without unsafe header encoding. `X-File-Extension` is required and must be in the deployment allowlist.

Successful response:

```json
{
  "schemaVersion": "1.0",
  "requestId": "8a3e17ca-fdb1-42ee-81c3-9f4548ea5806",
  "title": "Example",
  "markdown": "# Example\n",
  "source": {
    "filename": "示例.docx",
    "extension": ".docx",
    "contentType": "application/octet-stream",
    "sizeBytes": 8192
  },
  "engine": "markitdown",
  "engineVersion": "0.1.7",
  "metrics": {
    "durationMs": 327,
    "markdownCharacters": 10
  },
  "warnings": []
}
```

Other endpoints:

- `GET /health/live` — process liveness; no authentication.
- `GET /health/ready` — converter readiness; no authentication.
- `GET /internal/v1/capabilities` — installed version, format allowlist, and limits; internal authentication applies.

All errors use `{"error":{"code","message","requestId","details"}}`. The response always carries `X-Request-Id`.

## Local setup and tests (without MarkItDown)

Linux/macOS:

```bash
cd markitdown-worker
python3.13 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -e '.[dev]'
pytest
ruff check .
mypy
uvicorn markitdown_worker.main:app --host 127.0.0.1 --port 8091
```

PowerShell:

```powershell
Set-Location markitdown-worker
py -3.13 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -e ".[dev]"
pytest
ruff check .
mypy
uvicorn markitdown_worker.main:app --host 127.0.0.1 --port 8091
```

Before MarkItDown is installed, verify the intentional dependency state:

```bash
curl -i http://127.0.0.1:8091/health/live
curl -i http://127.0.0.1:8091/health/ready
```

## Install MarkItDown later

Inside the worker virtual environment:

```bash
python -m pip install -e '.[markitdown]'
python -m pip check
```

For development plus conversion and test tooling:

```bash
python -m pip install -e '.[dev,markitdown]'
```

Restart Uvicorn after installation. `/health/ready` must then return `200` and report the installed engine version.

Test a real file:

```bash
TOKEN='replace-with-the-worker-token'
NAME_B64=$(printf '%s' 'example.docx' | base64 | tr '+/' '-_' | tr -d '=\n')
curl --fail-with-body \
  -H "Authorization: Bearer ${TOKEN}" \
  -H 'Content-Type: application/octet-stream' \
  -H 'X-File-Extension: .docx' \
  -H "X-File-Name-B64: ${NAME_B64}" \
  --data-binary @example.docx \
  http://127.0.0.1:8091/internal/v1/conversions
```

## Docker packaging

The default image deliberately excludes MarkItDown and is useful only for testing the dependency-unavailable path:

```bash
docker build -t tool-web/markitdown-worker:base .
```

Build the deployable converter image later:

```bash
docker build \
  --build-arg INSTALL_MARKITDOWN=true \
  -t tool-web/markitdown-worker:0.1.0 .
docker run --rm \
  --name markitdown-worker \
  -p 127.0.0.1:8091:8091 \
  -e MARKITDOWN_WORKER_API_TOKEN='replace-with-at-least-32-random-characters' \
  tool-web/markitdown-worker:0.1.0
```

Do not publish port 8091 to the Internet. In Docker Compose, use `expose`, a private/internal network, and call `http://markitdown-worker:8091` from the Java backend.

## Deployment

The repository's central `../deploy/compose.yml` builds this image with
`INSTALL_MARKITDOWN=true`, keeps port 8091 on the private Compose network, and
injects the same random internal token into this worker and the Java backend.
Follow `../deploy/DEPLOYMENT.en.md` or `../deploy/DEPLOYMENT.zh-CN.md` for the
complete stack procedure.

## Operational notes

- Input defaults to 10 MiB and is rejected both from `Content-Length` and while streaming.
- Source bytes are stored under a random temporary name with mode `0600` and are removed in a `finally` block.
- MarkItDown plugins are disabled and the API accepts neither URLs nor server filesystem paths.
- Conversion concurrency, queue wait, conversion time, output characters, and extensions are deployment-owned environment settings.
- Every MarkItDown call runs in a disposable child process. The parent forcibly stops it at the configured conversion timeout before deleting the temporary source file.
- Run one Uvicorn worker per service instance so the advertised concurrency limit is accurate; scale with multiple isolated service/container replicas if necessary.
- The child process receives a minimal environment that excludes the internal API token and other unrelated service secrets.
- Do not log document names, document bytes, Markdown output, or authorization tokens.

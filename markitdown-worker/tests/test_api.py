from __future__ import annotations

import asyncio
import base64
from collections.abc import AsyncIterator
from pathlib import Path

import httpx
import pytest
from fastapi import FastAPI

from markitdown_worker.api import create_app
from markitdown_worker.config import Settings
from markitdown_worker.errors import EngineConversionError
from markitdown_worker.models import EngineAvailability, EngineResult


class FakeEngine:
    def __init__(self, result: EngineResult | None = None) -> None:
        self.result = result or EngineResult(markdown="# Converted\n", title="Converted")
        self.seen_bytes: bytes | None = None
        self.seen_extension: str | None = None
        self.seen_path: Path | None = None

    def availability(self) -> EngineAvailability:
        return EngineAvailability(installed=True, name="fake", version="1.2.3")

    def convert_file(self, source_path: Path, file_extension: str) -> EngineResult:
        self.seen_path = source_path
        self.seen_bytes = source_path.read_bytes()
        self.seen_extension = file_extension
        return self.result


class UnavailableEngine:
    def availability(self) -> EngineAvailability:
        return EngineAvailability(
            installed=False,
            name="markitdown",
            reason="The optional MarkItDown dependency is not installed.",
        )

    def convert_file(self, source_path: Path, file_extension: str) -> EngineResult:
        raise AssertionError("Unavailable engine must not receive a document")


class FailingEngine(FakeEngine):
    def convert_file(self, source_path: Path, file_extension: str) -> EngineResult:
        self.seen_path = source_path
        raise EngineConversionError("Unsupported document structure")


def settings(temp_directory: Path, **overrides: object) -> Settings:
    values: dict[str, object] = {
        "environment": "test",
        "api_token": "a" * 32,
        "max_upload_bytes": 1024,
        "max_output_characters": 2048,
        "max_concurrent_conversions": 1,
        "queue_timeout_seconds": 1,
        "conversion_timeout_seconds": 2,
        "temp_directory": temp_directory,
        "allowed_extensions": (".docx", ".pdf", ".txt"),
    }
    values.update(overrides)
    return Settings(**values)  # type: ignore[arg-type]


def auth_headers(**additional: str) -> dict[str, str]:
    return {
        "Authorization": f"Bearer {'a' * 32}",
        "Content-Type": "application/octet-stream",
        "X-File-Extension": ".docx",
        **additional,
    }


def encode_filename(filename: str) -> str:
    return base64.urlsafe_b64encode(filename.encode()).decode().rstrip("=")


def api_client(app: FastAPI) -> httpx.AsyncClient:
    transport = httpx.ASGITransport(app=app)
    return httpx.AsyncClient(transport=transport, base_url="http://testserver")


@pytest.mark.asyncio
async def test_health_distinguishes_liveness_from_missing_engine(tmp_path: Path) -> None:
    app = create_app(settings=settings(tmp_path), engine=UnavailableEngine())
    async with api_client(app) as client:
        live = await client.get("/health/live")
        ready = await client.get("/health/ready")

    assert live.status_code == 200
    assert live.json()["status"] == "UP"
    assert ready.status_code == 503
    assert ready.json()["status"] == "DOWN"
    assert ready.json()["engine"] == "markitdown"


@pytest.mark.asyncio
async def test_capabilities_require_the_internal_token(tmp_path: Path) -> None:
    app = create_app(settings=settings(tmp_path), engine=FakeEngine())
    async with api_client(app) as client:
        denied = await client.get("/internal/v1/capabilities")
        allowed = await client.get(
            "/internal/v1/capabilities",
            headers={"Authorization": f"Bearer {'a' * 32}"},
        )

    assert denied.status_code == 401
    assert denied.headers["www-authenticate"] == "Bearer"
    assert allowed.status_code == 200
    assert allowed.json()["engineInstalled"] is True
    assert allowed.json()["limits"]["maxUploadBytes"] == 1024


@pytest.mark.asyncio
async def test_conversion_streams_to_a_temporary_file_and_removes_it(tmp_path: Path) -> None:
    engine = FakeEngine()
    headers = auth_headers(
        **{
            "X-File-Name-B64": encode_filename("示例.docx"),
            "X-Request-Id": "java-request-123",
        }
    )
    app = create_app(settings=settings(tmp_path), engine=engine)
    async with api_client(app) as client:
        response = await client.post(
            "/internal/v1/conversions",
            headers=headers,
            content=b"document bytes",
        )

    payload = response.json()
    assert response.status_code == 200
    assert response.headers["x-request-id"] == "java-request-123"
    assert payload["schemaVersion"] == "1.0"
    assert payload["requestId"] == "java-request-123"
    assert payload["title"] == "Converted"
    assert payload["markdown"] == "# Converted\n"
    assert payload["source"] == {
        "filename": "示例.docx",
        "extension": ".docx",
        "contentType": "application/octet-stream",
        "sizeBytes": 14,
    }
    assert payload["engine"] == "fake"
    assert payload["engineVersion"] == "1.2.3"
    assert payload["metrics"]["durationMs"] >= 0
    assert payload["metrics"]["markdownCharacters"] == 12
    assert engine.seen_bytes == b"document bytes"
    assert engine.seen_extension == ".docx"
    assert engine.seen_path is not None and not engine.seen_path.exists()
    assert await asyncio.to_thread(lambda: list(tmp_path.iterdir())) == []


@pytest.mark.asyncio
async def test_missing_dependency_is_reported_before_upload_is_read(tmp_path: Path) -> None:
    app = create_app(settings=settings(tmp_path), engine=UnavailableEngine())
    async with api_client(app) as client:
        response = await client.post(
            "/internal/v1/conversions",
            headers=auth_headers(),
            content=b"document bytes",
        )

    assert response.status_code == 503
    assert response.json()["error"]["code"] == "converter_dependency_unavailable"
    assert response.headers["retry-after"] == "60"
    assert await asyncio.to_thread(lambda: list(tmp_path.iterdir())) == []


@pytest.mark.asyncio
async def test_rejects_large_upload_from_content_length(tmp_path: Path) -> None:
    app = create_app(settings=settings(tmp_path, max_upload_bytes=3), engine=FakeEngine())
    async with api_client(app) as client:
        response = await client.post(
            "/internal/v1/conversions",
            headers=auth_headers(),
            content=b"four",
        )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "upload_too_large"


@pytest.mark.asyncio
async def test_rejects_chunked_upload_that_crosses_stream_limit(tmp_path: Path) -> None:
    async def document_chunks() -> AsyncIterator[bytes]:
        yield b"two"
        yield b"two"

    app = create_app(settings=settings(tmp_path, max_upload_bytes=5), engine=FakeEngine())
    async with api_client(app) as client:
        response = await client.post(
            "/internal/v1/conversions",
            headers=auth_headers(),
            content=document_chunks(),
        )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "upload_too_large"
    assert await asyncio.to_thread(lambda: list(tmp_path.iterdir())) == []


@pytest.mark.asyncio
async def test_rejects_an_empty_upload(tmp_path: Path) -> None:
    app = create_app(settings=settings(tmp_path), engine=FakeEngine())
    async with api_client(app) as client:
        response = await client.post(
            "/internal/v1/conversions",
            headers=auth_headers(),
            content=b"",
        )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "empty_upload"
    assert await asyncio.to_thread(lambda: list(tmp_path.iterdir())) == []


@pytest.mark.asyncio
async def test_rejects_oversized_converted_markdown(tmp_path: Path) -> None:
    engine = FakeEngine(EngineResult(markdown="123456"))
    app = create_app(
        settings=settings(tmp_path, max_output_characters=5),
        engine=engine,
    )
    async with api_client(app) as client:
        response = await client.post(
            "/internal/v1/conversions",
            headers=auth_headers(),
            content=b"document",
        )

    assert response.status_code == 413
    assert response.json()["error"]["code"] == "converted_output_too_large"
    assert await asyncio.to_thread(lambda: list(tmp_path.iterdir())) == []


@pytest.mark.asyncio
async def test_rejects_unsupported_extension_and_invalid_filename(tmp_path: Path) -> None:
    app = create_app(settings=settings(tmp_path), engine=FakeEngine())
    async with api_client(app) as client:
        extension_response = await client.post(
            "/internal/v1/conversions",
            headers=auth_headers(**{"X-File-Extension": ".exe"}),
            content=b"content",
        )
        filename_response = await client.post(
            "/internal/v1/conversions",
            headers=auth_headers(**{"X-File-Name-B64": encode_filename("../secret.docx")}),
            content=b"content",
        )

    assert extension_response.status_code == 415
    assert extension_response.json()["error"]["code"] == "unsupported_file_extension"
    assert filename_response.status_code == 400
    assert filename_response.json()["error"]["code"] == "invalid_filename"


@pytest.mark.asyncio
async def test_conversion_failure_still_removes_temporary_file(tmp_path: Path) -> None:
    engine = FailingEngine()
    app = create_app(settings=settings(tmp_path), engine=engine)
    async with api_client(app) as client:
        response = await client.post(
            "/internal/v1/conversions",
            headers=auth_headers(),
            content=b"broken document",
        )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "document_conversion_failed"
    assert engine.seen_path is not None and not engine.seen_path.exists()
    assert await asyncio.to_thread(lambda: list(tmp_path.iterdir())) == []


@pytest.mark.asyncio
async def test_missing_required_extension_uses_stable_error_shape(tmp_path: Path) -> None:
    headers = auth_headers()
    del headers["X-File-Extension"]
    app = create_app(settings=settings(tmp_path), engine=FakeEngine())
    async with api_client(app) as client:
        response = await client.post(
            "/internal/v1/conversions",
            headers=headers,
            content=b"content",
        )

    assert response.status_code == 400
    assert response.json()["error"]["code"] == "invalid_request"
    assert response.headers["x-request-id"]

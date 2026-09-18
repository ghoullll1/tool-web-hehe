"""Bounded upload and conversion orchestration."""

from __future__ import annotations

import asyncio
import base64
import binascii
import os
import re
import tempfile
import time
from pathlib import Path

from fastapi import Request

from .config import Settings
from .engine import ConversionEngine
from .errors import (
    ApiError,
    EngineConversionError,
    EngineOutputTooLargeError,
    EngineTimeoutError,
    EngineUnavailableError,
)
from .models import ConversionMetrics, ConversionResponse, SourceDetails

EXTENSION_PATTERN = re.compile(r"^\.[a-z0-9]{1,12}$")
OCTET_STREAM = "application/octet-stream"


class ConversionService:
    def __init__(self, settings: Settings, engine: ConversionEngine) -> None:
        self._settings = settings
        self._engine = engine
        self._semaphore = asyncio.Semaphore(settings.max_concurrent_conversions)

    async def convert(
        self,
        *,
        request: Request,
        file_extension: str,
        encoded_filename: str | None,
    ) -> ConversionResponse:
        extension = self._validate_extension(file_extension)
        filename = self._decode_filename(encoded_filename)
        content_type = request.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        if content_type != OCTET_STREAM:
            raise ApiError(
                status_code=415,
                code="unsupported_content_type",
                message=f"Content-Type must be {OCTET_STREAM}.",
            )

        self._validate_content_length(request.headers.get("content-length"))
        availability = self._engine.availability()
        if not availability.installed:
            raise ApiError(
                status_code=503,
                code="converter_dependency_unavailable",
                message=availability.reason or "The conversion engine is unavailable.",
                headers={"Retry-After": "60"},
            )

        acquired = False
        source_path: Path | None = None
        started = time.perf_counter()
        try:
            try:
                await asyncio.wait_for(
                    self._semaphore.acquire(),
                    timeout=self._settings.queue_timeout_seconds,
                )
                acquired = True
            except TimeoutError as exc:
                raise ApiError(
                    status_code=503,
                    code="conversion_capacity_exhausted",
                    message="The conversion worker is busy. Retry later.",
                    headers={"Retry-After": "5"},
                ) from exc

            source_path, size_bytes = await self._write_upload(request)
            try:
                result = await asyncio.to_thread(
                    self._engine.convert_file,
                    source_path,
                    extension,
                )
            except EngineTimeoutError as exc:
                raise ApiError(
                    status_code=504,
                    code="conversion_timeout",
                    message="The document conversion exceeded the configured time limit.",
                ) from exc
            except EngineUnavailableError as exc:
                raise ApiError(
                    status_code=503,
                    code="converter_dependency_unavailable",
                    message=str(exc),
                    headers={"Retry-After": "60"},
                ) from exc
            except EngineConversionError as exc:
                raise ApiError(
                    status_code=422,
                    code="document_conversion_failed",
                    message=str(exc),
                ) from exc
            except EngineOutputTooLargeError as exc:
                raise ApiError(
                    status_code=413,
                    code="converted_output_too_large",
                    message=str(exc),
                    details={"maxCharacters": self._settings.max_output_characters},
                ) from exc

            if len(result.markdown) > self._settings.max_output_characters:
                raise ApiError(
                    status_code=413,
                    code="converted_output_too_large",
                    message="The converted Markdown exceeds the configured output limit.",
                    details={"maxCharacters": self._settings.max_output_characters},
                )

            duration_ms = max(0, round((time.perf_counter() - started) * 1000))
            return ConversionResponse(
                request_id=str(request.state.request_id),
                title=result.title,
                markdown=result.markdown,
                source=SourceDetails(
                    filename=filename,
                    extension=extension,
                    content_type=content_type,
                    size_bytes=size_bytes,
                ),
                engine=availability.name,
                engine_version=availability.version,
                metrics=ConversionMetrics(
                    duration_ms=duration_ms,
                    markdown_characters=len(result.markdown),
                ),
                warnings=list(result.warnings),
            )
        finally:
            if source_path is not None:
                await asyncio.to_thread(source_path.unlink, missing_ok=True)
            if acquired:
                self._semaphore.release()

    def _validate_extension(self, raw_extension: str) -> str:
        extension = raw_extension.strip().lower()
        if not EXTENSION_PATTERN.fullmatch(extension):
            raise ApiError(
                status_code=400,
                code="invalid_file_extension",
                message="X-File-Extension must be a simple extension such as .docx.",
            )
        if extension not in self._settings.allowed_extensions:
            raise ApiError(
                status_code=415,
                code="unsupported_file_extension",
                message=f"Files with the {extension} extension are not enabled.",
                details={"allowedExtensions": list(self._settings.allowed_extensions)},
            )
        return extension

    def _decode_filename(self, encoded_filename: str | None) -> str | None:
        if encoded_filename is None:
            return None
        if len(encoded_filename) > 1024:
            raise ApiError(
                status_code=400,
                code="invalid_filename",
                message="X-File-Name-B64 is too long.",
            )
        padded = encoded_filename + "=" * (-len(encoded_filename) % 4)
        try:
            decoded = base64.b64decode(padded, altchars=b"-_", validate=True).decode("utf-8")
        except (binascii.Error, UnicodeDecodeError) as exc:
            raise ApiError(
                status_code=400,
                code="invalid_filename",
                message="X-File-Name-B64 must contain URL-safe Base64 encoded UTF-8.",
            ) from exc
        if (
            not decoded
            or len(decoded) > 255
            or "/" in decoded
            or "\\" in decoded
            or any(ord(character) < 32 for character in decoded)
        ):
            raise ApiError(
                status_code=400,
                code="invalid_filename",
                message="The decoded filename is invalid.",
            )
        return decoded

    def _validate_content_length(self, raw_content_length: str | None) -> None:
        if raw_content_length is None:
            return
        try:
            content_length = int(raw_content_length)
        except ValueError as exc:
            raise ApiError(
                status_code=400,
                code="invalid_content_length",
                message="Content-Length must be a non-negative integer.",
            ) from exc
        if content_length < 0:
            raise ApiError(
                status_code=400,
                code="invalid_content_length",
                message="Content-Length must be a non-negative integer.",
            )
        if content_length > self._settings.max_upload_bytes:
            raise ApiError(
                status_code=413,
                code="upload_too_large",
                message="The uploaded document exceeds the configured size limit.",
                details={"maxBytes": self._settings.max_upload_bytes},
            )

    async def _write_upload(self, request: Request) -> tuple[Path, int]:
        self._settings.temp_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        handle = tempfile.NamedTemporaryFile(
            mode="w+b",
            prefix="conversion-",
            suffix=".upload",
            dir=self._settings.temp_directory,
            delete=False,
        )
        source_path = Path(handle.name)
        size_bytes = 0
        try:
            os.chmod(source_path, 0o600)
            async for chunk in request.stream():
                size_bytes += len(chunk)
                if size_bytes > self._settings.max_upload_bytes:
                    raise ApiError(
                        status_code=413,
                        code="upload_too_large",
                        message="The uploaded document exceeds the configured size limit.",
                        details={"maxBytes": self._settings.max_upload_bytes},
                    )
                handle.write(chunk)
            handle.flush()
            os.fsync(handle.fileno())
        except BaseException:
            handle.close()
            await asyncio.to_thread(source_path.unlink, missing_ok=True)
            raise
        finally:
            if not handle.closed:
                handle.close()

        if size_bytes == 0:
            await asyncio.to_thread(source_path.unlink, missing_ok=True)
            raise ApiError(
                status_code=400,
                code="empty_upload",
                message="The uploaded document is empty.",
            )
        return source_path, size_bytes

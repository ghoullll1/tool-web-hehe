"""FastAPI application factory and internal routes."""

from __future__ import annotations

import logging
import re
import secrets
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import FastAPI, Header, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.middleware.base import RequestResponseEndpoint

from . import __version__
from .config import Settings
from .engine import ConversionEngine, MarkItDownEngine
from .errors import ApiError
from .logging_config import configure_logging
from .models import (
    CapabilitiesResponse,
    ConversionResponse,
    ErrorBody,
    ErrorResponse,
    HealthResponse,
    Limits,
    ReadinessResponse,
)
from .service import OCTET_STREAM, ConversionService

LOGGER = logging.getLogger("markitdown_worker.api")
SERVICE_NAME = "markitdown-worker"
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")


def create_app(
    *,
    settings: Settings | None = None,
    engine: ConversionEngine | None = None,
) -> FastAPI:
    resolved_settings = settings or Settings.from_environment()
    resolved_engine = engine or MarkItDownEngine(
        resolved_settings.conversion_timeout_seconds,
        resolved_settings.max_output_characters,
    )
    conversion_service = ConversionService(resolved_settings, resolved_engine)

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        resolved_settings.temp_directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        yield

    configure_logging()
    app = FastAPI(
        title="Tool Web MarkItDown Worker",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    app.state.settings = resolved_settings
    app.state.engine = resolved_engine
    app.state.conversion_service = conversion_service

    @app.middleware("http")
    async def request_context(
        request: Request,
        call_next: RequestResponseEndpoint,
    ) -> Response:
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if REQUEST_ID_PATTERN.fullmatch(incoming) else str(uuid.uuid4())
        request.state.request_id = request_id
        started = time.perf_counter()
        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        LOGGER.info(
            "request_completed",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
                "status_code": response.status_code,
                "duration_ms": max(0, round((time.perf_counter() - started) * 1000)),
            },
        )
        return response

    @app.exception_handler(ApiError)
    async def handle_api_error(request: Request, exc: ApiError) -> JSONResponse:
        request_id = str(getattr(request.state, "request_id", uuid.uuid4()))
        body = ErrorResponse(
            error=ErrorBody(
                code=exc.code,
                message=exc.message,
                request_id=request_id,
                details=exc.details,
            )
        )
        return JSONResponse(
            status_code=exc.status_code,
            content=body.model_dump(by_alias=True, exclude_none=True),
            headers=exc.headers,
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request,
        exc: RequestValidationError,
    ) -> JSONResponse:
        request_id = str(getattr(request.state, "request_id", uuid.uuid4()))
        fields = [".".join(str(item) for item in error["loc"]) for error in exc.errors()]
        body = ErrorResponse(
            error=ErrorBody(
                code="invalid_request",
                message="The request is missing or contains invalid fields.",
                request_id=request_id,
                details={"fields": fields},
            )
        )
        return JSONResponse(
            status_code=400,
            content=body.model_dump(by_alias=True, exclude_none=True),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        request_id = str(getattr(request.state, "request_id", uuid.uuid4()))
        LOGGER.exception("unhandled_request_error", extra={"request_id": request_id})
        body = ErrorResponse(
            error=ErrorBody(
                code="internal_error",
                message="The worker could not complete the request.",
                request_id=request_id,
            )
        )
        return JSONResponse(
            status_code=500,
            content=body.model_dump(by_alias=True, exclude_none=True),
        )

    def require_auth(authorization: str | None) -> None:
        expected_token = resolved_settings.api_token
        if expected_token is None:
            return
        scheme, separator, supplied_token = (authorization or "").partition(" ")
        if (
            separator != " "
            or scheme.lower() != "bearer"
            or not secrets.compare_digest(supplied_token, expected_token)
        ):
            raise ApiError(
                status_code=401,
                code="unauthorized",
                message="A valid worker Bearer token is required.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    @app.get("/health/live", response_model=HealthResponse)
    async def liveness() -> HealthResponse:
        return HealthResponse(status="UP", service=SERVICE_NAME, version=__version__)

    @app.get(
        "/health/ready",
        response_model=ReadinessResponse,
        responses={503: {"model": ReadinessResponse}},
    )
    async def readiness(response: Response) -> ReadinessResponse:
        availability = resolved_engine.availability()
        if not availability.installed:
            response.status_code = 503
        return ReadinessResponse(
            status="UP" if availability.installed else "DOWN",
            service=SERVICE_NAME,
            version=__version__,
            engine=availability.name,
            engine_version=availability.version,
            reason=availability.reason,
        )

    @app.get("/internal/v1/capabilities", response_model=CapabilitiesResponse)
    async def capabilities(
        authorization: Annotated[str | None, Header(alias="Authorization")] = None,
    ) -> CapabilitiesResponse:
        require_auth(authorization)
        availability = resolved_engine.availability()
        return CapabilitiesResponse(
            service=SERVICE_NAME,
            version=__version__,
            engine=availability.name,
            engine_installed=availability.installed,
            engine_version=availability.version,
            authentication_enabled=resolved_settings.authentication_enabled,
            accepted_content_type=OCTET_STREAM,
            allowed_extensions=list(resolved_settings.allowed_extensions),
            limits=Limits(
                max_upload_bytes=resolved_settings.max_upload_bytes,
                max_output_characters=resolved_settings.max_output_characters,
                max_concurrent_conversions=resolved_settings.max_concurrent_conversions,
                conversion_timeout_seconds=resolved_settings.conversion_timeout_seconds,
            ),
        )

    @app.post(
        "/internal/v1/conversions",
        response_model=ConversionResponse,
        responses={
            400: {"model": ErrorResponse},
            401: {"model": ErrorResponse},
            413: {"model": ErrorResponse},
            415: {"model": ErrorResponse},
            422: {"model": ErrorResponse},
            503: {"model": ErrorResponse},
            504: {"model": ErrorResponse},
        },
    )
    async def convert(
        request: Request,
        x_file_extension: Annotated[str, Header(alias="X-File-Extension")],
        authorization: Annotated[str | None, Header(alias="Authorization")] = None,
        x_file_name_b64: Annotated[str | None, Header(alias="X-File-Name-B64")] = None,
    ) -> ConversionResponse:
        require_auth(authorization)
        return await conversion_service.convert(
            request=request,
            file_extension=x_file_extension,
            encoded_filename=x_file_name_b64,
        )

    return app

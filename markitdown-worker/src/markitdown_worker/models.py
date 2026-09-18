"""Public API models for the internal worker contract."""

from __future__ import annotations

from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field


def _camel_case(value: str) -> str:
    head, *tail = value.split("_")
    return head + "".join(part.capitalize() for part in tail)


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=_camel_case, populate_by_name=True)


class HealthResponse(ApiModel):
    status: str
    service: str
    version: str


class ReadinessResponse(HealthResponse):
    engine: str
    engine_version: str | None = None
    reason: str | None = None


class Limits(ApiModel):
    max_upload_bytes: int
    max_output_characters: int
    max_concurrent_conversions: int
    conversion_timeout_seconds: int


class CapabilitiesResponse(ApiModel):
    service: str
    version: str
    engine: str
    engine_installed: bool
    engine_version: str | None = None
    authentication_enabled: bool
    accepted_content_type: str
    allowed_extensions: list[str]
    limits: Limits


class SourceDetails(ApiModel):
    filename: str | None = None
    extension: str
    content_type: str
    size_bytes: int


class ConversionMetrics(ApiModel):
    duration_ms: int = Field(ge=0)
    markdown_characters: int = Field(ge=0)


class ConversionResponse(ApiModel):
    schema_version: str = "1.0"
    request_id: str
    title: str | None = None
    markdown: str
    source: SourceDetails
    engine: str
    engine_version: str | None = None
    metrics: ConversionMetrics
    warnings: list[str] = Field(default_factory=list)


class ErrorBody(ApiModel):
    code: str
    message: str
    request_id: str
    details: dict[str, object] | None = None


class ErrorResponse(ApiModel):
    error: ErrorBody


@dataclass(frozen=True, slots=True)
class EngineAvailability:
    installed: bool
    name: str
    version: str | None = None
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class EngineResult:
    markdown: str
    title: str | None = None
    warnings: tuple[str, ...] = ()

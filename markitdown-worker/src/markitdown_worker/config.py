"""Environment-backed worker configuration."""

from __future__ import annotations

import os
import tempfile
from dataclasses import dataclass
from pathlib import Path

DEFAULT_EXTENSIONS = (
    ".csv",
    ".docx",
    ".eml",
    ".htm",
    ".html",
    ".json",
    ".md",
    ".msg",
    ".pdf",
    ".pptx",
    ".rtf",
    ".txt",
    ".xls",
    ".xlsx",
    ".xml",
)


def _positive_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise ValueError(f"{name} must be an integer") from exc
    if value <= 0:
        raise ValueError(f"{name} must be greater than zero")
    return value


def _extensions(raw_value: str | None) -> tuple[str, ...]:
    if raw_value is None:
        return DEFAULT_EXTENSIONS
    normalized = {
        value if value.startswith(".") else f".{value}"
        for item in raw_value.split(",")
        if (value := item.strip().lower())
    }
    if not normalized:
        raise ValueError("MARKITDOWN_WORKER_ALLOWED_EXTENSIONS cannot be empty")
    if any(not extension[1:].isalnum() for extension in normalized):
        raise ValueError("MARKITDOWN_WORKER_ALLOWED_EXTENSIONS contains an invalid extension")
    return tuple(sorted(normalized))


@dataclass(frozen=True, slots=True)
class Settings:
    """Immutable settings shared by the API and conversion service."""

    environment: str = "development"
    api_token: str | None = None
    max_upload_bytes: int = 10 * 1024 * 1024
    max_output_characters: int = 16 * 1024 * 1024
    max_concurrent_conversions: int = 2
    queue_timeout_seconds: int = 5
    conversion_timeout_seconds: int = 120
    temp_directory: Path = Path(tempfile.gettempdir()) / "tool-web-markitdown"
    allowed_extensions: tuple[str, ...] = DEFAULT_EXTENSIONS

    @classmethod
    def from_environment(cls) -> Settings:
        environment = os.getenv("MARKITDOWN_WORKER_ENVIRONMENT", "development").strip().lower()
        token = os.getenv("MARKITDOWN_WORKER_API_TOKEN")
        token = token.strip() if token and token.strip() else None
        if environment == "production" and (token is None or len(token) < 32):
            raise ValueError(
                "MARKITDOWN_WORKER_API_TOKEN must contain at least 32 characters in production"
            )

        temp_directory = Path(
            os.getenv(
                "MARKITDOWN_WORKER_TEMP_DIRECTORY",
                str(Path(tempfile.gettempdir()) / "tool-web-markitdown"),
            )
        ).expanduser()

        return cls(
            environment=environment,
            api_token=token,
            max_upload_bytes=_positive_int("MARKITDOWN_WORKER_MAX_UPLOAD_BYTES", 10 * 1024 * 1024),
            max_output_characters=_positive_int(
                "MARKITDOWN_WORKER_MAX_OUTPUT_CHARACTERS", 16 * 1024 * 1024
            ),
            max_concurrent_conversions=_positive_int(
                "MARKITDOWN_WORKER_MAX_CONCURRENT_CONVERSIONS", 2
            ),
            queue_timeout_seconds=_positive_int("MARKITDOWN_WORKER_QUEUE_TIMEOUT_SECONDS", 5),
            conversion_timeout_seconds=_positive_int(
                "MARKITDOWN_WORKER_CONVERSION_TIMEOUT_SECONDS", 120
            ),
            temp_directory=temp_directory,
            allowed_extensions=_extensions(os.getenv("MARKITDOWN_WORKER_ALLOWED_EXTENSIONS")),
        )

    @property
    def authentication_enabled(self) -> bool:
        return self.api_token is not None

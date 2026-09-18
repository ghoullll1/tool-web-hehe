"""Typed errors and stable API error codes."""

from __future__ import annotations


class ApiError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, object] | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        self.headers = headers


class EngineUnavailableError(RuntimeError):
    """Raised when the optional converter is not installed or cannot be imported."""


class EngineConversionError(RuntimeError):
    """Raised when MarkItDown rejects or cannot convert a supplied document."""


class EngineTimeoutError(RuntimeError):
    """Raised after the isolated converter process is forcibly stopped."""


class EngineOutputTooLargeError(RuntimeError):
    """Raised when the child refuses to return an oversized Markdown payload."""

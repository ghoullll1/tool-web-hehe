"""Conversion engine abstraction and lazy MarkItDown adapter."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
from importlib import metadata
from pathlib import Path
from typing import Protocol

from .errors import (
    EngineConversionError,
    EngineOutputTooLargeError,
    EngineTimeoutError,
    EngineUnavailableError,
)
from .models import EngineAvailability, EngineResult


class ConversionEngine(Protocol):
    def availability(self) -> EngineAvailability: ...

    def convert_file(self, source_path: Path, file_extension: str) -> EngineResult: ...


class MarkItDownEngine:
    """Run MarkItDown in a disposable child process with a hard timeout."""

    name = "markitdown"

    def __init__(self, timeout_seconds: int, max_output_characters: int) -> None:
        self._timeout_seconds = timeout_seconds
        self._max_output_characters = max_output_characters

    def availability(self) -> EngineAvailability:
        if importlib.util.find_spec("markitdown") is None:
            return EngineAvailability(
                installed=False,
                name=self.name,
                reason="The optional MarkItDown dependency is not installed.",
            )
        try:
            version = metadata.version("markitdown")
        except metadata.PackageNotFoundError:
            version = None
        return EngineAvailability(installed=True, name=self.name, version=version)

    def convert_file(self, source_path: Path, file_extension: str) -> EngineResult:
        availability = self.availability()
        if not availability.installed:
            raise EngineUnavailableError(availability.reason or "MarkItDown is unavailable")

        result_handle = tempfile.NamedTemporaryFile(
            mode="w",
            prefix="conversion-",
            suffix=".result",
            dir=source_path.parent,
            delete=False,
        )
        result_path = Path(result_handle.name)
        result_handle.close()
        os.chmod(result_path, 0o600)
        try:
            return_code = self._run_converter(
                source_path=source_path,
                result_path=result_path,
                file_extension=file_extension,
            )
            return self._read_result(result_path, return_code)
        finally:
            result_path.unlink(missing_ok=True)

    def _run_converter(
        self,
        *,
        source_path: Path,
        result_path: Path,
        file_extension: str,
    ) -> int:
        command = [
            sys.executable,
            "-s",
            "-m",
            "markitdown_worker.subprocess_runner",
            str(source_path),
            file_extension,
            str(self._max_output_characters),
            str(result_path),
        ]
        creation_flags = subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0
        try:
            completed = subprocess.run(  # noqa: S603 - fixed executable/module and controlled paths.
                command,
                check=False,
                timeout=self._timeout_seconds,
                creationflags=creation_flags,
                env=self._subprocess_environment(source_path.parent),
                cwd=source_path.parent,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
        except subprocess.TimeoutExpired as exc:
            raise EngineTimeoutError(
                f"MarkItDown exceeded the {self._timeout_seconds} second time limit"
            ) from exc
        except OSError as exc:
            raise EngineConversionError("The isolated converter process could not start") from exc
        return completed.returncode

    def _read_result(self, result_path: Path, return_code: int) -> EngineResult:
        max_result_bytes = self._max_output_characters * 4 + 65536
        if result_path.stat().st_size > max_result_bytes:
            raise EngineOutputTooLargeError(
                "The converted Markdown exceeds the configured output limit."
            )
        try:
            payload = json.loads(result_path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError) as exc:
            raise EngineConversionError(
                "The isolated converter returned an invalid response"
            ) from exc
        if not isinstance(payload, dict):
            raise EngineConversionError("The isolated converter returned an invalid response")
        if return_code != 0 or payload.get("ok") is not True:
            message = payload.get("message")
            if payload.get("kind") == "dependency":
                raise EngineUnavailableError(
                    message if isinstance(message, str) else "MarkItDown could not be imported"
                )
            if payload.get("kind") == "output_limit":
                raise EngineOutputTooLargeError(
                    "The converted Markdown exceeds the configured output limit."
                )
            raise EngineConversionError(
                message if isinstance(message, str) else "MarkItDown conversion failed"
            )

        markdown = payload.get("markdown")
        title = payload.get("title")
        warnings = payload.get("warnings", [])
        if (
            not isinstance(markdown, str)
            or not isinstance(warnings, list)
            or not all(isinstance(item, str) for item in warnings)
        ):
            raise EngineConversionError("The isolated converter returned an invalid response")
        return EngineResult(
            markdown=markdown,
            title=title if isinstance(title, str) else None,
            warnings=tuple(warnings),
        )

    @staticmethod
    def _subprocess_environment(temp_directory: Path) -> dict[str, str]:
        environment = {
            "PYTHONIOENCODING": "utf-8",
            "PYTHONUTF8": "1",
            "TEMP": str(temp_directory),
            "TMP": str(temp_directory),
            "TMPDIR": str(temp_directory),
        }
        for name in ("PATH", "SYSTEMROOT", "WINDIR", "LD_LIBRARY_PATH"):
            if value := os.environ.get(name):
                environment[name] = value
        return environment

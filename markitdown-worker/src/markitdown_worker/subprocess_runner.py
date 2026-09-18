"""Disposable MarkItDown subprocess entry point.

The parent worker supplies only a service-generated temporary path and a validated
extension. This module is not an HTTP entry point.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


def _failure_message(exc: BaseException) -> str:
    return f"MarkItDown converter failed ({type(exc).__name__})."


def _emit(result_path: Path, payload: dict[str, object]) -> None:
    result_path.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )


def main(arguments: list[str] | None = None) -> int:
    args = arguments if arguments is not None else sys.argv[1:]
    if len(args) != 4:
        return 2

    source_path = Path(args[0])
    file_extension = args[1]
    result_path = Path(args[3])
    try:
        max_output_characters = int(args[2])
    except ValueError:
        _emit(result_path, {"ok": False, "kind": "request", "message": "Invalid output limit"})
        return 2
    if max_output_characters <= 0:
        _emit(result_path, {"ok": False, "kind": "request", "message": "Invalid output limit"})
        return 2
    try:
        from markitdown import MarkItDown
    except ImportError:
        _emit(
            result_path,
            {
                "ok": False,
                "kind": "dependency",
                "message": "The optional MarkItDown dependency is not installed.",
            },
        )
        return 3

    try:
        converter = MarkItDown(enable_plugins=False)
        with source_path.open("rb") as source:
            converted = converter.convert_stream(source, file_extension=file_extension)
        markdown = getattr(converted, "text_content", None)
        if not isinstance(markdown, str):
            raise ValueError("MarkItDown returned no text content")
        if len(markdown) > max_output_characters:
            _emit(
                result_path,
                {
                    "ok": False,
                    "kind": "output_limit",
                    "message": "Converted output exceeds the configured limit.",
                },
            )
            return 5
        title = getattr(converted, "title", None)
        _emit(
            result_path,
            {
                "ok": True,
                "markdown": markdown,
                "title": title if isinstance(title, str) else None,
                "warnings": [],
            },
        )
        return 0
    except BaseException as exc:
        _emit(
            result_path,
            {
                "ok": False,
                "kind": "conversion",
                "message": _failure_message(exc),
            },
        )
        return 4


if __name__ == "__main__":
    raise SystemExit(main())

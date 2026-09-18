from __future__ import annotations

import importlib.util
import json
import subprocess
from pathlib import Path
from typing import cast

import pytest

from markitdown_worker.engine import MarkItDownEngine
from markitdown_worker.errors import EngineOutputTooLargeError, EngineTimeoutError


def test_engine_reports_missing_optional_dependency(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(importlib.util, "find_spec", lambda _: None)

    availability = MarkItDownEngine(timeout_seconds=1, max_output_characters=1024).availability()

    assert availability.installed is False
    assert availability.name == "markitdown"
    assert availability.reason is not None


def test_converter_subprocess_receives_no_service_secret(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    captured: dict[str, object] = {}

    def fake_run(command: list[str], **kwargs: object) -> subprocess.CompletedProcess[str]:
        captured["command"] = command
        captured["environment"] = kwargs["env"]
        Path(command[-1]).write_text(
            json.dumps({"ok": True, "markdown": "# Result", "title": None, "warnings": []}),
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(command, 0)

    monkeypatch.setattr(importlib.util, "find_spec", lambda _: object())
    monkeypatch.setattr("markitdown_worker.engine.metadata.version", lambda _: "0.1.7")
    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setenv("MARKITDOWN_WORKER_API_TOKEN", "must-not-reach-child")
    source = tmp_path / "source.upload"
    source.write_bytes(b"content")

    result = MarkItDownEngine(timeout_seconds=1, max_output_characters=2048).convert_file(
        source,
        ".docx",
    )

    environment = captured["environment"]
    assert isinstance(environment, dict)
    assert "MARKITDOWN_WORKER_API_TOKEN" not in environment
    assert result.markdown == "# Result"
    command = cast(list[str], captured["command"])
    assert command[-2] == "2048"
    assert not any(tmp_path.glob("*.result"))


def test_converter_maps_child_output_limit(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    def fake_run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        Path(command[-1]).write_text(
            json.dumps(
                {
                    "ok": False,
                    "kind": "output_limit",
                    "message": "Converted output exceeds the configured limit.",
                }
            ),
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(command, 5)

    monkeypatch.setattr(importlib.util, "find_spec", lambda _: object())
    monkeypatch.setattr("markitdown_worker.engine.metadata.version", lambda _: "0.1.7")
    monkeypatch.setattr(subprocess, "run", fake_run)
    source = tmp_path / "source.upload"
    source.write_bytes(b"content")

    with pytest.raises(EngineOutputTooLargeError):
        MarkItDownEngine(timeout_seconds=1, max_output_characters=5).convert_file(
            source,
            ".docx",
        )
    assert not any(tmp_path.glob("*.result"))


def test_converter_timeout_removes_result_file(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: Path,
) -> None:
    def fake_run(command: list[str], **_: object) -> subprocess.CompletedProcess[str]:
        raise subprocess.TimeoutExpired(command, timeout=1)

    monkeypatch.setattr(importlib.util, "find_spec", lambda _: object())
    monkeypatch.setattr("markitdown_worker.engine.metadata.version", lambda _: "0.1.7")
    monkeypatch.setattr(subprocess, "run", fake_run)
    source = tmp_path / "source.upload"
    source.write_bytes(b"content")

    with pytest.raises(EngineTimeoutError):
        MarkItDownEngine(timeout_seconds=1, max_output_characters=5).convert_file(
            source,
            ".docx",
        )
    assert not any(tmp_path.glob("*.result"))

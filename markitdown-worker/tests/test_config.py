from __future__ import annotations

import pytest

from markitdown_worker.config import Settings


def test_production_requires_a_long_api_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MARKITDOWN_WORKER_ENVIRONMENT", "production")
    monkeypatch.setenv("MARKITDOWN_WORKER_API_TOKEN", "short")

    with pytest.raises(ValueError, match="at least 32"):
        Settings.from_environment()


def test_extension_configuration_is_normalized(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MARKITDOWN_WORKER_ALLOWED_EXTENSIONS", " DOCX, .pdf,docx ")

    result = Settings.from_environment()

    assert result.allowed_extensions == (".docx", ".pdf")

"""ASGI entry point used by Uvicorn."""

from .api import create_app

app = create_app()

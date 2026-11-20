"""A request that cannot get SQLite's write lock must say the database is busy instead of failing with a bare 500."""

import sqlite3
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.api.errors import register_error_handlers
from app.db import session as db_session
from app.main import create_app
from tests.helpers import log_in, settings_with_login


def test_request_gets_503_while_another_connection_holds_the_write_lock(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(db_session, "SQLITE_LOCK_TIMEOUT_SECONDS", 0.2)
    database = tmp_path / "locked.db"
    app = create_app(settings_with_login(f"sqlite:///{database}"))

    with TestClient(app, raise_server_exceptions=False) as client:
        log_in(client)
        blocker = sqlite3.connect(database, isolation_level=None)
        blocker.execute("BEGIN IMMEDIATE")
        try:
            blocked = client.post("/api/v1/games", json={"destination_name": "Alps"})
        finally:
            blocker.execute("ROLLBACK")
            blocker.close()
        retried = client.post("/api/v1/games", json={"destination_name": "Alps"})

    assert blocked.status_code == 503
    assert "busy" in blocked.json()["detail"]
    assert retried.status_code == 201


def test_other_database_errors_are_not_reported_as_a_busy_database() -> None:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/broken")
    def broken() -> None:
        raise OperationalError("SELECT 1", {}, sqlite3.OperationalError("disk I/O error"))

    response = TestClient(app, raise_server_exceptions=False).get("/broken")

    assert response.status_code == 500
    assert "busy" not in response.text

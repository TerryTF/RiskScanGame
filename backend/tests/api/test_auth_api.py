import re
from collections.abc import Iterator

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from app.api.router import api_router
from app.config import Settings
from app.main import create_app
from app.security import SESSION_COOKIE, LoginThrottle
from tests.helpers import TEST_PASSWORD, TEST_USERNAME, log_in, settings_with_login

# Everything else under /api/v1 must refuse requests without a login.
PUBLIC = {
    ("POST", "/api/v1/auth/login"),
    ("POST", "/api/v1/auth/logout"),
    ("GET", "/api/v1/catalogue"),
    ("GET", "/api/v1/games/{game_id}"),
    ("GET", "/api/v1/texts"),
}


@pytest.fixture
def anonymous(engine: Engine) -> Iterator[TestClient]:
    with TestClient(create_app(settings_with_login(), engine=engine)) as test_client:
        yield test_client


def login(client: TestClient, username: str = TEST_USERNAME, password: str = TEST_PASSWORD) -> int:
    return client.post("/api/v1/auth/login", json={"username": username, "password": password}).status_code


def with_session(token: str) -> dict[str, str]:
    return {"Cookie": f"{SESSION_COOKIE}={token}"}


def test_every_other_api_route_needs_a_login(anonymous: TestClient) -> None:
    checked = 0
    for route in api_router.routes:
        if not isinstance(route, APIRoute):
            continue
        for method in route.methods:
            if (method, route.path) in PUBLIC:
                continue
            response = anonymous.request(method, re.sub(r"\{\w+\}", "1", route.path), json={})
            assert response.status_code == 401, f"{method} {route.path} answered {response.status_code}"
            checked += 1
    assert checked > 20


def test_the_board_can_be_read_without_a_login(client: TestClient, anonymous: TestClient) -> None:
    game_id = client.post("/api/v1/games", json={"destination_name": "Alps"}).json()["id"]

    assert anonymous.get(f"/api/v1/games/{game_id}").json()["destination_name"] == "Alps"
    assert anonymous.get("/api/v1/catalogue").status_code == 200
    assert anonymous.get("/api/v1/texts").status_code == 200
    assert anonymous.post("/api/v1/games", json={"destination_name": "Alps"}).status_code == 401


def test_logging_in_sets_a_session_cookie_scripts_cannot_read(anonymous: TestClient) -> None:
    response = anonymous.post("/api/v1/auth/login", json={"username": TEST_USERNAME, "password": TEST_PASSWORD})

    assert response.status_code == 200
    assert response.json() == {"username": TEST_USERNAME}
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{SESSION_COOKIE}=")
    assert "HttpOnly" in cookie
    assert "SameSite=strict" in cookie
    assert "Secure" not in cookie  # plain http here; over https the cookie is Secure
    assert anonymous.get("/api/v1/auth/session").json() == {"username": TEST_USERNAME}
    assert anonymous.post("/api/v1/games", json={"destination_name": "Alps"}).status_code == 201


@pytest.mark.parametrize(("username", "password"), [(TEST_USERNAME, "wrong password"), ("someone", TEST_PASSWORD)])
def test_wrong_username_or_password_is_refused_with_the_same_message(
    anonymous: TestClient, username: str, password: str
) -> None:
    response = anonymous.post("/api/v1/auth/login", json={"username": username, "password": password})

    assert response.status_code == 401
    assert response.json() == {"detail": "Wrong username or password."}
    assert "set-cookie" not in response.headers
    assert anonymous.get("/api/v1/auth/session").status_code == 401


def test_logging_out_ends_the_session(client: TestClient) -> None:
    response = client.post("/api/v1/auth/logout")

    assert response.status_code == 204
    assert client.get("/api/v1/auth/session").status_code == 401
    assert client.post("/api/v1/games", json={"destination_name": "Alps"}).status_code == 401


def test_a_forged_session_cookie_is_refused(anonymous: TestClient) -> None:
    forged = "eyJ1IjoibW9kZXJhdG9yIiwiZXhwIjo5OTk5OTk5OTk5fQ.c2lnbmF0dXJl"
    assert anonymous.get("/api/v1/auth/session", headers=with_session(forged)).status_code == 401


def test_a_session_signed_with_another_key_is_refused(engine: Engine) -> None:
    with TestClient(create_app(settings_with_login(), engine=engine)) as first:
        token = log_in(first).cookies[SESSION_COOKIE]
        assert first.get("/api/v1/auth/session", headers=with_session(token)).status_code == 200
    # Without RISKSCAN_SECRET_KEY each start picks a new key, so a restart logs everyone out.
    with TestClient(create_app(settings_with_login(), engine=engine)) as restarted:
        assert restarted.get("/api/v1/auth/session", headers=with_session(token)).status_code == 401


def test_too_many_wrong_passwords_block_logins_for_a_while(engine: Engine) -> None:
    app = create_app(settings_with_login(), engine=engine)
    app.state.auth.throttle = LoginThrottle(max_failures=2)
    with TestClient(app) as anonymous:
        assert login(anonymous, password="wrong one") == 401
        assert login(anonymous, password="wrong two") == 401
        assert login(anonymous) == 429


def test_nobody_can_log_in_when_no_login_is_configured(engine: Engine) -> None:
    with TestClient(create_app(Settings(database_url="sqlite://"), engine=engine)) as unconfigured:
        assert login(unconfigured) == 401


def test_the_server_refuses_to_start_from_an_environment_without_a_login(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(Settings, "from_env", lambda: Settings(database_url="sqlite://"))
    with pytest.raises(RuntimeError, match="scripts/set_login.py"):
        create_app()

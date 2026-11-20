from fastapi.testclient import TestClient
from sqlalchemy import Engine, text

from app.domain.enums import Phase


def save(client: TestClient, texts: dict[str, str | None], expected: int = 200) -> dict[str, str]:
    response = client.put("/api/v1/texts", json={"texts": texts})
    assert response.status_code == expected, response.text
    body: dict[str, str] = response.json().get("texts", {})
    return body


def test_texts_start_empty(client: TestClient) -> None:
    response = client.get("/api/v1/texts")
    assert response.status_code == 200
    assert response.json() == {"texts": {}, "undo_available": False}


def test_saved_texts_are_returned_and_can_be_changed_again(client: TestClient) -> None:
    assert save(client, {"home.title": "Begin", "card.action.adaptation.description": "Lower it.\n"}) == {
        "card.action.adaptation.description": "Lower it.\n",
        "home.title": "Begin",
    }
    assert save(client, {"home.title": "Start here"})["home.title"] == "Start here"
    assert client.get("/api/v1/texts").json()["texts"] == {
        "card.action.adaptation.description": "Lower it.\n",
        "home.title": "Start here",
    }


def test_null_restores_the_default_and_unknown_resets_are_ignored(client: TestClient) -> None:
    save(client, {"home.title": "Begin", "home.subtitle": "Sub"})
    assert save(client, {"home.title": None, "never.saved": None}) == {"home.subtitle": "Sub"}


def test_invalid_keys_and_long_texts_are_rejected_without_saving_anything(client: TestClient) -> None:
    save(client, {"ok.key": "fine", "bad key!": "x"}, expected=422)
    save(client, {"ok.key": "x" * 2001}, expected=422)
    assert client.get("/api/v1/texts").json()["texts"] == {}


def test_sample_game_covers_every_phase_without_touching_the_database(client: TestClient, engine: Engine) -> None:
    response = client.get("/api/v1/editor/sample-game")
    assert response.status_code == 200, response.text
    states = response.json()["states"]
    assert {s["state"]["phase"] for s in states} == {phase.value for phase in Phase}
    assert any(roll["applied"] for s in states for roll in s["state"]["hazard_rolls"])
    with engine.connect() as connection:
        assert connection.execute(text("SELECT count(*) FROM games")).scalar() == 0


def undo(client: TestClient, expected: int = 200) -> dict[str, object]:
    response = client.post("/api/v1/texts/undo")
    assert response.status_code == expected, response.text
    body: dict[str, object] = response.json()
    return body


def test_undo_goes_back_one_save_only(client: TestClient) -> None:
    save(client, {"home.title": "First"})
    save(client, {"home.title": "Second", "home.subtitle": "Added"})
    assert client.get("/api/v1/texts").json()["undo_available"] is True

    assert undo(client) == {"texts": {"home.title": "First"}, "undo_available": False}
    # Older versions are not kept, so a second undo has nothing to go back to.
    assert "no saved change to undo" in str(undo(client, expected=409)["detail"])
    assert client.get("/api/v1/texts").json()["texts"] == {"home.title": "First"}


def test_undo_restores_texts_reset_to_their_default(client: TestClient) -> None:
    save(client, {"home.title": "Kept"})
    save(client, {"home.title": None})
    assert undo(client)["texts"] == {"home.title": "Kept"}


def test_a_save_that_changes_nothing_keeps_the_version_to_undo_to(client: TestClient) -> None:
    save(client, {"home.title": "First"})
    save(client, {"home.title": "Second"})
    save(client, {"home.title": "Second"})
    assert undo(client)["texts"] == {"home.title": "First"}

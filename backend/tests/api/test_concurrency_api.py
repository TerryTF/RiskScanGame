"""Concurrent requests against one game must behave as if they ran one after another.

These use a real database file and one session (= one connection) per thread, like parallel HTTP requests do.
"""

import threading
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.domain.dice import FixedDiceProvider
from app.domain.enums import TeamRole
from app.domain.errors import InsufficientResourcesError
from app.main import create_app
from app.schemas.requests import InvestRequest, PaymentInput
from app.services.actions import ActionService
from app.services.events import EventService
from app.services.hazards import HazardService
from app.services.rounds import RoundService
from app.services.scoring import ScoringService
from tests.helpers import Scenario, State, log_in, settings_with_login

PARALLEL = 8


@dataclass
class RaceGame:
    scenario: Scenario
    dice: FixedDiceProvider
    open_session: Callable[[], Session]

    @property
    def game_id(self) -> str:
        return self.scenario.game_id

    def state(self) -> State:
        return self.scenario.call("GET", "")


@pytest.fixture
def race_game(tmp_path: Path, dice: FixedDiceProvider) -> Iterator[RaceGame]:
    """A game that has finished Round 0 (Flood predicted: round 1 die is 3, so Flood triggers in round 1)."""
    app = create_app(settings_with_login(f"sqlite:///{tmp_path / 'race.db'}"), dice_provider=dice)
    with TestClient(app) as client:
        scenario = Scenario(log_in(client), dice).ready_for_round_zero().play_round_zero(predict_dice=(6, 3))
        yield RaceGame(scenario, dice, app.state.session_factory)


def parallel(game: RaceGame, use: Callable[[Session], object]) -> list[object]:
    """Start `use` in PARALLEL threads at the same instant; return each result or the exception it raised."""
    barrier = threading.Barrier(PARALLEL)

    def worker() -> object:
        session = game.open_session()
        try:
            barrier.wait()
            return use(session)
        except Exception as exc:
            return exc
        finally:
            session.close()

    with ThreadPoolExecutor(PARALLEL) as pool:
        futures = [pool.submit(worker) for _ in range(PARALLEL)]
        return [future.result() for future in futures]


def errors(results: list[object]) -> list[object]:
    return [result for result in results if isinstance(result, Exception)]


def test_parallel_allocation_grants_resources_once(race_game: RaceGame) -> None:
    results = parallel(race_game, lambda s: RoundService(s).allocate_resources(race_game.game_id, 1))

    assert errors(results) == []
    state = race_game.state()
    assert len([e for e in state["ledger"] if e["kind"] == "allocation" and e["round"] == 1]) == 6
    assert race_game.scenario.team("tourism_industry")["resources"] == {"money": 4, "knowledge": 2, "authority": 0}


def test_parallel_payments_cannot_spend_the_same_resources_twice(race_game: RaceGame) -> None:
    scenario = race_game.scenario.open_actions(1)
    water_before = scenario.status("Water")
    request = InvestRequest(
        element_id=scenario.element("Water"),
        payments=[PaymentInput(team=TeamRole.TOURISM_INDUSTRY, money=3)],
    )

    results = parallel(race_game, lambda s: ActionService(s, race_game.dice).invest(race_game.game_id, request))

    assert [type(error) for error in errors(results)] == [InsufficientResourcesError] * (PARALLEL - 1)
    state = race_game.state()
    assert len([a for a in state["actions"] if a["round"] == 1]) == 1
    assert scenario.team("tourism_industry")["resources"] == {"money": 1, "knowledge": 2, "authority": 0}
    assert scenario.status("Water") == water_before + 2


def test_parallel_hazard_resolution_rolls_and_applies_once(race_game: RaceGame) -> None:
    scenario = race_game.scenario.open_actions(1)
    scenario.post("/rounds/1/close-actions")
    race_game.dice.push(6)  # Drought only: Flood's round 1 die was stored by the Round 0 prediction

    results = parallel(race_game, lambda s: HazardService(s, race_game.dice).resolve_hazards(race_game.game_id, 1))

    # A second roll would exhaust the dice and surface here as a RuntimeError.
    assert errors(results) == []
    assert race_game.dice.rolled == [6, 3, 6, 6]
    race_game.state()
    assert [scenario.status(n) for n in ("Beaches", "Hotels", "Nature", "Heritage", "Water")] == [8, 10, 9, 10, 8]


def test_parallel_event_score_and_complete_steps_run_once(race_game: RaceGame) -> None:
    scenario = race_game.scenario.open_actions(1)
    scenario.post("/rounds/1/close-actions")
    race_game.dice.push(6)
    scenario.post("/rounds/1/resolve-hazards")
    game_id = race_game.game_id

    assert errors(parallel(race_game, lambda s: EventService(s).apply_events(game_id, 1))) == []
    assert errors(parallel(race_game, lambda s: ScoringService(s).score_round(game_id, 1))) == []
    assert len([x for x in race_game.state()["scores"] if x["round"] == 1]) == 3
    assert errors(parallel(race_game, lambda s: RoundService(s).complete_round(game_id, 1))) == []

    state = race_game.state()
    assert (state["phase"], state["current_round"]) == ("RESOURCE_ALLOCATION", 2)
    assert sum(e["delta"] for e in state["ledger"] if e["round"] == 1) == 0


def test_parallel_finish_expires_resources_once(race_game: RaceGame) -> None:
    scenario = race_game.scenario.open_actions(1)
    scenario.post("/rounds/1/close-actions")
    race_game.dice.push(6)
    scenario.post("/rounds/1/resolve-hazards")
    scenario.post("/rounds/1/apply-event")
    scenario.post("/rounds/1/score")
    game_id = race_game.game_id

    assert errors(parallel(race_game, lambda s: RoundService(s).finish_game(game_id))) == []

    state = race_game.state()
    assert state["phase"] == "GAME_COMPLETE"
    assert len([e for e in state["ledger"] if e["kind"] == "expiry"]) == 6  # one per team and allowance resource
    assert sum(e["delta"] for e in state["ledger"] if e["round"] == 1) == 0

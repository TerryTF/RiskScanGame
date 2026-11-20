"""Test helper that drives the HTTP API through a standard game scenario."""

from typing import Any

from fastapi.testclient import TestClient

from app.config import Settings
from app.domain.dice import FixedDiceProvider
from app.security import hash_password

State = dict[str, Any]

TEST_USERNAME = "moderator"
TEST_PASSWORD = "correct horse battery"
# A low scrypt cost keeps the suite fast; real hashes use the default cost.
TEST_PASSWORD_HASH = hash_password(TEST_PASSWORD, n=2**4)


def settings_with_login(database_url: str = "sqlite://") -> Settings:
    return Settings(database_url=database_url, auth_username=TEST_USERNAME, auth_password_hash=TEST_PASSWORD_HASH)


def log_in(client: TestClient) -> TestClient:
    response = client.post("/api/v1/auth/login", json={"username": TEST_USERNAME, "password": TEST_PASSWORD})
    assert response.status_code == 200, response.text
    return client


ELEMENTS = ["Beaches", "Hotels", "Nature", "Heritage", "Water"]
HAZARDS = {"Flood": 3, "Drought": 2}
# element -> (Flood, Drought)
VULNERABILITY = {
    "Beaches": (3, 1),
    "Hotels": (2, 0),
    "Nature": (1, 3),
    "Heritage": (0, 1),
    "Water": (2, 2),
}
PRIORITIES = {
    "local_government": (["Beaches", "Hotels"], ["Nature", "Heritage"]),
    "tourism_industry": (["Hotels", "Water"], ["Beaches", "Nature"]),
    "civil_society": (["Nature", "Heritage"], ["Water", "Beaches"]),
}


class Scenario:
    def __init__(self, client: TestClient, dice: FixedDiceProvider) -> None:
        self.client = client
        self.dice = dice
        self.game_id = ""
        self.state: State = {}

    # --- request helpers -------------------------------------------------
    def call(self, method: str, path: str, expected: int = 200, **kwargs: Any) -> State:
        response = self.client.request(method, f"/api/v1/games/{self.game_id}{path}", **kwargs)
        assert response.status_code == expected, f"{method} {path}: {response.status_code} {response.text}"
        body: State = response.json()
        if expected < 300:
            self.state = body
        return body

    def post(self, path: str, expected: int = 200, **json: Any) -> State:
        return self.call("POST", path, expected, json=json or None)

    def put(self, path: str, expected: int = 200, **json: Any) -> State:
        return self.call("PUT", path, expected, json=json)

    # --- id lookups ------------------------------------------------------
    def element(self, name: str) -> int:
        return int(next(e["id"] for e in self.state["elements"] if e["name"] == name))

    def hazard(self, name: str) -> int:
        return int(next(h["id"] for h in self.state["hazards"] if h["name"] == name))

    def team(self, role: str) -> dict[str, Any]:
        return next(t for t in self.state["teams"] if t["role"] == role)

    def status(self, name: str) -> int:
        return int(next(e["status"] for e in self.state["elements"] if e["name"] == name))

    def vulnerability(self, element: str, hazard: str) -> int:
        element_id, hazard_id = self.element(element), self.hazard(hazard)
        return int(
            next(
                v["value"]
                for v in self.state["vulnerabilities"]
                if v["element_id"] == element_id and v["hazard_id"] == hazard_id
            )
        )

    def scores(self, round_number: int) -> dict[str, int]:
        by_id = {t["id"]: t["role"] for t in self.state["teams"]}
        return {by_id[s["team_id"]]: s["score"] for s in self.state["scores"] if s["round"] == round_number}

    # --- setup -----------------------------------------------------------
    def create(self, total_rounds: int = 4) -> "Scenario":
        response = self.client.post(
            "/api/v1/games", json={"destination_name": "Test Island", "total_rounds": total_rounds}
        )
        assert response.status_code == 201, response.text
        self.state = response.json()
        self.game_id = self.state["id"]
        return self

    def setup(self, total_rounds: int = 4) -> "Scenario":
        self.create(total_rounds)
        self.put("/elements", elements=[{"name": n} for n in ELEMENTS])
        self.put("/hazards", hazards=[{"name": n, "probability": p} for n, p in HAZARDS.items()])
        cells = [
            {"element_id": self.element(e), "hazard_id": self.hazard(h), "value": values[i]}
            for e, values in VULNERABILITY.items()
            for i, h in enumerate(HAZARDS)
        ]
        self.put("/vulnerabilities", vulnerabilities=cells)
        self.post("/setup/complete")
        return self

    def setup_custom(
        self,
        elements: list[str] | None = None,
        hazards: dict[str, int] | None = None,
        vulnerability: int = 1,
        total_rounds: int = 4,
    ) -> "Scenario":
        """Like setup(), but with its own elements and hazards and one vulnerability value for every pair."""
        elements = elements or ELEMENTS
        hazards = hazards or HAZARDS
        self.create(total_rounds)
        self.put("/elements", elements=[{"name": n} for n in elements])
        self.put("/hazards", hazards=[{"name": n, "probability": p} for n, p in hazards.items()])
        cells = [
            {"element_id": self.element(e), "hazard_id": self.hazard(h), "value": vulnerability}
            for e in elements
            for h in hazards
        ]
        self.put("/vulnerabilities", vulnerabilities=cells)
        self.post("/setup/complete")
        return self

    def set_priorities(self, priorities: dict[str, tuple[list[str], list[str]]] | None = None) -> "Scenario":
        self.put(
            "/priorities",
            teams=[
                {
                    "role": role,
                    "large": [self.element(n) for n in large],
                    "small": [self.element(n) for n in small],
                }
                for role, (large, small) in (priorities or PRIORITIES).items()
            ],
        )
        return self

    # --- round 0 ---------------------------------------------------------
    def play_round_zero(self, predict_dice: tuple[int, int] = (6, 6), drought_die: int = 6) -> "Scenario":
        """Free tutorial: predict Flood, adapt Beaches/Flood (3->2), invest in Hotels (+2), resolve hazards."""
        self.post("/rounds/0/start")
        self.dice.push(*predict_dice)
        self.post("/actions/predict", hazard_id=self.hazard("Flood"))
        self.post("/actions/adapt", element_id=self.element("Beaches"), hazard_id=self.hazard("Flood"))
        self.post("/actions/invest", element_id=self.element("Hotels"))
        self.dice.push(drought_die)
        self.post("/rounds/0/resolve-hazards")
        self.post("/rounds/0/score")
        self.post("/rounds/0/complete")
        return self

    def ready_for_round_zero(self) -> "Scenario":
        return self.setup().set_priorities()

    # --- regular rounds ----------------------------------------------------
    def open_actions(self, round_number: int) -> "Scenario":
        self.post(f"/rounds/{round_number}/allocate-resources")
        return self

    def finish_round(self, round_number: int, dice_values: tuple[int, ...] = ()) -> "Scenario":
        """Close actions, resolve hazards with the given dice for hazards not yet rolled, event, score, complete."""
        self.post(f"/rounds/{round_number}/close-actions")
        self.dice.push(*dice_values)
        self.post(f"/rounds/{round_number}/resolve-hazards")
        self.post(f"/rounds/{round_number}/apply-event")
        self.post(f"/rounds/{round_number}/score")
        self.post(f"/rounds/{round_number}/complete")
        return self


def pay(**amounts_by_team: dict[str, int]) -> list[dict[str, Any]]:
    """pay(local_government={"authority": 2, "money": 1}, civil_society={"knowledge": 1})"""
    return [{"team": team, **amounts} for team, amounts in amounts_by_team.items()]

import json
from pathlib import Path

from fastapi.testclient import TestClient

from app.config import Settings
from app.domain.dice import FixedDiceProvider
from app.main import create_app
from tests.helpers import ELEMENTS, PRIORITIES, Scenario


def test_health(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_unknown_game_is_404(client: TestClient) -> None:
    assert client.get("/api/v1/games/nope").status_code == 404


def test_openapi_export_is_current() -> None:
    exported = Path(__file__).resolve().parents[2] / "openapi.json"
    schema = create_app(Settings(database_url="sqlite://", auto_migrate=False)).openapi()
    assert json.loads(exported.read_text()) == schema, "Run `python scripts/export_openapi.py` to refresh openapi.json"


class TestSetup:
    def test_create_game_has_three_teams_and_default_transition_event(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = Scenario(client, dice).create(total_rounds=5)
        assert s.state["phase"] == "SETUP"
        assert s.state["total_rounds"] == 5
        assert s.state["current_round"] is None
        assert [t["role"] for t in s.state["teams"]] == ["local_government", "tourism_industry", "civil_society"]
        assert [e["type"] for e in s.state["events"]] == ["transition_pressure"]

    def test_invalid_round_count_is_422(self, client: TestClient) -> None:
        response = client.post("/api/v1/games", json={"destination_name": "X", "total_rounds": 2})
        assert response.status_code == 422

    def test_geographic_scope_defaults_to_region_and_can_be_set(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        assert Scenario(client, dice).create().state["geographic_scope"] == "Region"
        created = client.post(
            "/api/v1/games", json={"destination_name": "Alps", "geographic_scope": " Mountain valley "}
        )
        assert created.status_code == 201
        assert created.json()["geographic_scope"] == "Mountain valley"
        assert client.get(f"/api/v1/games/{created.json()['id']}").json()["geographic_scope"] == "Mountain valley"
        blank = client.post("/api/v1/games", json={"destination_name": "Alps", "geographic_scope": "  "})
        assert blank.status_code == 422

    def test_elements_start_at_status_ten(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).create()
        s.put("/elements", elements=[{"name": n} for n in ELEMENTS])
        assert [e["status"] for e in s.state["elements"]] == [10] * len(ELEMENTS)

    def test_too_few_or_duplicate_elements_rejected(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).create()
        s.put("/elements", 422, elements=[{"name": "A"}, {"name": "B"}])
        s.put("/elements", 422, elements=[{"name": n} for n in ["A", "a", "B", "C"]])

    def test_probability_must_be_between_one_and_six(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).create()
        s.put("/hazards", 422, hazards=[{"name": "Flood", "probability": 7}])
        s.put("/hazards", 422, hazards=[{"name": "Flood", "probability": 0}])

    def test_resetting_elements_keeps_ids_and_drops_removed_vulnerabilities(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = Scenario(client, dice).create()
        s.put("/elements", elements=[{"name": n} for n in ELEMENTS])
        s.put("/hazards", hazards=[{"name": "Flood", "probability": 3}])
        beaches = s.element("Beaches")
        s.put(
            "/vulnerabilities",
            vulnerabilities=[
                {"element_id": s.element(n), "hazard_id": s.hazard("Flood"), "value": 1} for n in ELEMENTS
            ],
        )
        s.put("/elements", elements=[{"name": n} for n in ELEMENTS[:-1] + ["Harbour"]])
        assert s.element("Beaches") == beaches
        assert len(s.state["vulnerabilities"]) == 4

    def test_vulnerability_matrix_must_be_complete_and_in_range(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = Scenario(client, dice).create()
        s.put("/elements", elements=[{"name": n} for n in ELEMENTS])
        s.put("/hazards", hazards=[{"name": "Flood", "probability": 3}])
        hazard = s.hazard("Flood")
        partial = [{"element_id": s.element(n), "hazard_id": hazard, "value": 1} for n in ELEMENTS[:-1]]
        assert "incomplete" in s.put("/vulnerabilities", 422, vulnerabilities=partial)["detail"]
        full = partial + [{"element_id": s.element(ELEMENTS[-1]), "hazard_id": hazard, "value": 4}]
        s.put("/vulnerabilities", 422, vulnerabilities=full)
        full[-1]["value"] = 3
        s.put("/vulnerabilities", vulnerabilities=full)
        assert len(s.state["vulnerabilities"]) == 5

    def test_complete_setup_requires_matrix_then_moves_to_priorities(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = Scenario(client, dice).create()
        s.put("/elements", elements=[{"name": n} for n in ELEMENTS])
        s.put("/hazards", hazards=[{"name": "Flood", "probability": 3}])
        s.post("/setup/complete", 422)
        assert Scenario(client, dice).setup().state["phase"] == "PRIORITIES"

    def test_setup_cannot_change_after_setup_complete(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).setup()
        s.put("/elements", 409, elements=[{"name": n} for n in ELEMENTS])
        s.put("/hazards", 409, hazards=[{"name": "Flood", "probability": 3}])

    def test_team_members_can_be_named(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).create()
        s.put("/teams", teams=[{"role": "civil_society", "members": ["Ada", " Grace "]}])
        assert s.team("civil_society")["members"] == ["Ada", "Grace"]
        s.put("/teams", 422, teams=[{"role": "civil_society"}, {"role": "civil_society"}])

    def test_events_require_one_transition_pressure_in_round_three(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = Scenario(client, dice).setup()
        flood = s.hazard("Flood")
        storm = {
            "round": 2,
            "name": "Storm season",
            "effects": [{"kind": "hazard_probability", "hazard_id": flood, "delta": 1}],
        }
        s.put("/events", 422, events=[storm])
        transition = {
            "round": 3,
            "type": "transition_pressure",
            "name": "Transition",
            "effects": [{"kind": "element_status", "delta": -3}],
        }
        s.put("/events", events=[storm, transition])
        assert [e["name"] for e in s.state["events"]] == ["Storm season", "Transition"]
        bad_target = {**storm, "effects": [{"kind": "hazard_probability", "hazard_id": 9999, "delta": 1}]}
        s.put("/events", 422, events=[bad_target, transition])

    def test_setup_steps_can_be_resubmitted_and_corrected(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).create()
        elements = [{"name": n} for n in ELEMENTS]
        for _ in range(2):
            s.put("/elements", elements=elements)
            s.put("/hazards", hazards=[{"name": "Flood", "probability": 3}])
        flood = s.hazard("Flood")
        cells = [{"element_id": s.element(n), "hazard_id": flood, "value": 1} for n in ELEMENTS]
        for _ in range(2):
            s.put("/vulnerabilities", vulnerabilities=cells)
        cells[0]["value"] = 3
        s.put("/vulnerabilities", vulnerabilities=cells)
        assert s.vulnerability(ELEMENTS[0], "Flood") == 3
        assert len(s.state["vulnerabilities"]) == len(ELEMENTS)

        s.put("/hazards", hazards=[{"name": "Flood", "probability": 5}])
        assert [h["probability"] for h in s.state["hazards"]] == [5]
        assert len(s.state["vulnerabilities"]) == len(ELEMENTS)

        transition = {
            "round": 3,
            "type": "transition_pressure",
            "name": "Transition",
            "effects": [{"kind": "element_status", "delta": -3}],
        }
        for _ in range(2):
            s.put("/events", events=[transition])
            s.put("/teams", teams=[{"role": "civil_society", "members": ["Ada"]}])
        assert [e["name"] for e in s.state["events"]] == ["Transition"]
        assert s.post("/setup/complete")["phase"] == "PRIORITIES"


class TestPriorities:
    def test_priorities_only_in_priorities_phase(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).create()
        s.put("/priorities", 409, teams=[])

    def test_exactly_two_large_and_two_small_per_team(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).setup()
        ids = [s.element(n) for n in ELEMENTS]

        def team(role: str, large: list[int], small: list[int]) -> dict[str, object]:
            return {"role": role, "large": large, "small": small}

        others = [
            team("tourism_industry", ids[:2], ids[2:4]),
            team("civil_society", ids[:2], ids[2:4]),
        ]
        s.put("/priorities", 422, teams=[team("local_government", ids[:3], ids[3:4]), *others])
        s.put("/priorities", 422, teams=[team("local_government", ids[:2], ids[2:3]), *others])

    def test_four_different_elements_per_team(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).setup()
        ids = [s.element(n) for n in ELEMENTS]
        ok = [
            {"role": "tourism_industry", "large": ids[:2], "small": ids[2:4]},
            {"role": "civil_society", "large": ids[:2], "small": ids[2:4]},
        ]
        bad = {"role": "local_government", "large": [ids[0], ids[1]], "small": [ids[1], ids[2]]}
        assert "four different" in s.put("/priorities", 422, teams=[bad, *ok])["detail"]
        unknown = {"role": "local_government", "large": [ids[0], 9999], "small": [ids[2], ids[3]]}
        s.put("/priorities", 422, teams=[unknown, *ok])

    def test_all_three_teams_are_required(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).setup()
        ids = [s.element(n) for n in ELEMENTS]
        one = {"role": "local_government", "large": ids[:2], "small": ids[2:4]}
        s.put("/priorities", 422, teams=[one])

    def test_valid_priorities_are_stored_and_round_zero_needs_them(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = Scenario(client, dice).setup()
        s.post("/rounds/0/start", 422)
        s.set_priorities()
        team = s.team("local_government")
        assert sorted(p["size"] for p in team["priorities"]) == ["large", "large", "small", "small"]
        s.post("/rounds/0/start")
        assert s.state["phase"] == "ROUND0_PREDICTION"

    def test_priorities_can_be_resubmitted_and_changed(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).setup().set_priorities()
        s.set_priorities()  # identical payload again
        # Swap every team's large and small elements: same team/element pairs, different sizes.
        s.put(
            "/priorities",
            teams=[
                {"role": role, "large": [s.element(n) for n in small], "small": [s.element(n) for n in large]}
                for role, (large, small) in PRIORITIES.items()
            ],
        )
        large, small = PRIORITIES["local_government"]
        expected = {(s.element(n), "small") for n in large} | {(s.element(n), "large") for n in small}
        assert {(p["element_id"], p["size"]) for p in s.team("local_government")["priorities"]} == expected
        assert s.post("/rounds/0/start")["phase"] == "ROUND0_PREDICTION"

    def test_unchosen_elements_leave_the_active_destination(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).setup_custom(elements=[*ELEMENTS, "Harbour"])
        assert all(e["active"] for e in s.state["elements"])
        s.set_priorities()
        assert {e["name"]: e["active"] for e in s.state["elements"]} == {
            **dict.fromkeys(ELEMENTS, True),
            "Harbour": False,
        }

    def test_resubmitted_priorities_reactivate_and_deactivate_elements(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = Scenario(client, dice).setup_custom(elements=[*ELEMENTS, "Harbour"]).set_priorities()
        # Nobody picks Water any more, while Tourism Industry and Civil Society now pick the removed Harbour.
        s.set_priorities(
            {
                "local_government": PRIORITIES["local_government"],
                "tourism_industry": (["Hotels", "Harbour"], ["Beaches", "Nature"]),
                "civil_society": (["Nature", "Heritage"], ["Harbour", "Beaches"]),
            }
        )
        active = {e["name"]: e["active"] for e in s.state["elements"]}
        assert active["Harbour"] is True
        assert [name for name, is_active in active.items() if not is_active] == ["Water"]

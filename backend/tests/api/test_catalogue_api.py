from typing import Any

from fastapi.testclient import TestClient

from app.domain import rules
from app.domain.costs import ACTION_COSTS
from app.domain.enums import ActionType, ResourceType, TeamRole


def get_catalogue(client: TestClient) -> dict[str, Any]:
    response = client.get("/api/v1/catalogue")
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def test_catalogue_lists_the_storyboard_elements_and_hazards(client: TestClient) -> None:
    body = get_catalogue(client)
    assert [(g["name"], len(g["elements"])) for g in body["element_groups"]] == [
        ("Tourism activities", 4),
        ("Tourism sector", 4),
        ("Wider destination systems", 11),
    ]
    assert "Tourism businesses" in body["element_groups"][1]["elements"]
    assert body["hazards"] == [
        "Extreme heat",
        "Heat stress",
        "Cold",
        "Changes in precipitation",
        "Extreme precipitation",
        "Short drought",
        "Long drought",
        "Wildfire",
    ]


def test_team_cards_carry_the_round_allowances(client: TestClient) -> None:
    teams = get_catalogue(client)["teams"]
    assert [t["role"] for t in teams] == [role.value for role in TeamRole]
    for team in teams:
        allowance = rules.TEAM_ALLOWANCES[TeamRole(team["role"])]
        assert team["allowance"] == {
            "money": allowance.get(ResourceType.MONEY, 0),
            "knowledge": allowance.get(ResourceType.KNOWLEDGE, 0),
            "authority": allowance.get(ResourceType.AUTHORITY, 0),
        }
        assert team["interests"]


def test_action_cards_match_the_costs_used_for_payment(client: TestClient) -> None:
    cards = {c["key"]: c for c in get_catalogue(client)["actions"]}
    for action_type, cost in ACTION_COSTS.items():
        card = cards[action_type.value]
        assert card["cost"] == {
            "money": cost.specific.money,
            "knowledge": cost.specific.knowledge,
            "authority": cost.specific.authority,
            "wild": cost.wild,
        }
        assert card["available"] is True
    assert cards[ActionType.REDUCE_EMISSIONS.value]["rounds"] == [1, 2]
    assert cards[ActionType.HAZARD_PREDICTION.value]["free_in_round_zero"] is True
    assert cards[ActionType.REDUCE_EMISSIONS.value]["free_in_round_zero"] is False


def test_diversification_is_playable_from_round_one_at_its_fixed_cost(client: TestClient) -> None:
    catalogue = get_catalogue(client)
    card = next(c for c in catalogue["actions"] if c["key"] == "diversification")
    assert card["available"] is True
    assert card["free_in_round_zero"] is False
    assert card["rounds"] is None
    assert card["cost"] == {"money": 2, "knowledge": 1, "authority": 1, "wild": 0}
    assert catalogue["limits"]["diversification_status"] == 7


def test_event_templates_include_the_mandatory_transition_pressure(client: TestClient) -> None:
    templates = {t["key"]: t for t in get_catalogue(client)["event_templates"]}
    assert templates["rising_temperatures"]["suggested_round"] == 1
    assert templates["longer_dry_seasons"]["suggested_round"] == 2
    transition = templates["transition_pressure"]
    assert transition["type"] == "transition_pressure"
    assert transition["suggested_round"] == rules.TRANSITION_PRESSURE_ROUND
    assert transition["effects"] == [
        {"kind": "element_status", "delta": -2, "hazard": None, "element": "Tourism businesses"}
    ]


def test_limits_publish_the_storyboard_guidance(client: TestClient) -> None:
    limits = get_catalogue(client)["limits"]
    assert limits["regular_rounds"] == [4, 5]
    assert limits["default_regular_rounds"] == 4
    assert (limits["hazards_min"], limits["hazards_max"]) == (4, 5)
    assert (limits["probability_min"], limits["probability_max"]) == (1, 6)
    assert (limits["vulnerability_min"], limits["vulnerability_max"]) == (0, 3)
    assert limits["starting_status"] == 10
    assert limits["events_per_round_max"] == 2
    assert limits["round_zero_damage_limit"] == 2
    assert limits["reduce_emissions_rounds"] == [1, 2]
    assert (limits["local_investment_gain"], limits["adaptation_reduction"]) == (2, 1)

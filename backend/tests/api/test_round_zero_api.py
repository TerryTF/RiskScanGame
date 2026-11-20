import pytest
from fastapi.testclient import TestClient

from app.domain.dice import FixedDiceProvider
from tests.helpers import Scenario, pay


def ready(client: TestClient, dice: FixedDiceProvider) -> Scenario:
    return Scenario(client, dice).ready_for_round_zero()


def test_round_zero_runs_as_guided_sequence(client: TestClient, dice: FixedDiceProvider) -> None:
    s = ready(client, dice)
    assert s.post("/rounds/0/start")["phase"] == "ROUND0_PREDICTION"
    dice.push(2, 5)
    assert s.post("/actions/predict", hazard_id=s.hazard("Flood"))["phase"] == "ROUND0_ADAPTATION"
    assert s.post("/actions/adapt", element_id=s.element("Beaches"), hazard_id=s.hazard("Flood"))["phase"] == (
        "ROUND0_INVESTMENT"
    )
    assert s.post("/actions/invest", element_id=s.element("Hotels"))["phase"] == "ROUND0_HAZARDS"
    dice.push(6)
    assert s.post("/rounds/0/resolve-hazards")["phase"] == "SCORING"
    assert s.post("/rounds/0/score")["phase"] == "ROUND_COMPLETE"
    s.post("/rounds/0/complete")
    assert (s.state["phase"], s.state["current_round"]) == ("RESOURCE_ALLOCATION", 1)


def test_round_zero_start_is_idempotent(client: TestClient, dice: FixedDiceProvider) -> None:
    s = ready(client, dice)
    s.post("/rounds/0/start")
    dice.push(1, 1)
    s.post("/actions/predict", hazard_id=s.hazard("Flood"))
    assert s.post("/rounds/0/start")["phase"] == "ROUND0_ADAPTATION"


def test_prediction_stores_current_and_next_dice_and_applies_no_damage(
    client: TestClient, dice: FixedDiceProvider
) -> None:
    s = ready(client, dice)
    s.post("/rounds/0/start")
    dice.push(2, 5)
    s.post("/actions/predict", hazard_id=s.hazard("Flood"))
    rolls = s.state["hazard_rolls"]
    assert [(r["round"], r["die"], r["source"], r["resolved"]) for r in rolls] == [
        (0, 2, "predicted", False),
        (1, 5, "predicted", False),
    ]
    assert all(e["status"] == 10 for e in s.state["elements"])
    assert s.state["actions"][0]["free"] is True
    assert s.state["actions"][0]["cost"] == {}


def test_actions_must_follow_tutorial_order(client: TestClient, dice: FixedDiceProvider) -> None:
    s = ready(client, dice)
    s.post("/actions/predict", 409, hazard_id=s.hazard("Flood"))  # before round 0 starts
    s.post("/rounds/0/start")
    s.post("/actions/invest", 409, element_id=s.element("Hotels"))
    s.post("/actions/adapt", 409, element_id=s.element("Beaches"), hazard_id=s.hazard("Flood"))
    s.post("/actions/reduce-emissions", 409)
    s.post("/rounds/0/resolve-hazards", 409)
    s.post("/rounds/0/close-actions", 409)


def test_round_zero_actions_are_free_and_reject_payments(client: TestClient, dice: FixedDiceProvider) -> None:
    s = ready(client, dice)
    s.post("/rounds/0/start")
    dice.push(1, 1)
    body = s.post(
        "/actions/predict",
        422,
        hazard_id=s.hazard("Flood"),
        payments=[{"team": "civil_society", "knowledge": 2}],
    )
    assert "free" in body["detail"]
    assert s.state["phase"] == "ROUND0_PREDICTION"
    assert dice.rolled == []


def test_round_zero_hazards_reuse_prediction_and_apply_damage(client: TestClient, dice: FixedDiceProvider) -> None:
    s = ready(client, dice)
    s.post("/rounds/0/start")
    dice.push(3, 5)  # Flood: round 0 die 3 (<= 3 triggers), round 1 die 5
    s.post("/actions/predict", hazard_id=s.hazard("Flood"))
    s.post("/actions/adapt", element_id=s.element("Beaches"), hazard_id=s.hazard("Flood"))
    s.post("/actions/invest", element_id=s.element("Hotels"))
    assert s.vulnerability("Beaches", "Flood") == 2
    assert s.status("Hotels") == 12
    dice.push(6)  # only Drought needs a roll; Flood must reuse the predicted 3
    s.post("/rounds/0/resolve-hazards")

    assert dice.rolled == [3, 5, 6]
    flood = next(r for r in s.state["hazard_rolls"] if r["round"] == 0 and r["hazard_id"] == s.hazard("Flood"))
    assert (flood["die"], flood["source"], flood["triggered"], flood["resolved"]) == (3, "predicted", True, True)
    drought = next(r for r in s.state["hazard_rolls"] if r["round"] == 0 and r["hazard_id"] == s.hazard("Drought"))
    assert (drought["die"], drought["source"], drought["triggered"]) == (6, "rolled", False)
    # Flood vulnerability: Beaches 2 (adapted), Hotels 2, Nature 1, Heritage 0, Water 2
    assert [s.status(n) for n in ("Beaches", "Hotels", "Nature", "Heritage", "Water")] == [8, 10, 9, 10, 8]


def test_round_zero_changes_persist_into_round_one(client: TestClient, dice: FixedDiceProvider) -> None:
    s = ready(client, dice).play_round_zero(predict_dice=(3, 6), drought_die=6)
    s.post("/rounds/1/allocate-resources")
    assert s.vulnerability("Beaches", "Flood") == 2
    assert s.status("Hotels") == 10  # 12 after investment, minus Flood damage 2
    assert s.state["phase"] == "ACTION_PHASE"
    assert len(s.state["actions"]) == 3


def test_round_zero_resolution_and_completion_are_idempotent(client: TestClient, dice: FixedDiceProvider) -> None:
    s = ready(client, dice).play_round_zero(predict_dice=(1, 1), drought_die=1)
    before = s.state
    assert s.post("/rounds/0/resolve-hazards") == before
    assert s.post("/rounds/0/complete") == before
    assert dice.rolled == [1, 1, 1]


def test_round_zero_has_no_events_and_cannot_be_scored_early(client: TestClient, dice: FixedDiceProvider) -> None:
    s = ready(client, dice)
    s.post("/rounds/0/start")
    s.post("/rounds/0/apply-event", 409)
    s.post("/rounds/0/score", 409)


def test_round_zero_is_scored_after_its_hazards(client: TestClient, dice: FixedDiceProvider) -> None:
    s = ready(client, dice)
    s.post("/rounds/0/start")
    dice.push(3, 6)
    s.post("/actions/predict", hazard_id=s.hazard("Flood"))
    s.post("/actions/adapt", element_id=s.element("Beaches"), hazard_id=s.hazard("Flood"))
    s.post("/actions/invest", element_id=s.element("Hotels"))
    dice.push(6)
    assert s.post("/rounds/0/resolve-hazards")["scores"] == []
    s.post("/rounds/0/complete", 409)  # the scores must be revealed first

    scored = s.post("/rounds/0/score")
    assert scored["phase"] == "ROUND_COMPLETE"
    assert set(s.scores(0)) == {"local_government", "tourism_industry", "civil_society"}
    assert s.post("/rounds/0/score") == scored


def test_round_zero_only_the_first_two_triggered_hazards_deal_damage(
    client: TestClient, dice: FixedDiceProvider
) -> None:
    # Probability 6 means every die triggers, so the cap is the only thing limiting damage.
    s = Scenario(client, dice).setup_custom(hazards={"Heat": 6, "Cold": 6, "Flood": 6, "Fire": 6}).set_priorities()
    s.post("/rounds/0/start")
    dice.push(2, 4)  # Heat for rounds 0 and 1
    s.post("/actions/predict", hazard_id=s.hazard("Heat"))
    s.post("/actions/adapt", element_id=s.element("Beaches"), hazard_id=s.hazard("Heat"))
    s.post("/actions/invest", element_id=s.element("Hotels"))
    dice.push(1, 2, 3)  # Cold, Flood, Fire
    s.post("/rounds/0/resolve-hazards")

    names = {h["id"]: h["name"] for h in s.state["hazards"]}
    rolls = [r for r in s.state["hazard_rolls"] if r["round"] == 0]
    assert [(names[r["hazard_id"]], r["triggered"], r["applied"]) for r in rolls] == [
        ("Heat", True, True),
        ("Cold", True, True),
        ("Flood", True, False),
        ("Fire", True, False),
    ]
    assert all(r["damages"] == [] for r in rolls[2:])
    # Heat: Beaches adapted to 0, the others lose 1. Cold: everything loses 1. Flood and Fire are skipped.
    assert [s.status(n) for n in ("Beaches", "Hotels", "Nature", "Heritage", "Water")] == [9, 10, 8, 8, 8]

    # The practice-round cap does not carry into regular rounds: all four hazards deal damage in Round 1.
    s.post("/rounds/0/score")
    s.post("/rounds/0/complete")
    s.open_actions(1)
    s.finish_round(1, dice_values=(1, 1, 1))  # Heat's Round 1 die (4) was predicted
    round_one = [r for r in s.state["hazard_rolls"] if r["round"] == 1]
    assert [(r["triggered"], r["applied"]) for r in round_one] == [(True, True)] * 4
    assert [s.status(n) for n in ("Beaches", "Hotels", "Nature", "Heritage", "Water")] == [6, 6, 4, 4, 4]


def test_round_zero_cap_does_not_apply_with_two_or_fewer_hazards(client: TestClient, dice: FixedDiceProvider) -> None:
    s = ready(client, dice)
    s.post("/rounds/0/start")
    dice.push(1, 1)
    s.post("/actions/predict", hazard_id=s.hazard("Flood"))
    s.post("/actions/adapt", element_id=s.element("Beaches"), hazard_id=s.hazard("Flood"))
    s.post("/actions/invest", element_id=s.element("Hotels"))
    dice.push(1)
    s.post("/rounds/0/resolve-hazards")
    assert [(r["triggered"], r["applied"]) for r in s.state["hazard_rolls"] if r["round"] == 0] == [(True, True)] * 2


@pytest.mark.parametrize("start_first", [False, True], ids=["from_priorities", "from_introduction"])
def test_round_zero_can_be_skipped_to_go_straight_to_round_one(
    client: TestClient, dice: FixedDiceProvider, start_first: bool
) -> None:
    s = ready(client, dice)
    if start_first:
        s.post("/rounds/0/start")
    body = s.post("/rounds/0/skip")

    assert (body["phase"], body["current_round"]) == ("RESOURCE_ALLOCATION", 1)
    # Nothing from the practice round happened: no actions, dice or changes.
    assert (body["actions"], body["hazard_rolls"]) == ([], [])
    assert all(e["status"] == 10 for e in body["elements"])
    assert s.vulnerability("Beaches", "Flood") == 3  # Round 0 would have adapted it to 2


@pytest.mark.parametrize("start_first", [False, True], ids=["from_priorities", "from_introduction"])
def test_round_one_plays_normally_after_skipping_round_zero(
    client: TestClient, dice: FixedDiceProvider, start_first: bool
) -> None:
    s = ready(client, dice)
    if start_first:
        s.post("/rounds/0/start")
    s.post("/rounds/0/skip")
    s.open_actions(1)
    s.post("/actions/invest", element_id=s.element("Water"), payments=pay(tourism_industry={"money": 3}))
    s.finish_round(1, dice_values=(6, 6))  # nothing was predicted, so both hazards roll in Round 1

    assert dice.rolled == [6, 6]
    assert (s.state["phase"], s.state["current_round"]) == ("RESOURCE_ALLOCATION", 2)
    assert s.status("Water") == 12
    assert set(s.scores(1)) == {"local_government", "tourism_industry", "civil_society"}


def test_round_zero_cannot_be_skipped_before_the_priorities_are_set(
    client: TestClient, dice: FixedDiceProvider
) -> None:
    s = Scenario(client, dice).setup()
    s.post("/rounds/0/skip", 422)
    assert s.call("GET", "")["phase"] == "PRIORITIES"
    s.set_priorities()
    s.post("/rounds/0/skip")


def test_round_zero_cannot_be_skipped_during_setup(client: TestClient, dice: FixedDiceProvider) -> None:
    s = Scenario(client, dice).create()
    s.post("/rounds/0/skip", 409)
    assert s.call("GET", "")["phase"] == "SETUP"


def test_round_zero_cannot_be_skipped_once_practice_has_begun(client: TestClient, dice: FixedDiceProvider) -> None:
    s = ready(client, dice)
    s.post("/rounds/0/start")
    dice.push(2, 5)
    s.post("/actions/predict", hazard_id=s.hazard("Flood"))

    assert "before its first practice action" in s.post("/rounds/0/skip", 409)["detail"]
    assert s.call("GET", "")["phase"] == "ROUND0_ADAPTATION"


def test_skipping_round_zero_is_idempotent_and_starting_it_afterwards_does_nothing(
    client: TestClient, dice: FixedDiceProvider
) -> None:
    s = ready(client, dice)
    skipped = s.post("/rounds/0/skip")

    assert s.post("/rounds/0/skip") == skipped
    assert s.post("/rounds/0/start") == skipped

    played = ready(client, dice).play_round_zero()
    before = played.state
    assert played.post("/rounds/0/skip") == before  # Round 0 was already played

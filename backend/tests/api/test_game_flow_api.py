from pathlib import Path

from fastapi.testclient import TestClient

from app.domain.dice import FixedDiceProvider
from app.main import create_app
from tests.helpers import ELEMENTS, Scenario, log_in, pay, settings_with_login

REDUCE = pay(tourism_industry={"money": 1, "knowledge": 1}, local_government={"authority": 1})
HARMLESS = (6, 6)


def started(client: TestClient, dice: FixedDiceProvider, total_rounds: int = 4) -> Scenario:
    s = Scenario(client, dice).setup(total_rounds).set_priorities().play_round_zero()
    return s


def play_regular_round(s: Scenario, round_number: int, reduce_emissions: bool = False) -> None:
    s.open_actions(round_number)
    if reduce_emissions:
        s.post("/actions/reduce-emissions", payments=REDUCE)
    # Flood's die for round 1 was stored by the Round 0 prediction, so round 1 only rolls Drought.
    s.finish_round(round_number, dice_values=(6,) if round_number == 1 else HARMLESS)


class TestScoring:
    def test_score_uses_double_for_large_and_single_for_small(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = started(client, dice)  # Hotels 12 after the Round 0 investment, everything else 10
        play_regular_round(s, 1)
        assert s.scores(1) == {"local_government": 64, "tourism_industry": 64, "civil_society": 60}
        lg = next(x for x in s.state["scores"] if x["team_id"] == s.team("local_government")["id"])
        assert (lg["large_total"], lg["small_total"]) == (44, 20)

    def test_scores_are_snapshots_not_accumulated(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = started(client, dice)
        play_regular_round(s, 1)
        play_regular_round(s, 2)
        assert s.scores(1) == s.scores(2) == {"local_government": 64, "tourism_industry": 64, "civil_society": 60}

    def test_score_reflects_damage_and_investment_of_that_round(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = started(client, dice)
        s.open_actions(1)
        s.post("/actions/invest", element_id=s.element("Beaches"), payments=pay(tourism_industry={"money": 3}))
        s.finish_round(1, dice_values=(6,))
        # Beaches 12: LG large (x2) -> +4, TI small (x1) -> +2, CS small (x1) -> +2
        assert s.scores(1) == {"local_government": 68, "tourism_industry": 66, "civil_society": 62}


class TestEvents:
    def test_standard_event_changes_probability_vulnerability_and_status(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = Scenario(client, dice).setup().set_priorities()
        flood, hotels, water = s.hazard("Flood"), s.element("Hotels"), s.element("Water")
        transition = {
            "round": 3,
            "type": "transition_pressure",
            "name": "Transition",
            "effects": [{"kind": "element_status", "delta": -2}],
        }
        storm = {
            "round": 1,
            "name": "Storm season",
            "effects": [
                {"kind": "hazard_probability", "hazard_id": flood, "delta": 2},
                {"kind": "vulnerability", "hazard_id": flood, "element_id": hotels, "delta": 5},
                {"kind": "element_status", "element_id": water, "delta": -3},
            ],
        }
        s.put("/events", events=[storm, transition])
        s.play_round_zero().open_actions(1)
        s.finish_round(1, dice_values=(6,))

        event = next(e for e in s.state["events"] if e["name"] == "Storm season")
        assert event["status"] == "applied"
        assert {(c["kind"], c["before"], c["after"]) for c in event["applied_changes"]} == {
            ("hazard_probability", 3, 5),
            ("vulnerability", 2, 3),  # clamped at 3
            ("element_status", 10, 7),
        }
        assert next(h for h in s.state["hazards"] if h["id"] == flood)["probability"] == 5
        assert s.vulnerability("Hotels", "Flood") == 3
        assert s.status("Water") == 7

    def test_new_probability_is_used_for_later_rolls(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).setup().set_priorities()
        flood = s.hazard("Flood")
        s.put(
            "/events",
            events=[
                {
                    "round": 1,
                    "name": "Wetter climate",
                    "effects": [{"kind": "hazard_probability", "hazard_id": flood, "delta": 1}],
                },
                {
                    "round": 3,
                    "type": "transition_pressure",
                    "name": "Transition",
                    "effects": [{"kind": "element_status", "delta": -2}],
                },
            ],
        )
        s.play_round_zero().open_actions(1).finish_round(1, dice_values=(6,))
        s.open_actions(2)
        s.finish_round(2, dice_values=(4, 6))  # Flood 4 triggers only because probability is now 4
        flood_roll = next(r for r in s.state["hazard_rolls"] if r["round"] == 2 and r["hazard_id"] == flood)
        assert (flood_roll["die"], flood_roll["probability_at_roll"], flood_roll["triggered"]) == (4, 4, True)

    def test_events_apply_after_hazard_damage(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = started(client, dice)
        s.open_actions(1)
        s.post("/rounds/1/close-actions")
        s.post("/rounds/1/apply-event", 409)  # hazards not resolved yet
        dice.push(6)
        s.post("/rounds/1/resolve-hazards")
        assert s.post("/rounds/1/apply-event")["phase"] == "SCORING"


class TestTransitionPressure:
    def test_penalty_avoided_when_reduce_emissions_is_two_of_two(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = started(client, dice)
        play_regular_round(s, 1, reduce_emissions=True)
        play_regular_round(s, 2, reduce_emissions=True)
        before = {e["id"]: e["status"] for e in s.state["elements"]}
        play_regular_round(s, 3)
        transition = next(e for e in s.state["events"] if e["type"] == "transition_pressure")
        assert (transition["status"], transition["applied_changes"]) == ("avoided", [])
        assert {e["id"]: e["status"] for e in s.state["elements"]} == before
        assert s.state["reduce_emissions_progress"] == 2

    def test_penalty_applied_when_only_one_of_two(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = started(client, dice)
        play_regular_round(s, 1, reduce_emissions=True)
        play_regular_round(s, 2)
        before = {e["name"]: e["status"] for e in s.state["elements"]}
        play_regular_round(s, 3)
        transition = next(e for e in s.state["events"] if e["type"] == "transition_pressure")
        assert transition["status"] == "applied"
        assert {e["name"]: e["status"] for e in s.state["elements"]} == {n: v - 2 for n, v in before.items()}

    def test_penalty_applied_when_never_funded(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = started(client, dice)
        for round_number in (1, 2, 3):
            play_regular_round(s, round_number)
        assert next(e for e in s.state["events"] if e["type"] == "transition_pressure")["status"] == "applied"


class TestInactiveElements:
    def test_unchosen_element_is_untouched_by_hazards_events_and_actions(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = Scenario(client, dice).setup_custom(elements=[*ELEMENTS, "Harbour"]).set_priorities()
        heat_wave = {"round": 1, "name": "Heat wave", "effects": [{"kind": "element_status", "delta": -3}]}
        transition = {
            "round": 3,
            "type": "transition_pressure",
            "name": "Transition",
            "effects": [{"kind": "element_status", "delta": -2}],
        }
        s.put("/events", events=[heat_wave, transition])
        s.play_round_zero(predict_dice=(3, 6), drought_die=6)  # Flood triggers in Round 0
        s.open_actions(1)
        s.finish_round(1, dice_values=(6,))

        # Flood took 1 from every active element except the adapted Beaches (Hotels also gained 2); the event took 3.
        assert [s.status(n) for n in ELEMENTS] == [7, 8, 6, 6, 6]
        assert s.status("Harbour") == 10
        harbour = s.element("Harbour")
        assert all(d["element_id"] != harbour for r in s.state["hazard_rolls"] for d in r["damages"])
        assert all(c["element_id"] != harbour for e in s.state["events"] for c in e["applied_changes"])

        s.open_actions(2)
        detail = s.post("/actions/invest", 422, element_id=harbour, payments=pay(tourism_industry={"money": 3}))[
            "detail"
        ]
        assert "inactive" in detail


class TestFinishGame:
    @staticmethod
    def score_without_completing(s: Scenario, round_number: int, dice_values: tuple[int, ...]) -> None:
        s.post(f"/rounds/{round_number}/close-actions")
        s.dice.push(*dice_values)
        s.post(f"/rounds/{round_number}/resolve-hazards")
        s.post(f"/rounds/{round_number}/apply-event")
        s.post(f"/rounds/{round_number}/score")

    def test_finish_after_round_one_uses_its_scores_and_expires_resources(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = started(client, dice)
        s.open_actions(1)
        self.score_without_completing(s, 1, (6,))
        assert s.state["phase"] == "ROUND_COMPLETE"

        done = s.post("/finish")
        assert done["phase"] == "GAME_COMPLETE"
        assert done["current_round"] == 1
        assert s.scores(1) == {"local_government": 64, "tourism_industry": 64, "civil_society": 60}
        assert set(done["winners"]) == {s.team("local_government")["id"], s.team("tourism_industry")["id"]}
        assert sum(e["delta"] for e in done["ledger"] if e["round"] == 1) == 0
        assert s.post("/finish") == done  # idempotent
        s.post("/rounds/2/allocate-resources", 409)
        s.post("/actions/invest", 409, element_id=s.element("Water"), payments=pay(tourism_industry={"money": 3}))

    def test_winner_comes_from_the_last_scored_round_not_the_planned_final_round(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = started(client, dice)
        play_regular_round(s, 1)
        s.open_actions(2)
        s.post("/actions/invest", element_id=s.element("Beaches"), payments=pay(tourism_industry={"money": 3}))
        self.score_without_completing(s, 2, (6, 6))

        s.post("/finish")
        assert s.state["total_rounds"] == 4
        assert s.scores(2) == {"local_government": 68, "tourism_industry": 66, "civil_society": 62}
        assert s.state["winners"] == [s.team("local_government")["id"]]

    def test_finish_is_rejected_until_a_regular_round_is_scored(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = Scenario(client, dice).setup().set_priorities()
        s.post("/finish", 409)  # setup not finished
        s.post("/rounds/0/start")
        s.post("/finish", 409)  # Round 0 in progress
        dice.push(6, 6)
        s.post("/actions/predict", hazard_id=s.hazard("Flood"))
        s.post("/actions/adapt", element_id=s.element("Beaches"), hazard_id=s.hazard("Flood"))
        s.post("/actions/invest", element_id=s.element("Hotels"))
        dice.push(6)
        s.post("/rounds/0/resolve-hazards")
        assert s.state["phase"] == "SCORING"
        s.post("/finish", 409)  # Round 0 is practice only
        s.post("/rounds/0/score")
        assert s.state["phase"] == "ROUND_COMPLETE"
        s.post("/finish", 409)
        s.post("/rounds/0/complete")
        s.open_actions(1)
        s.post("/finish", 409)  # Round 1 still in its action phase
        assert s.state["phase"] == "ACTION_PHASE"

    def test_finish_after_the_last_round_changes_nothing(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = started(client, dice, total_rounds=3)
        for round_number in (1, 2, 3):
            play_regular_round(s, round_number)
        done = s.state
        assert done["phase"] == "GAME_COMPLETE"
        assert s.post("/finish") == done


class TestFullGame:
    def test_four_round_game_to_final_winner(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = started(client, dice)
        play_regular_round(s, 1, reduce_emissions=True)
        play_regular_round(s, 2, reduce_emissions=True)
        play_regular_round(s, 3)
        s.open_actions(4)
        s.post("/actions/invest", element_id=s.element("Beaches"), payments=pay(tourism_industry={"money": 3}))
        s.finish_round(4, dice_values=HARMLESS)

        assert s.state["phase"] == "GAME_COMPLETE"
        assert s.state["current_round"] == 4
        assert s.scores(4) == {"local_government": 68, "tourism_industry": 66, "civil_society": 62}
        assert s.state["winners"] == [s.team("local_government")["id"]]
        # resources of the final round expired as well
        assert sum(e["delta"] for e in s.state["ledger"] if e["round"] == 4) == 0

    def test_game_complete_rejects_further_play_but_repeats_are_harmless(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = started(client, dice, total_rounds=3)
        for round_number in (1, 2, 3):
            play_regular_round(s, round_number)
        done = s.state
        assert done["phase"] == "GAME_COMPLETE"
        assert s.post("/rounds/3/complete") == done
        s.post("/actions/invest", 409, element_id=s.element("Water"), payments=pay(tourism_industry={"money": 3}))
        s.post("/rounds/4/allocate-resources", 409)

    def test_state_is_persisted_between_requests(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = started(client, dice)
        s.open_actions(1)
        assert s.call("GET", "") == s.state

    def test_state_survives_an_application_restart_on_a_file_database(
        self, dice: FixedDiceProvider, tmp_path: Path
    ) -> None:
        settings = settings_with_login(f"sqlite:///{tmp_path / 'riskscan.db'}")
        with TestClient(create_app(settings, dice_provider=dice)) as first:
            s = Scenario(log_in(first), dice).setup().set_priorities()
            saved = s.state
        with TestClient(create_app(settings, dice_provider=dice)) as second:
            assert second.get(f"/api/v1/games/{saved['id']}").json() == saved

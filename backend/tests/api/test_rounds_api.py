from typing import Any

from fastapi.testclient import TestClient

from app.domain.dice import FixedDiceProvider
from tests.helpers import Scenario, pay


def round_one(client: TestClient, dice: FixedDiceProvider, flood_round_one_die: int = 6) -> Scenario:
    """Round 0 played (Flood predicted: round 1 die is stored); Round 1 resources allocated, actions open.

    Only Drought still needs a die in Round 1.
    """
    s = Scenario(client, dice).ready_for_round_zero().play_round_zero(predict_dice=(6, flood_round_one_die))
    return s.open_actions(1)


def resources(s: Scenario, role: str) -> tuple[int, int, int]:
    r = s.team(role)["resources"]
    return r["money"], r["knowledge"], r["authority"]


def markers(s: Scenario, role: str) -> dict[str, str]:
    """A team's priority markers as element name -> size."""
    names = {e["id"]: e["name"] for e in s.state["elements"]}
    return {names[p["element_id"]]: p["size"] for p in s.team(role)["priorities"]}


class TestResources:
    def test_allocation_gives_each_team_its_allowance_once(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        assert s.state["phase"] == "ACTION_PHASE"
        assert resources(s, "local_government") == (2, 0, 4)
        assert resources(s, "tourism_industry") == (4, 2, 0)
        assert resources(s, "civil_society") == (0, 4, 2)
        s.post("/rounds/1/allocate-resources")
        assert resources(s, "local_government") == (2, 0, 4)

    def test_actions_rejected_before_allocation(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).ready_for_round_zero().play_round_zero()
        s.post("/actions/invest", 409, element_id=s.element("Hotels"), payments=pay(tourism_industry={"money": 3}))

    def test_unused_resources_expire_at_round_completion(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        s.finish_round(1, dice_values=(6,))
        assert s.state["current_round"] == 2
        assert resources(s, "tourism_industry") == (0, 0, 0)  # round 2 not allocated yet
        expiries = [e for e in s.state["ledger"] if e["kind"] == "expiry"]
        assert sum(e["delta"] for e in expiries) == -18  # 3 teams x 6 unused resources
        net_round_one = sum(e["delta"] for e in s.state["ledger"] if e["round"] == 1)
        assert net_round_one == 0
        s.open_actions(2)
        assert resources(s, "tourism_industry") == (4, 2, 0)

    def test_spending_is_recorded_in_ledger_and_contributions(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        s.post("/actions/invest", element_id=s.element("Water"), payments=pay(tourism_industry={"money": 3}))
        assert resources(s, "tourism_industry") == (1, 2, 0)
        action = s.state["actions"][-1]
        assert action["free"] is False
        assert action["cost"] == {
            "specific": {"money": 1, "knowledge": 0, "authority": 0},
            "wild": {"money": 2, "knowledge": 0, "authority": 0},
        }
        tourism = s.team("tourism_industry")["id"]
        assert action["contributions"] == [{"team_id": tourism, "resource": "money", "amount": 3}]
        spends = [e for e in s.state["ledger"] if e["kind"] == "spend"]
        assert [(e["team_id"], e["resource"], e["delta"], e["action_id"]) for e in spends] == [
            (tourism, "money", -3, action["id"])
        ]


class TestActions:
    def test_prediction_costs_knowledge_plus_wild_and_stores_dice(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        dice.push(2, 4)  # Drought for rounds 1 and 2
        s.post(
            "/actions/predict",
            hazard_id=s.hazard("Drought"),
            payments=pay(civil_society={"knowledge": 1}, tourism_industry={"money": 1}),
        )
        rolls = [r for r in s.state["hazard_rolls"] if r["hazard_id"] == s.hazard("Drought") and r["round"] >= 1]
        assert [(r["round"], r["die"], r["resolved"]) for r in rolls] == [(1, 2, False), (2, 4, False)]
        assert resources(s, "civil_society") == (0, 3, 2)
        assert resources(s, "tourism_industry") == (3, 2, 0)
        assert s.state["actions"][-1]["cost"]["wild"]["money"] == 1

    def test_predicted_dice_are_reused_not_rerolled(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        dice.push(1, 5)
        s.post("/actions/predict", hazard_id=s.hazard("Drought"), payments=pay(civil_society={"knowledge": 2}))
        s.post("/rounds/1/close-actions")
        s.post("/rounds/1/resolve-hazards")
        drought = next(r for r in s.state["hazard_rolls"] if r["round"] == 1 and r["hazard_id"] == s.hazard("Drought"))
        assert (drought["die"], drought["triggered"]) == (1, True)
        assert dice.rolled == [6, 6, 6, 1, 5]  # nothing is rolled at resolution: both dice were stored

    def test_repeating_a_prediction_never_rerolls(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        dice.push(1, 5)
        s.post("/actions/predict", hazard_id=s.hazard("Drought"), payments=pay(civil_society={"knowledge": 2}))
        s.post("/actions/predict", hazard_id=s.hazard("Drought"), payments=pay(civil_society={"knowledge": 2}))
        assert dice.rolled[-2:] == [1, 5]
        results = s.state["actions"][-1]["result"]["rolls"]
        assert [(r["die"], r["newly_rolled"]) for r in results] == [(1, False), (5, False)]

    def test_adaptation_reduces_vulnerability_from_three_to_two(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        assert s.vulnerability("Nature", "Drought") == 3
        s.post(
            "/actions/adapt",
            element_id=s.element("Nature"),
            hazard_id=s.hazard("Drought"),
            payments=pay(local_government={"money": 1, "authority": 2}, civil_society={"knowledge": 1}),
        )
        assert s.vulnerability("Nature", "Drought") == 2
        assert s.state["actions"][-1]["result"] == {"vulnerability_before": 3, "vulnerability_after": 2}

    def test_adaptation_never_goes_below_zero(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        assert s.vulnerability("Hotels", "Drought") == 0
        s.post(
            "/actions/adapt",
            element_id=s.element("Hotels"),
            hazard_id=s.hazard("Drought"),
            payments=pay(local_government={"money": 1, "authority": 2}, civil_society={"knowledge": 1}),
        )
        assert s.vulnerability("Hotels", "Drought") == 0

    def test_investment_adds_two_status(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        before = s.status("Water")
        s.post("/actions/invest", element_id=s.element("Water"), payments=pay(tourism_industry={"money": 3}))
        assert s.status("Water") == before + 2

    def test_teams_can_collaborate_to_fund_one_action(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        s.post(
            "/actions/invest",
            element_id=s.element("Water"),
            payments=pay(local_government={"authority": 1, "money": 1}, tourism_industry={"money": 1}),
        )
        assert resources(s, "local_government") == (1, 0, 3)
        assert resources(s, "tourism_industry") == (3, 2, 0)
        assert len(s.state["actions"][-1]["contributions"]) == 3

    def test_insufficient_resources_are_rejected_without_partial_deduction(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        before_ledger = len(s.state["ledger"])
        before_actions = len(s.state["actions"])
        status = s.status("Water")
        # LG has only 2 money, so its 3-money contribution must be refused as a whole.
        body = s.post(
            "/actions/invest",
            409,
            element_id=s.element("Water"),
            payments=pay(local_government={"money": 3}),
        )
        assert "cannot contribute" in body["detail"]
        state = s.call("GET", "")
        assert len(state["ledger"]) == before_ledger
        assert len(state["actions"]) == before_actions
        assert resources(s, "tourism_industry") == (4, 2, 0)
        assert resources(s, "local_government") == (2, 0, 4)
        assert s.status("Water") == status

    def test_payment_must_match_cost(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        element = s.element("Water")
        s.post("/actions/invest", 422, element_id=element, payments=pay(tourism_industry={"money": 2}))
        s.post("/actions/invest", 422, element_id=element, payments=pay(tourism_industry={"money": 4}))
        s.post("/actions/invest", 422, element_id=element)
        s.post("/actions/invest", 422, element_id=element, payments=pay(tourism_industry={"knowledge": 3}))
        assert resources(s, "tourism_industry") == (4, 2, 0)

    def test_unknown_targets_are_422(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        s.post("/actions/invest", 422, element_id=9999, payments=pay(tourism_industry={"money": 3}))
        s.post("/actions/predict", 422, hazard_id=9999, payments=pay(civil_society={"knowledge": 2}))

    def test_actions_rejected_after_close_actions(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        s.post("/rounds/1/close-actions")
        s.post("/actions/invest", 409, element_id=s.element("Water"), payments=pay(tourism_industry={"money": 3}))


class TestReduceEmissions:
    def pay_once(self, s: Scenario, expected: int = 200) -> None:
        s.post(
            "/actions/reduce-emissions",
            expected,
            payments=pay(tourism_industry={"money": 1, "knowledge": 1}, local_government={"authority": 1}),
        )

    def test_available_once_in_rounds_one_and_two(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        self.pay_once(s)
        assert s.state["reduce_emissions_progress"] == 1
        self.pay_once(s, 409)
        s.finish_round(1, dice_values=(6,))
        s.open_actions(2)
        self.pay_once(s)
        assert s.state["reduce_emissions_progress"] == 2

    def test_not_available_in_round_three(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice).finish_round(1, (6,)).open_actions(2).finish_round(2, (6, 6)).open_actions(3)
        assert s.state["current_round"] == 3
        self.pay_once(s, 409)


class TestDiversification:
    NEW = "Shaded walking routes"

    def payment(self) -> list[dict[str, Any]]:
        """Exactly 2 money + 1 knowledge + 1 authority."""
        return pay(tourism_industry={"money": 2, "knowledge": 1}, local_government={"authority": 1})

    def row(self, s: Scenario, flood: int = 1, drought: int = 0) -> list[dict[str, int]]:
        return [{"hazard_id": s.hazard("Flood"), "value": flood}, {"hazard_id": s.hazard("Drought"), "value": drought}]

    def diversify(self, s: Scenario, expected: int = 200, **overrides: Any) -> dict[str, Any]:
        body: dict[str, Any] = {"name": self.NEW, "vulnerabilities": self.row(s), "payments": self.payment()}
        body.update(overrides)
        return s.post("/actions/diversify", expected, **body)

    def assert_nothing_changed(self, s: Scenario) -> None:
        state = s.call("GET", "")
        assert all(e["name"] != self.NEW for e in state["elements"])
        assert [a["type"] for a in state["actions"] if a["round"] == 1] == []
        assert resources(s, "tourism_industry") == (4, 2, 0)
        assert resources(s, "local_government") == (2, 0, 4)

    def test_adds_an_active_element_at_status_seven_with_its_vulnerability_row(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        self.diversify(s, vulnerabilities=self.row(s, flood=2, drought=1))

        new = next(e for e in s.state["elements"] if e["name"] == self.NEW)
        assert (new["status"], new["active"]) == (7, True)
        assert (s.vulnerability(self.NEW, "Flood"), s.vulnerability(self.NEW, "Drought")) == (2, 1)
        action = s.state["actions"][-1]
        assert (action["type"], action["element_id"], action["free"]) == ("diversification", new["id"], False)
        assert action["result"] == {
            "element_id": new["id"],
            "element_name": self.NEW,
            "status": 7,
            "vulnerabilities": [
                {"hazard_id": s.hazard("Flood"), "value": 2},
                {"hazard_id": s.hazard("Drought"), "value": 1},
            ],
            "marker_changes": [],
        }
        assert resources(s, "tourism_industry") == (2, 1, 0)
        assert resources(s, "local_government") == (2, 0, 3)
        assert resources(s, "civil_society") == (0, 4, 2)

    def test_the_moderator_may_change_the_starting_status(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        self.diversify(s, status=5)

        assert s.status(self.NEW) == 5
        assert s.state["actions"][-1]["result"]["status"] == 5

    def test_the_starting_status_stays_between_zero_and_the_usual_starting_status(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        for status in (-1, 11):
            self.diversify(s, 422, status=status)
        self.assert_nothing_changed(s)

        self.diversify(s, status=10)
        assert s.status(self.NEW) == 10

    def test_costs_two_money_one_knowledge_and_one_authority_exactly(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        self.diversify(s, 422, payments=pay(tourism_industry={"money": 2, "knowledge": 1}))  # no authority
        self.diversify(
            s, 422, payments=pay(tourism_industry={"money": 3, "knowledge": 1}, local_government={"authority": 1})
        )
        self.diversify(s, 422, payments=[])
        self.assert_nothing_changed(s)

    def test_a_payment_a_team_cannot_afford_leaves_no_element_behind(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        unaffordable = pay(
            civil_society={"money": 2, "knowledge": 1}, local_government={"authority": 1}
        )  # CS has no money
        body = self.diversify(s, 409, payments=unaffordable)
        assert "cannot contribute" in body["detail"]
        self.assert_nothing_changed(s)

    def test_the_name_must_be_new_and_not_blank(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        assert "already exists" in self.diversify(s, 422, name="beaches")["detail"]  # case-insensitive
        self.diversify(s, 422, name="   ")
        self.assert_nothing_changed(s)

    def test_the_vulnerability_row_needs_exactly_one_value_per_hazard(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        flood, drought = s.hazard("Flood"), s.hazard("Drought")
        invalid_rows = [
            [],
            [{"hazard_id": flood, "value": 1}],
            [{"hazard_id": flood, "value": 1}, {"hazard_id": 9999, "value": 1}],
            [{"hazard_id": flood, "value": 1}, {"hazard_id": flood, "value": 2}, {"hazard_id": drought, "value": 0}],
            [{"hazard_id": flood, "value": 4}, {"hazard_id": drought, "value": 0}],
        ]
        for row in invalid_rows:
            self.diversify(s, 422, vulnerabilities=row)
        self.assert_nothing_changed(s)

    def test_moving_a_marker_keeps_its_size_on_the_new_element(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        self.diversify(
            s, marker_changes=[{"team": "tourism_industry", "change": "move", "element_id": s.element("Hotels")}]
        )

        assert markers(s, "tourism_industry") == {
            "Water": "large",
            "Beaches": "small",
            "Nature": "small",
            self.NEW: "large",
        }
        assert markers(s, "local_government") == {
            "Beaches": "large",
            "Hotels": "large",
            "Nature": "small",
            "Heritage": "small",
        }

    def test_teams_may_keep_move_or_split_their_markers_in_one_paid_action(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        heritage, water = s.element("Heritage"), s.element("Water")
        self.diversify(
            s,
            marker_changes=[
                {"team": "local_government", "change": "move", "element_id": heritage},  # a small marker
                {"team": "tourism_industry", "change": "split", "element_id": water},  # a large marker
            ],
        )

        assert markers(s, "local_government") == {
            "Beaches": "large",
            "Hotels": "large",
            "Nature": "small",
            self.NEW: "small",
        }
        assert markers(s, "tourism_industry") == {
            "Hotels": "large",
            "Water": "small",
            "Beaches": "small",
            "Nature": "small",
            self.NEW: "small",
        }
        assert markers(s, "civil_society") == {
            "Nature": "large",
            "Heritage": "large",
            "Water": "small",
            "Beaches": "small",
        }
        diversifications = [a for a in s.state["actions"] if a["type"] == "diversification"]
        assert len(diversifications) == 1  # one payment, however many markers change
        assert diversifications[0]["result"]["marker_changes"] == [
            {"team_id": s.team("local_government")["id"], "change": "move", "element_id": heritage, "size": "small"},
            {"team_id": s.team("tourism_industry")["id"], "change": "split", "element_id": water, "size": "large"},
        ]

    def test_marker_changes_that_break_a_rule_are_refused_and_change_nothing(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        beaches, hotels, water = s.element("Beaches"), s.element("Hotels"), s.element("Water")
        refused = [
            ([{"team": "civil_society", "change": "split", "element_id": water}], "Small markers cannot be split"),
            ([{"team": "local_government", "change": "move", "element_id": water}], "has no marker on Water"),
            ([{"team": "local_government", "change": "move", "element_id": 9999}], "Unknown or inactive element"),
            (
                [
                    {"team": "local_government", "change": "move", "element_id": beaches},
                    {"team": "local_government", "change": "split", "element_id": hotels},
                ],
                "only one marker",
            ),
        ]
        for marker_changes, message in refused:
            assert message in self.diversify(s, 422, marker_changes=marker_changes)["detail"]
        self.assert_nothing_changed(s)
        assert markers(s, "civil_society") == {
            "Nature": "large",
            "Heritage": "large",
            "Water": "small",
            "Beaches": "small",
        }

    def test_scores_count_the_new_element_and_the_changed_markers(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)  # no hazard triggers; Hotels is at 12 after Round 0, every other element at 10
        self.diversify(
            s,
            marker_changes=[
                {"team": "tourism_industry", "change": "move", "element_id": s.element("Hotels")},
                {"team": "civil_society", "change": "split", "element_id": s.element("Nature")},
            ],
        )
        s.finish_round(1, dice_values=(6,))

        assert s.scores(1) == {
            "local_government": 2 * 10 + 2 * 12 + 10 + 10,
            "tourism_industry": 2 * 10 + 2 * 7 + 10 + 10,  # its large Hotels marker now sits on the new element
            "civil_society": 2 * 10 + 10 + 10 + 10 + 7,  # Nature's large marker became two small ones
        }

    def test_the_new_element_takes_hazard_damage(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice, flood_round_one_die=3)  # Flood 3 <= 3 triggers in Round 1
        self.diversify(s, vulnerabilities=self.row(s, flood=2, drought=3))
        s.post("/rounds/1/close-actions")
        dice.push(6)  # Drought does not trigger
        s.post("/rounds/1/resolve-hazards")

        assert s.status(self.NEW) == 7 - 2

    def test_the_new_element_is_an_ordinary_target_for_later_actions(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        self.diversify(s, vulnerabilities=self.row(s, flood=2, drought=1))
        new = s.element(self.NEW)

        s.post(
            "/actions/invest",
            element_id=new,
            payments=pay(tourism_industry={"money": 1, "knowledge": 1}, local_government={"money": 1}),
        )
        s.post(
            "/actions/adapt",
            element_id=new,
            hazard_id=s.hazard("Flood"),
            payments=pay(local_government={"money": 1, "authority": 2}, civil_society={"knowledge": 1}),
        )

        assert s.status(self.NEW) == 7 + 2
        assert s.vulnerability(self.NEW, "Flood") == 2 - 1

    def test_can_be_repeated_when_teams_can_afford_it(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        self.diversify(s)
        self.diversify(s, name="Eco lodges")

        assert [a["type"] for a in s.state["actions"] if a["round"] == 1] == ["diversification"] * 2
        assert {self.NEW, "Eco lodges"} <= {e["name"] for e in s.state["elements"]}
        assert resources(s, "tourism_industry") == (0, 0, 0)

    def test_is_explained_but_not_played_in_round_zero(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = Scenario(client, dice).ready_for_round_zero()
        s.post("/rounds/0/start")
        body = self.diversify(s, 409, payments=[])
        assert "explained in Round 0" in body["detail"]

    def test_is_refused_once_the_action_phase_is_closed(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        s.post("/rounds/1/close-actions")
        self.diversify(s, 409)


class TestHazardResolution:
    def test_triggered_hazard_subtracts_vulnerability_and_clamps_at_zero(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice, flood_round_one_die=3)  # Flood 3 <= 3 triggers
        # Flood vulnerability: Beaches 2 (adapted in round 0), Hotels 2, Nature 1, Heritage 0, Water 2.
        s.post("/rounds/1/close-actions")
        dice.push(6)  # Drought 6 does not trigger
        s.post("/rounds/1/resolve-hazards")
        flood = next(r for r in s.state["hazard_rolls"] if r["round"] == 1 and r["hazard_id"] == s.hazard("Flood"))
        assert flood["triggered"] is True
        assert [(d["status_before"], d["status_after"]) for d in flood["damages"]] == [
            (10, 8),
            (12, 10),
            (10, 9),
            (10, 10),
            (10, 8),
        ]

    def test_die_above_probability_does_not_trigger(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice, flood_round_one_die=4)
        s.post("/rounds/1/close-actions")
        dice.push(3)  # Flood stored 4 > 3, Drought 3 > 2 -> neither triggers
        s.post("/rounds/1/resolve-hazards")
        assert [r["triggered"] for r in s.state["hazard_rolls"] if r["round"] == 1] == [False, False]
        assert all(r["damages"] == [] for r in s.state["hazard_rolls"])
        assert s.status("Hotels") == 12

    def test_two_triggered_hazards_apply_cumulative_damage(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice, flood_round_one_die=1)
        s.post("/rounds/1/close-actions")
        dice.push(1)
        s.post("/rounds/1/resolve-hazards")
        # Nature: Flood 1 + Drought 3 -> 10 - 1 - 3 = 6; Water: 2 + 2 -> 6; Heritage: 0 + 1 -> 9
        assert (s.status("Nature"), s.status("Water"), s.status("Heritage")) == (6, 6, 9)
        drought = next(r for r in s.state["hazard_rolls"] if r["round"] == 1 and r["hazard_id"] == s.hazard("Drought"))
        nature = next(d for d in drought["damages"] if d["element_id"] == s.element("Nature"))
        assert (nature["status_before"], nature["status_after"]) == (9, 6)

    def test_status_never_goes_negative(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice, flood_round_one_die=1)
        for round_number in (1, 2, 3):
            if round_number > 1:
                s.open_actions(round_number)
            s.post(f"/rounds/{round_number}/close-actions")
            dice.push(*[1] * (1 if round_number == 1 else 2))
            s.post(f"/rounds/{round_number}/resolve-hazards")
            s.post(f"/rounds/{round_number}/apply-event")
            s.post(f"/rounds/{round_number}/score")
            s.post(f"/rounds/{round_number}/complete")
        assert min(e["status"] for e in s.state["elements"]) == 0


class TestPhaseGuardsAndIdempotency:
    def test_steps_cannot_be_skipped(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        s.post("/rounds/1/resolve-hazards", 409)
        s.post("/rounds/1/apply-event", 409)
        s.post("/rounds/1/score", 409)
        s.post("/rounds/1/complete", 409)
        s.post("/rounds/2/allocate-resources", 409)
        assert s.state["phase"] == "ACTION_PHASE"

    def test_negative_round_numbers_are_rejected(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        for step in ("allocate-resources", "close-actions", "resolve-hazards", "apply-event", "score", "complete"):
            s.post(f"/rounds/-1/{step}", 422)

    def test_close_resolve_event_score_are_idempotent(self, client: TestClient, dice: FixedDiceProvider) -> None:
        s = round_one(client, dice)
        s.post("/rounds/1/close-actions")
        assert s.post("/rounds/1/close-actions")["phase"] == "HAZARD_PHASE"
        dice.push(1)  # Drought; Flood's die was stored by the Round 0 prediction
        resolved = s.post("/rounds/1/resolve-hazards")
        assert s.post("/rounds/1/resolve-hazards") == resolved
        assert len(dice.rolled) == 4  # 3 in round 0 + 1 here; repeating resolution rolls nothing
        event = s.post("/rounds/1/apply-event")
        assert s.post("/rounds/1/apply-event") == event
        scored = s.post("/rounds/1/score")
        assert s.post("/rounds/1/score") == scored
        assert len([x for x in scored["scores"] if x["round"] == 1]) == 3
        done = s.post("/rounds/1/complete")
        assert s.post("/rounds/1/complete") == done
        assert s.post("/rounds/1/allocate-resources") == done

    def test_repeating_allocate_after_round_moves_on_does_not_double_allocate(
        self, client: TestClient, dice: FixedDiceProvider
    ) -> None:
        s = round_one(client, dice)
        s.post("/rounds/1/allocate-resources")
        assert len([e for e in s.state["ledger"] if e["kind"] == "allocation" and e["round"] == 1]) == 6

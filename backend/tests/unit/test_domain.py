import pytest

from app.domain import catalogue, rules
from app.domain.costs import ACTION_COSTS, Bundle, resolve_payment
from app.domain.dice import FixedDiceProvider, SeededDiceProvider
from app.domain.enums import ActionType, EventType, MarkerChange, Phase, PrioritySize, ResourceType
from app.domain.errors import InvalidInputError, InvalidPhaseError
from app.domain.events import can_reduce_emissions, is_event_avoided
from app.domain.hazards import (
    calculate_damage,
    clamp_probability,
    damage_limit,
    hazards_that_apply,
    increase_status,
    is_triggered,
    reduce_vulnerability,
)
from app.domain.markers import MarkerPlan, plan_marker_change
from app.domain.phases import should_run_step
from app.domain.scoring import score_team, winners


class TestDice:
    def test_fixed_dice_returns_values_in_order(self) -> None:
        dice = FixedDiceProvider([3, 4, 1])
        assert [dice.roll(), dice.roll(), dice.roll()] == [3, 4, 1]

    def test_fixed_dice_rejects_invalid_values_and_exhaustion(self) -> None:
        with pytest.raises(ValueError):
            FixedDiceProvider([7])
        with pytest.raises(RuntimeError):
            FixedDiceProvider().roll()

    def test_seeded_dice_are_reproducible_and_in_range(self) -> None:
        a, b = SeededDiceProvider(7), SeededDiceProvider(7)
        sequence = [a.roll() for _ in range(50)]
        assert sequence == [b.roll() for _ in range(50)]
        assert set(sequence) <= set(range(1, 7))


class TestHazards:
    def test_probability_three_triggers_on_die_three_but_not_four(self) -> None:
        assert is_triggered(3, 3)
        assert not is_triggered(4, 3)

    def test_damage_subtracts_vulnerability_and_clamps_at_zero(self) -> None:
        changes = calculate_damage({1: 10, 2: 2, 3: 5}, {1: 3, 2: 3, 3: 0})
        assert [(c.element_id, c.before, c.after) for c in changes] == [(1, 10, 7), (2, 2, 0), (3, 5, 5)]

    def test_two_hazards_apply_cumulative_damage(self) -> None:
        first = calculate_damage({1: 10}, {1: 3})
        second = calculate_damage({1: first[0].after}, {1: 2})
        assert second[0].after == 5

    def test_adaptation_reduces_vulnerability_never_below_zero(self) -> None:
        assert reduce_vulnerability(3) == 2
        assert reduce_vulnerability(0) == 0

    def test_investment_adds_two_status(self) -> None:
        assert increase_status(10) == 12

    def test_probability_is_clamped_to_die_range(self) -> None:
        assert (clamp_probability(9), clamp_probability(-1)) == (6, 1)

    @pytest.mark.parametrize(
        ("triggered", "limit", "expected"),
        [
            ([True, True, True, True], 2, [True, True, False, False]),
            ([False, True, False, True, True], 2, [False, True, False, True, False]),
            ([True, False, True], 2, [True, False, True]),
            ([True, True, True], None, [True, True, True]),
            ([True, True], 0, [False, False]),
            ([], 2, []),
        ],
    )
    def test_only_the_first_triggered_hazards_apply_within_the_limit(
        self, triggered: list[bool], limit: int | None, expected: list[bool]
    ) -> None:
        assert hazards_that_apply(triggered, limit) == expected

    def test_only_round_zero_has_a_damage_limit(self) -> None:
        assert damage_limit(0) == rules.ROUND_ZERO_DAMAGE_LIMIT
        assert damage_limit(1) is None
        assert damage_limit(4) is None


class TestPayments:
    def test_prediction_accepts_knowledge_plus_any_wild_resource(self) -> None:
        breakdown = resolve_payment(
            ACTION_COSTS[ActionType.HAZARD_PREDICTION], [Bundle(knowledge=1), Bundle(money=1)], set(ResourceType)
        )
        assert breakdown.specific == Bundle(knowledge=1)
        assert breakdown.wild == Bundle(money=1)

    def test_missing_named_component_is_rejected(self) -> None:
        with pytest.raises(InvalidInputError, match="missing"):
            resolve_payment(ACTION_COSTS[ActionType.HAZARD_PREDICTION], [Bundle(money=2)], set(ResourceType))

    @pytest.mark.parametrize("paid", [Bundle(knowledge=1), Bundle(knowledge=1, money=2)])
    def test_total_must_match_cost_exactly(self, paid: Bundle) -> None:
        with pytest.raises(InvalidInputError, match="exactly"):
            resolve_payment(ACTION_COSTS[ActionType.HAZARD_PREDICTION], [paid], set(ResourceType))

    def test_wild_can_be_restricted_by_configuration(self) -> None:
        with pytest.raises(InvalidInputError, match="wild"):
            resolve_payment(
                ACTION_COSTS[ActionType.LOCAL_INVESTMENT],
                [Bundle(money=1, authority=2)],
                {ResourceType.MONEY, ResourceType.KNOWLEDGE},
            )

    def test_costs_match_the_rules(self) -> None:
        assert ACTION_COSTS[ActionType.RISK_ADAPTATION].specific == Bundle(money=1, knowledge=1, authority=2)
        assert ACTION_COSTS[ActionType.LOCAL_INVESTMENT].specific == Bundle(money=1)
        assert ACTION_COSTS[ActionType.LOCAL_INVESTMENT].wild == 2
        assert ACTION_COSTS[ActionType.DIVERSIFICATION].specific == Bundle(money=2, knowledge=1, authority=1)
        assert ACTION_COSTS[ActionType.DIVERSIFICATION].wild == 0
        assert ACTION_COSTS[ActionType.REDUCE_EMISSIONS].specific == Bundle(money=1, knowledge=1, authority=1)


class TestMarkers:
    @pytest.mark.parametrize("size", list(PrioritySize))
    def test_moving_a_marker_keeps_its_size_on_the_new_element(self, size: PrioritySize) -> None:
        assert plan_marker_change(size, MarkerChange.MOVE) == MarkerPlan(stays=None, goes=size)

    def test_splitting_a_large_marker_leaves_one_small_marker_on_each_element(self) -> None:
        plan = plan_marker_change(PrioritySize.LARGE, MarkerChange.SPLIT)
        assert plan == MarkerPlan(stays=PrioritySize.SMALL, goes=PrioritySize.SMALL)

    def test_small_markers_cannot_be_split(self) -> None:
        with pytest.raises(InvalidInputError, match="Small markers cannot be split"):
            plan_marker_change(PrioritySize.SMALL, MarkerChange.SPLIT)


class TestScoring:
    def test_large_counts_double_and_small_counts_once(self) -> None:
        score = score_team(
            [(1, PrioritySize.LARGE), (2, PrioritySize.LARGE), (3, PrioritySize.SMALL), (4, PrioritySize.SMALL)],
            {1: 10, 2: 8, 3: 5, 4: 0},
        )
        assert (score.large_total, score.small_total, score.total) == (36, 5, 41)

    def test_winners_include_ties(self) -> None:
        assert winners({1: 40, 2: 55, 3: 55}) == [2, 3]
        assert winners({}) == []


class TestEvents:
    def test_transition_penalty_is_avoided_only_at_two_of_two(self) -> None:
        assert [is_event_avoided(EventType.TRANSITION_PRESSURE, n) for n in (0, 1, 2)] == [False, False, True]
        assert not is_event_avoided(EventType.STANDARD, 2)

    def test_reduce_emissions_once_in_rounds_one_and_two_only(self) -> None:
        assert can_reduce_emissions(1, set())
        assert not can_reduce_emissions(1, {1})
        assert can_reduce_emissions(2, {1})
        assert not can_reduce_emissions(3, set())
        assert not can_reduce_emissions(0, set())


class TestPhaseMachine:
    def test_step_runs_when_phase_matches(self) -> None:
        assert should_run_step(1, Phase.ACTION_PHASE, 1, Phase.ACTION_PHASE) is True

    def test_step_is_noop_once_passed(self) -> None:
        assert should_run_step(1, Phase.HAZARD_PHASE, 1, Phase.ACTION_PHASE) is False
        assert should_run_step(2, Phase.RESOURCE_ALLOCATION, 1, Phase.ROUND_COMPLETE) is False
        assert should_run_step(4, Phase.GAME_COMPLETE, 4, Phase.SCORING) is False

    def test_step_not_yet_reachable_is_rejected(self) -> None:
        with pytest.raises(InvalidPhaseError):
            should_run_step(1, Phase.ACTION_PHASE, 1, Phase.HAZARD_PHASE)
        with pytest.raises(InvalidPhaseError):
            should_run_step(1, Phase.ACTION_PHASE, 2, Phase.RESOURCE_ALLOCATION)
        with pytest.raises(InvalidPhaseError):
            should_run_step(None, Phase.PRIORITIES, 1, Phase.RESOURCE_ALLOCATION)

    def test_round_zero_has_no_regular_steps(self) -> None:
        with pytest.raises(InvalidPhaseError):
            should_run_step(0, Phase.ROUND0_HAZARDS, 0, Phase.EVENT_PHASE)


class TestCatalogue:
    def test_event_templates_only_reference_catalogue_hazards_and_elements(self) -> None:
        hazards = set(catalogue.HAZARD_NAMES)
        elements = {name for group in catalogue.ELEMENT_GROUPS for name in group.elements}
        for template in catalogue.EVENT_TEMPLATES:
            for effect in template.effects:
                assert effect.hazard is None or effect.hazard in hazards, template.key
                assert effect.element is None or effect.element in elements, template.key

    def test_catalogue_names_are_unique(self) -> None:
        names = [name for group in catalogue.ELEMENT_GROUPS for name in group.elements]
        assert len(names) == len(set(names)) == 19
        assert len(catalogue.HAZARD_NAMES) == len(set(catalogue.HAZARD_NAMES)) == 8

    def test_exactly_one_transition_pressure_template(self) -> None:
        kinds = [t.type for t in catalogue.EVENT_TEMPLATES]
        assert kinds.count(EventType.TRANSITION_PRESSURE) == 1


def test_rules_constants() -> None:
    assert rules.STARTING_STATUS == 10
    assert rules.DIVERSIFICATION_STATUS == 7
    assert rules.REDUCE_EMISSIONS_ROUNDS == (1, 2)

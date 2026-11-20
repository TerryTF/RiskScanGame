"""Action use cases: Hazard Prediction, Risk Adaptation, Local Investment, Diversification and Reduce Emissions."""

from dataclasses import dataclass
from typing import Any

from sqlalchemy.orm import Session

from app.db.models import (
    ActionContribution,
    ActionExecution,
    Element,
    Game,
    Hazard,
    HazardRoll,
    Team,
    TeamPriority,
    Vulnerability,
)
from app.domain import rules
from app.domain.costs import ACTION_COSTS, Bundle, PaymentBreakdown, resolve_payment
from app.domain.dice import DiceProvider
from app.domain.enums import ActionType, MarkerChange, Phase, PrioritySize, ResourceType, RollSource
from app.domain.errors import ConflictError, InvalidInputError, InvalidPhaseError
from app.domain.events import can_reduce_emissions
from app.domain.hazards import increase_status, reduce_vulnerability
from app.domain.markers import MarkerPlan, plan_marker_change
from app.domain.phases import next_phase
from app.schemas.requests import (
    ActionRequest,
    AdaptRequest,
    DiversifyRequest,
    HazardVulnerabilityInput,
    InvestRequest,
    MarkerChangeInput,
    PaymentInput,
    PredictRequest,
)
from app.schemas.responses import GameState

from .base import ServiceBase, transactional
from .presenter import emissions_progress
from .resources import ResourceLedgerService

ROUND_ZERO_ACTION_PHASE: dict[ActionType, Phase] = {
    ActionType.HAZARD_PREDICTION: Phase.ROUND0_PREDICTION,
    ActionType.RISK_ADAPTATION: Phase.ROUND0_ADAPTATION,
    ActionType.LOCAL_INVESTMENT: Phase.ROUND0_INVESTMENT,
}


@dataclass(frozen=True)
class ResolvedPayment:
    by_team: dict[Team, Bundle]
    breakdown: PaymentBreakdown


def _bundle_dict(bundle: Bundle) -> dict[str, int]:
    return {resource.value: bundle.get(resource) for resource in ResourceType}


class ActionService(ServiceBase):
    def __init__(self, session: Session, dice: DiceProvider) -> None:
        super().__init__(session)
        self._dice = dice
        self._ledger = ResourceLedgerService(self.repo)

    @transactional
    def predict(self, game_id: str, request: PredictRequest) -> GameState:
        game = self.repo.get(game_id)
        round_number = self._require_action_phase(game, ActionType.HAZARD_PREDICTION)
        hazard = _hazard(game, request.hazard_id)
        payments = self._resolve_payments(game, ActionType.HAZARD_PREDICTION, request.payments)

        rolls: list[dict[str, Any]] = []
        target_rounds = [round_number] + ([round_number + 1] if round_number < game.total_rounds else [])
        stored = {r.round_number: r for r in game.hazard_rolls if r.hazard_id == hazard.id}
        for target in target_rounds:
            roll = stored.get(target)
            newly_rolled = roll is None
            if roll is None:
                roll = HazardRoll(
                    hazard_id=hazard.id,
                    round_number=target,
                    die=self._dice.roll(),
                    source=RollSource.PREDICTED,
                )
                game.hazard_rolls.append(roll)
            rolls.append({"round": target, "die": roll.die, "newly_rolled": newly_rolled})

        self._record(
            game,
            ActionType.HAZARD_PREDICTION,
            round_number,
            payments,
            {"hazard_id": hazard.id, "rolls": rolls},
            hazard_id=hazard.id,
        )
        return self._finish(game, round_number)

    @transactional
    def adapt(self, game_id: str, request: AdaptRequest) -> GameState:
        game = self.repo.get(game_id)
        round_number = self._require_action_phase(game, ActionType.RISK_ADAPTATION)
        element = _element(game, request.element_id)
        hazard = _hazard(game, request.hazard_id)
        cell = next((v for v in game.vulnerabilities if v.element_id == element.id and v.hazard_id == hazard.id), None)
        if cell is None:
            raise InvalidInputError(f"No vulnerability is defined for {element.name} and {hazard.name}.")
        payments = self._resolve_payments(game, ActionType.RISK_ADAPTATION, request.payments)

        before = cell.value
        cell.value = reduce_vulnerability(before)
        self._record(
            game,
            ActionType.RISK_ADAPTATION,
            round_number,
            payments,
            {"vulnerability_before": before, "vulnerability_after": cell.value},
            element_id=element.id,
            hazard_id=hazard.id,
        )
        return self._finish(game, round_number)

    @transactional
    def invest(self, game_id: str, request: InvestRequest) -> GameState:
        game = self.repo.get(game_id)
        round_number = self._require_action_phase(game, ActionType.LOCAL_INVESTMENT)
        element = _element(game, request.element_id)
        payments = self._resolve_payments(game, ActionType.LOCAL_INVESTMENT, request.payments)

        before = element.status
        element.status = increase_status(before)
        self._record(
            game,
            ActionType.LOCAL_INVESTMENT,
            round_number,
            payments,
            {"status_before": before, "status_after": element.status},
            element_id=element.id,
        )
        return self._finish(game, round_number)

    @transactional
    def diversify(self, game_id: str, request: DiversifyRequest) -> GameState:
        game = self.repo.get(game_id)
        round_number = self._require_action_phase(game, ActionType.DIVERSIFICATION)
        if any(e.name.casefold() == request.name.casefold() for e in game.elements):
            raise InvalidInputError(f"An element named '{request.name}' already exists.")
        row = _vulnerability_row(game, request.vulnerabilities)
        marker_changes = _plan_marker_changes(game, request.marker_changes)
        payments = self._resolve_payments(game, ActionType.DIVERSIFICATION, request.payments)

        element = Element(name=request.name, status=request.status, active=True)
        game.elements.append(element)
        self.repo.flush()
        game.vulnerabilities.extend(
            Vulnerability(element_id=element.id, hazard_id=hazard.id, value=row[hazard.id]) for hazard in game.hazards
        )
        for change in marker_changes:
            change.apply(element)

        self._record(
            game,
            ActionType.DIVERSIFICATION,
            round_number,
            payments,
            {
                "element_id": element.id,
                "element_name": element.name,
                "status": element.status,
                "vulnerabilities": [{"hazard_id": h.id, "value": row[h.id]} for h in game.hazards],
                "marker_changes": [change.result() for change in marker_changes],
            },
            element_id=element.id,
        )
        return self._finish(game, round_number)

    @transactional
    def reduce_emissions(self, game_id: str, request: ActionRequest) -> GameState:
        game = self.repo.get(game_id)
        round_number = self._require_action_phase(game, ActionType.REDUCE_EMISSIONS)
        done = {a.round_number for a in game.actions if a.action_type is ActionType.REDUCE_EMISSIONS}
        if round_number not in rules.REDUCE_EMISSIONS_ROUNDS:
            raise ConflictError("Reduce Emissions is only available in Rounds 1 and 2.")
        if not can_reduce_emissions(round_number, done):
            raise ConflictError(f"Reduce Emissions was already used in Round {round_number}.")
        payments = self._resolve_payments(game, ActionType.REDUCE_EMISSIONS, request.payments)

        self._record(
            game,
            ActionType.REDUCE_EMISSIONS,
            round_number,
            payments,
            {"progress": emissions_progress(game) + 1, "target": rules.REDUCE_EMISSIONS_TARGET},
        )
        return self._finish(game, round_number)

    def _require_action_phase(self, game: Game, action: ActionType) -> int:
        """Return the current round if `action` may run now, otherwise raise a 409."""
        if game.current_round is None:
            raise InvalidPhaseError(f"Actions are not available in phase {game.phase}.")
        if game.current_round == 0:
            if action is ActionType.DIVERSIFICATION:
                raise InvalidPhaseError("Diversification is explained in Round 0 but not played.")
            if ROUND_ZERO_ACTION_PHASE.get(action) is not game.phase:
                raise InvalidPhaseError(
                    f"{action.value} cannot be played in phase {game.phase} of the Round 0 tutorial."
                )
        elif game.phase is not Phase.ACTION_PHASE:
            raise InvalidPhaseError(f"{action.value} requires phase ACTION_PHASE, not {game.phase}.")
        return game.current_round

    def _resolve_payments(self, game: Game, action: ActionType, payments: list[PaymentInput]) -> ResolvedPayment | None:
        """Validate and price the contributions. Returns None for free Round 0 actions."""
        if game.current_round == 0:
            if payments:
                raise InvalidInputError("Round 0 actions are free; do not send payments.")
            return None
        teams = {t.role: t for t in game.teams}
        by_team: dict[Team, Bundle] = {}
        for payment in payments:
            team = teams[payment.team]
            if team in by_team:
                raise InvalidInputError(f"{team.name} appears more than once in payments.")
            bundle = Bundle(payment.money, payment.knowledge, payment.authority)
            if bundle.total() > 0:
                by_team[team] = bundle
        breakdown = resolve_payment(ACTION_COSTS[action], by_team.values(), rules.WILD_ALLOWED_RESOURCES)
        self._ledger.ensure_affordable(game, game.current_round or 0, by_team)
        return ResolvedPayment(by_team, breakdown)

    def _record(
        self,
        game: Game,
        action: ActionType,
        round_number: int,
        payments: ResolvedPayment | None,
        result: dict[str, Any],
        element_id: int | None = None,
        hazard_id: int | None = None,
    ) -> None:
        execution = ActionExecution(
            round_number=round_number,
            action_type=action,
            element_id=element_id,
            hazard_id=hazard_id,
            free=payments is None,
            cost={}
            if payments is None
            else {
                "specific": _bundle_dict(payments.breakdown.specific),
                "wild": _bundle_dict(payments.breakdown.wild),
            },
            result=result,
        )
        paid = payments.by_team if payments is not None else {}
        for team, bundle in paid.items():
            for resource, amount in bundle.items():
                execution.contributions.append(ActionContribution(team_id=team.id, resource=resource, amount=amount))
        game.actions.append(execution)
        self.repo.flush()
        for team, bundle in paid.items():
            self._ledger.spend(game, round_number, team, bundle, execution.id)

    def _finish(self, game: Game, round_number: int) -> GameState:
        if round_number == 0:
            game.phase = next_phase(0, game.phase)
        return self.state(game)


def _element(game: Game, element_id: int) -> Element:
    element = next((e for e in game.elements if e.id == element_id and e.active), None)
    if element is None:
        raise InvalidInputError(f"Unknown or inactive element {element_id}.")
    return element


def _hazard(game: Game, hazard_id: int) -> Hazard:
    hazard = next((h for h in game.hazards if h.id == hazard_id), None)
    if hazard is None:
        raise InvalidInputError(f"Unknown hazard {hazard_id}.")
    return hazard


def _vulnerability_row(game: Game, items: list[HazardVulnerabilityInput]) -> dict[int, int]:
    """The new element's vulnerability to each hazard, keyed by hazard id. Every hazard needs exactly one value."""
    known = {h.id for h in game.hazards}
    row: dict[int, int] = {}
    for item in items:
        if item.hazard_id not in known:
            raise InvalidInputError(f"Unknown hazard {item.hazard_id}.")
        if item.hazard_id in row:
            raise InvalidInputError(f"Duplicate vulnerability for hazard {item.hazard_id}.")
        row[item.hazard_id] = item.value
    missing = [h.name for h in game.hazards if h.id not in row]
    if missing:
        raise InvalidInputError(f"Set the new element's vulnerability to every hazard; missing {', '.join(missing)}.")
    return row


@dataclass(frozen=True)
class PlannedMarkerChange:
    """One team's validated marker change, with the marker as it was before the change."""

    team: Team
    marker: TeamPriority
    change: MarkerChange
    from_element_id: int
    size: PrioritySize
    plan: MarkerPlan

    def apply(self, new_element: Element) -> None:
        if self.plan.stays is None:
            self.marker.element_id = new_element.id
            self.marker.size = self.plan.goes
        else:
            self.marker.size = self.plan.stays
            self.team.priorities.append(TeamPriority(element_id=new_element.id, size=self.plan.goes))

    def result(self) -> dict[str, Any]:
        return {
            "team_id": self.team.id,
            "change": self.change.value,
            "element_id": self.from_element_id,
            "size": self.size.value,
        }


def _plan_marker_changes(game: Game, changes: list[MarkerChangeInput]) -> list[PlannedMarkerChange]:
    """Check every team's marker change before anything is modified. A team may change at most one marker."""
    teams = {t.role: t for t in game.teams}
    planned: list[PlannedMarkerChange] = []
    for item in changes:
        team = teams[item.team]
        if any(p.team is team for p in planned):
            raise InvalidInputError(f"{team.name} can change only one marker.")
        element = _element(game, item.element_id)
        marker = next((p for p in team.priorities if p.element_id == element.id), None)
        if marker is None:
            raise InvalidInputError(f"{team.name} has no marker on {element.name}.")
        try:
            plan = plan_marker_change(marker.size, item.change)
        except InvalidInputError as error:
            raise InvalidInputError(f"{team.name}: {error.message}") from error
        planned.append(PlannedMarkerChange(team, marker, item.change, element.id, marker.size, plan))
    return planned

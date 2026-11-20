"""Maps persisted entities to the GameState response. Contains no game rules beyond reading derived values."""

from app.db.models import Game
from app.domain import rules
from app.domain.costs import Bundle
from app.domain.enums import ActionType, Phase
from app.domain.scoring import winners
from app.repositories.game_repository import GameRepository
from app.schemas.responses import (
    ActionOut,
    ContributionOut,
    DamageOut,
    EffectOut,
    ElementOut,
    EventOut,
    GameState,
    HazardOut,
    HazardRollOut,
    LedgerOut,
    PriorityOut,
    ResourcesOut,
    ScoreOut,
    TeamOut,
    VulnerabilityOut,
)


def emissions_progress(game: Game) -> int:
    return sum(1 for a in game.actions if a.action_type is ActionType.REDUCE_EMISSIONS)


def build_game_state(game: Game, repo: GameRepository) -> GameState:
    balances: dict[int, Bundle] = {}
    if game.current_round is not None:
        balances = repo.team_balances(game.id, game.current_round)

    final_winners: list[int] = []
    if game.phase is Phase.GAME_COMPLETE:
        # The game may be finished early, so the winners come from the last round that was scored.
        last_scored = max((s.round_number for s in game.scores), default=None)
        final = {s.team_id: s.score for s in game.scores if s.round_number == last_scored}
        final_winners = winners(final)

    return GameState(
        id=game.id,
        destination_name=game.destination_name,
        geographic_scope=game.geographic_scope,
        total_rounds=game.total_rounds,
        phase=game.phase,
        current_round=game.current_round,
        elements=[ElementOut(id=e.id, name=e.name, status=e.status, active=e.active) for e in game.elements],
        hazards=[HazardOut(id=h.id, name=h.name, probability=h.probability) for h in game.hazards],
        vulnerabilities=[
            VulnerabilityOut(element_id=v.element_id, hazard_id=v.hazard_id, value=v.value)
            for v in sorted(game.vulnerabilities, key=lambda v: (v.element_id, v.hazard_id))
        ],
        teams=[
            TeamOut(
                id=t.id,
                role=t.role,
                name=t.name,
                members=list(t.members),
                priorities=[PriorityOut(element_id=p.element_id, size=p.size) for p in t.priorities],
                resources=_resources(balances.get(t.id, Bundle())),
            )
            for t in game.teams
        ],
        hazard_rolls=[
            HazardRollOut(
                id=r.id,
                round=r.round_number,
                hazard_id=r.hazard_id,
                die=r.die,
                source=r.source,
                resolved=r.resolved,
                probability_at_roll=r.probability_at_roll,
                triggered=r.triggered,
                applied=r.applied,
                damages=[
                    DamageOut(
                        element_id=d.element_id,
                        vulnerability=d.vulnerability,
                        status_before=d.status_before,
                        status_after=d.status_after,
                    )
                    for d in r.damages
                ],
            )
            for r in sorted(game.hazard_rolls, key=lambda r: (r.round_number, r.hazard_id))
        ],
        actions=[
            ActionOut(
                id=a.id,
                round=a.round_number,
                type=a.action_type,
                element_id=a.element_id,
                hazard_id=a.hazard_id,
                free=a.free,
                cost=a.cost,
                contributions=[
                    ContributionOut(team_id=c.team_id, resource=c.resource, amount=c.amount) for c in a.contributions
                ],
                result=a.result,
            )
            for a in game.actions
        ],
        events=[
            EventOut(
                id=e.id,
                round=e.round_number,
                type=e.event_type,
                name=e.name,
                description=e.description,
                effects=[EffectOut(**effect) for effect in e.effects],
                status=e.status,
                applied_changes=e.applied_changes,
            )
            for e in game.events
        ],
        scores=[
            ScoreOut(
                round=s.round_number,
                team_id=s.team_id,
                large_total=s.large_total,
                small_total=s.small_total,
                score=s.score,
            )
            for s in sorted(game.scores, key=lambda s: (s.round_number, s.team_id))
        ],
        ledger=[
            LedgerOut(
                id=entry.id,
                team_id=entry.team_id,
                round=entry.round_number,
                resource=entry.resource,
                delta=entry.delta,
                kind=entry.kind,
                action_id=entry.action_id,
            )
            for entry in game.ledger
        ],
        reduce_emissions_progress=min(emissions_progress(game), rules.REDUCE_EMISSIONS_TARGET),
        winners=final_winners,
    )


def _resources(bundle: Bundle) -> ResourcesOut:
    return ResourcesOut(money=bundle.money, knowledge=bundle.knowledge, authority=bundle.authority)

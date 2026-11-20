"""Resource ledger operations: allocation, spending and expiry."""

from app.db.models import Game, ResourceLedger, Team
from app.domain import rules
from app.domain.costs import Bundle
from app.domain.enums import LedgerKind, ResourceType
from app.domain.errors import InsufficientResourcesError
from app.repositories.game_repository import GameRepository


class ResourceLedgerService:
    def __init__(self, repo: GameRepository) -> None:
        self._repo = repo

    def allocate_round(self, game: Game, round_number: int) -> None:
        for team in game.teams:
            for resource, amount in rules.TEAM_ALLOWANCES[team.role].items():
                self._add(game, team, round_number, resource, amount, LedgerKind.ALLOCATION)

    def ensure_affordable(self, game: Game, round_number: int, payments: dict[Team, Bundle]) -> None:
        """Check every team's balance before anything is deducted so a failure never leaves partial spending."""
        balances = self._repo.team_balances(game.id, round_number)
        for team, bundle in payments.items():
            balance = balances.get(team.id, Bundle())
            if not balance.covers(bundle):
                raise InsufficientResourcesError(
                    f"{team.name} cannot contribute {bundle.describe()}; it has {balance.describe()}."
                )

    def spend(self, game: Game, round_number: int, team: Team, bundle: Bundle, action_id: int) -> None:
        for resource, amount in bundle.items():
            self._add(game, team, round_number, resource, -amount, LedgerKind.SPEND, action_id)

    def expire_round(self, game: Game, round_number: int) -> None:
        """Unused resources do not carry over: write a negative entry that zeroes each team's balance."""
        balances = self._repo.team_balances(game.id, round_number)
        for team in game.teams:
            for resource, amount in balances.get(team.id, Bundle()).items():
                self._add(game, team, round_number, resource, -amount, LedgerKind.EXPIRY)

    def _add(
        self,
        game: Game,
        team: Team,
        round_number: int,
        resource: ResourceType,
        delta: int,
        kind: LedgerKind,
        action_id: int | None = None,
    ) -> None:
        game.ledger.append(
            ResourceLedger(
                team_id=team.id,
                round_number=round_number,
                resource=resource,
                delta=delta,
                kind=kind,
                action_id=action_id,
            )
        )
        self._repo.flush()

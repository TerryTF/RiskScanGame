from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.models import Game, ResourceLedger
from app.domain.costs import Bundle
from app.domain.enums import ResourceType
from app.domain.errors import NotFoundError


class GameRepository:
    """Persistence boundary for games. Services depend on this class, not on the database driver."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def add(self, game: Game) -> None:
        self._session.add(game)
        self._session.flush()

    def get(self, game_id: str) -> Game:
        game = self._session.get(Game, game_id)
        if game is None:
            raise NotFoundError(f"Game {game_id} not found.")
        return game

    def flush(self) -> None:
        self._session.flush()

    def team_balances(self, game_id: str, round_number: int) -> dict[int, Bundle]:
        """Current resources per team for one round, summed from the ledger."""
        rows = self._session.execute(
            select(ResourceLedger.team_id, ResourceLedger.resource, func.sum(ResourceLedger.delta))
            .where(ResourceLedger.game_id == game_id, ResourceLedger.round_number == round_number)
            .group_by(ResourceLedger.team_id, ResourceLedger.resource)
        ).all()
        amounts: dict[int, dict[ResourceType, int]] = {}
        for team_id, resource, total in rows:
            amounts.setdefault(team_id, {})[resource] = int(total)
        return {
            team_id: Bundle(
                money=per_resource.get(ResourceType.MONEY, 0),
                knowledge=per_resource.get(ResourceType.KNOWLEDGE, 0),
                authority=per_resource.get(ResourceType.AUTHORITY, 0),
            )
            for team_id, per_resource in amounts.items()
        }

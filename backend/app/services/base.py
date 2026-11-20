import functools
from collections.abc import Callable
from typing import Concatenate, cast

from sqlalchemy.orm import Session

from app.db.models import Game
from app.repositories.game_repository import GameRepository
from app.schemas.responses import GameState

from .presenter import build_game_state


def transactional[S: "ServiceBase", **P, R](method: Callable[Concatenate[S, P], R]) -> Callable[Concatenate[S, P], R]:
    """Run a use case in one transaction: commit when it returns, roll back on any error."""

    @functools.wraps(method)
    def wrapper(self: S, *args: P.args, **kwargs: P.kwargs) -> R:
        try:
            result = method(self, *args, **kwargs)
            self.session.commit()
        except BaseException:
            self.session.rollback()
            raise
        return result

    return cast(Callable[Concatenate[S, P], R], wrapper)


class ServiceBase:
    def __init__(self, session: Session) -> None:
        self.session = session
        self.repo = GameRepository(session)

    def state(self, game: Game) -> GameState:
        self.session.flush()
        return build_game_state(game, self.repo)

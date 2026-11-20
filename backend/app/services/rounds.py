"""Round state machine use cases: start or skip Round 0, allocate resources, close actions, complete a round."""

from datetime import UTC, datetime

from app.db.models import Game, Round
from app.domain.enums import Phase
from app.domain.errors import InvalidInputError, InvalidPhaseError
from app.domain.phases import next_phase, should_run_step
from app.schemas.responses import GameState

from .base import ServiceBase, transactional
from .resources import ResourceLedgerService


class RoundService(ServiceBase):
    @transactional
    def start_round_zero(self, game_id: str) -> GameState:
        game = self.repo.get(game_id)
        if game.current_round is not None:
            return self.state(game)
        if game.phase is not Phase.PRIORITIES:
            raise InvalidPhaseError(f"Round 0 can only start from PRIORITIES, not {game.phase}.")
        _require_priorities(game)
        game.rounds.append(Round(number=0))
        game.current_round = 0
        game.phase = Phase.ROUND0_PREDICTION
        return self.state(game)

    @transactional
    def skip_round_zero(self, game_id: str) -> GameState:
        """Go straight to Round 1 without the Round 0 practice. Possible until its first practice action."""
        game = self.repo.get(game_id)
        if game.current_round is not None and game.current_round >= 1:
            return self.state(game)
        if game.phase is Phase.PRIORITIES:
            _require_priorities(game)
        elif game.phase is Phase.ROUND0_PREDICTION:
            game.rounds[:] = [r for r in game.rounds if r.number != 0]
        else:
            raise InvalidPhaseError(
                "Round 0 can only be skipped once the priorities are set and before its first practice action, "
                f"not in {game.phase}."
            )
        game.rounds.append(Round(number=1))
        game.current_round = 1
        game.phase = Phase.RESOURCE_ALLOCATION
        return self.state(game)

    @transactional
    def allocate_resources(self, game_id: str, round_number: int) -> GameState:
        game = self.repo.get(game_id)
        if should_run_step(game.current_round, game.phase, round_number, Phase.RESOURCE_ALLOCATION):
            ResourceLedgerService(self.repo).allocate_round(game, round_number)
            game.phase = next_phase(round_number, game.phase)
        return self.state(game)

    @transactional
    def close_actions(self, game_id: str, round_number: int) -> GameState:
        game = self.repo.get(game_id)
        if should_run_step(game.current_round, game.phase, round_number, Phase.ACTION_PHASE):
            game.phase = next_phase(round_number, game.phase)
        return self.state(game)

    @transactional
    def complete_round(self, game_id: str, round_number: int) -> GameState:
        game = self.repo.get(game_id)
        if not should_run_step(game.current_round, game.phase, round_number, Phase.ROUND_COMPLETE):
            return self.state(game)
        self._close_round(game, round_number)
        if round_number == game.total_rounds:
            game.phase = Phase.GAME_COMPLETE
        else:
            game.rounds.append(Round(number=round_number + 1))
            game.current_round = round_number + 1
            game.phase = Phase.RESOURCE_ALLOCATION
        return self.state(game)

    @transactional
    def finish_game(self, game_id: str) -> GameState:
        """End the game after a scored regular round; the last round's scores are the final scores."""
        game = self.repo.get(game_id)
        if game.phase is Phase.GAME_COMPLETE:
            return self.state(game)
        if game.phase is not Phase.ROUND_COMPLETE or not game.current_round:
            raise InvalidPhaseError(
                f"The game can only be finished once a regular round is scored and complete, not in {game.phase}."
            )
        self._close_round(game, game.current_round)
        game.phase = Phase.GAME_COMPLETE
        return self.state(game)

    def _close_round(self, game: Game, round_number: int) -> None:
        ResourceLedgerService(self.repo).expire_round(game, round_number)
        _round(game, round_number).completed_at = datetime.now(UTC)


def _round(game: Game, number: int) -> Round:
    return next(r for r in game.rounds if r.number == number)


def _require_priorities(game: Game) -> None:
    for team in game.teams:
        if len(team.priorities) != 4:
            raise InvalidInputError(f"{team.name} has not selected its priorities yet.")

"""Team scoring: per-round snapshots of priority status, never accumulated."""

from app.db.models import Game, RoundScore
from app.domain.enums import Phase
from app.domain.phases import next_phase, should_run_step
from app.domain.scoring import score_team
from app.schemas.responses import GameState

from .base import ServiceBase, transactional


def record_scores(game: Game, round_number: int) -> None:
    statuses = {e.id: e.status for e in game.elements}
    for team in game.teams:
        result = score_team(((p.element_id, p.size) for p in team.priorities), statuses)
        game.scores.append(
            RoundScore(
                round_number=round_number,
                team_id=team.id,
                large_total=result.large_total,
                small_total=result.small_total,
                score=result.total,
            )
        )


class ScoringService(ServiceBase):
    @transactional
    def score_round(self, game_id: str, round_number: int) -> GameState:
        game = self.repo.get(game_id)
        if should_run_step(game.current_round, game.phase, round_number, Phase.SCORING):
            record_scores(game, round_number)
            game.phase = next_phase(round_number, game.phase)
        return self.state(game)

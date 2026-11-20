"""Hazard resolution: reuse stored (predicted) dice, roll the rest, trigger and apply cumulative damage."""

from sqlalchemy.orm import Session

from app.db.models import Game, Hazard, HazardDamage, HazardRoll
from app.domain.dice import DiceProvider
from app.domain.enums import Phase, RollSource
from app.domain.hazards import calculate_damage, damage_limit, hazards_that_apply, is_triggered
from app.domain.phases import next_phase, should_run_step
from app.schemas.responses import GameState

from .base import ServiceBase, transactional


class HazardService(ServiceBase):
    def __init__(self, session: Session, dice: DiceProvider) -> None:
        super().__init__(session)
        self._dice = dice

    @transactional
    def resolve_hazards(self, game_id: str, round_number: int) -> GameState:
        game = self.repo.get(game_id)
        expected = Phase.ROUND0_HAZARDS if round_number == 0 else Phase.HAZARD_PHASE
        if should_run_step(game.current_round, game.phase, round_number, expected):
            self._resolve(game, round_number)
            game.phase = next_phase(round_number, game.phase)
        return self.state(game)

    def _resolve(self, game: Game, round_number: int) -> None:
        stored = {r.hazard_id: r for r in game.hazard_rolls if r.round_number == round_number}
        elements = {e.id: e for e in game.elements if e.active}
        vulnerability = {(v.element_id, v.hazard_id): v.value for v in game.vulnerabilities}

        # Dice are consumed in board order, one per hazard that has no stored (predicted) die.
        rolls: list[tuple[Hazard, HazardRoll]] = []
        triggers: list[bool] = []
        for hazard in game.hazards:
            roll = stored.get(hazard.id)
            if roll is None:
                roll = HazardRoll(
                    hazard_id=hazard.id,
                    round_number=round_number,
                    die=self._dice.roll(),
                    source=RollSource.ROLLED,
                )
                game.hazard_rolls.append(roll)
            triggered = is_triggered(roll.die, hazard.probability)
            roll.probability_at_roll = hazard.probability
            roll.triggered = triggered
            roll.resolved = True
            rolls.append((hazard, roll))
            triggers.append(triggered)

        applies = hazards_that_apply(triggers, damage_limit(round_number))
        for (hazard, roll), applied in zip(rolls, applies, strict=True):
            roll.applied = applied
            if not applied:
                continue
            changes = calculate_damage(
                {element_id: e.status for element_id, e in elements.items()},
                {element_id: vulnerability.get((element_id, hazard.id), 0) for element_id in elements},
            )
            for change in changes:
                elements[change.element_id].status = change.after
                roll.damages.append(
                    HazardDamage(
                        element_id=change.element_id,
                        vulnerability=change.vulnerability,
                        status_before=change.before,
                        status_after=change.after,
                    )
                )

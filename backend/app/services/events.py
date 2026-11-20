"""Event processing: apply configured events after hazard damage."""

from typing import Any

from app.db.models import Event, Game
from app.domain.enums import EffectKind, EventStatus, Phase
from app.domain.events import is_event_avoided
from app.domain.hazards import clamp_probability, clamp_status, clamp_vulnerability
from app.domain.phases import next_phase, should_run_step
from app.schemas.responses import GameState

from .base import ServiceBase, transactional
from .presenter import emissions_progress


class EventService(ServiceBase):
    @transactional
    def apply_events(self, game_id: str, round_number: int) -> GameState:
        game = self.repo.get(game_id)
        if should_run_step(game.current_round, game.phase, round_number, Phase.EVENT_PHASE):
            progress = emissions_progress(game)
            for event in game.events:
                if event.round_number == round_number and event.status is EventStatus.PENDING:
                    self._process(game, event, progress)
            game.phase = next_phase(round_number, game.phase)
        return self.state(game)

    def _process(self, game: Game, event: Event, progress: int) -> None:
        if is_event_avoided(event.event_type, progress):
            event.status = EventStatus.AVOIDED
            event.applied_changes = []
            return
        changes: list[dict[str, Any]] = []
        for effect in event.effects:
            changes.extend(_apply_effect(game, effect))
        event.applied_changes = changes
        event.status = EventStatus.APPLIED


def _apply_effect(game: Game, effect: dict[str, Any]) -> list[dict[str, Any]]:
    kind = EffectKind(effect["kind"])
    delta: int = effect["delta"]
    changes: list[dict[str, Any]] = []

    if kind is EffectKind.HAZARD_PROBABILITY:
        for hazard in game.hazards:
            if hazard.id == effect["hazard_id"]:
                before, hazard.probability = hazard.probability, clamp_probability(hazard.probability + delta)
                changes.append(_change(kind, hazard.probability, before, hazard_id=hazard.id))
    elif kind is EffectKind.VULNERABILITY:
        for vulnerability in game.vulnerabilities:
            if vulnerability.element_id == effect["element_id"] and vulnerability.hazard_id == effect["hazard_id"]:
                before = vulnerability.value
                vulnerability.value = clamp_vulnerability(before + delta)
                changes.append(
                    _change(
                        kind,
                        vulnerability.value,
                        before,
                        hazard_id=vulnerability.hazard_id,
                        element_id=vulnerability.element_id,
                    )
                )
    else:
        for element in game.elements:
            if element.active and effect["element_id"] in (None, element.id):
                before = element.status
                element.status = clamp_status(before + delta)
                changes.append(_change(kind, element.status, before, element_id=element.id))
    return changes


def _change(
    kind: EffectKind,
    after: int,
    before: int,
    hazard_id: int | None = None,
    element_id: int | None = None,
) -> dict[str, Any]:
    return {
        "kind": kind.value,
        "hazard_id": hazard_id,
        "element_id": element_id,
        "before": before,
        "after": after,
    }

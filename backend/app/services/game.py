"""Game creation and setup use cases: destination, elements, hazards, vulnerabilities, teams, priorities, events."""

from sqlalchemy.orm import Session

from app.db.models import Element, Event, Game, Hazard, Team, TeamPriority, Vulnerability
from app.domain import rules
from app.domain.enums import EffectKind, EventStatus, EventType, Phase, PrioritySize, TeamRole
from app.domain.errors import InvalidInputError, InvalidPhaseError
from app.schemas.requests import (
    CreateGameRequest,
    EventInput,
    SetElementsRequest,
    SetEventsRequest,
    SetHazardsRequest,
    SetPrioritiesRequest,
    SetTeamsRequest,
    SetVulnerabilitiesRequest,
)
from app.schemas.responses import GameState

from .base import ServiceBase, transactional


class GameService(ServiceBase):
    def __init__(self, session: Session) -> None:
        super().__init__(session)

    def get_game(self, game_id: str) -> GameState:
        return self.state(self.repo.get(game_id))

    @transactional
    def create_game(self, request: CreateGameRequest) -> GameState:
        game = Game(
            destination_name=request.destination_name,
            geographic_scope=request.geographic_scope,
            total_rounds=request.total_rounds,
            phase=Phase.SETUP,
        )
        game.teams = [Team(role=role, name=rules.TEAM_NAMES[role], members=[]) for role in TeamRole]
        game.events = [
            Event(
                round_number=rules.TRANSITION_PRESSURE_ROUND,
                event_type=EventType.TRANSITION_PRESSURE,
                name="Transition pressure",
                description=("Penalty applies unless Reduce Emissions was completed once in each of Rounds 1 and 2."),
                effects=[
                    {
                        "kind": EffectKind.ELEMENT_STATUS.value,
                        "delta": rules.TRANSITION_PRESSURE_DEFAULT_PENALTY,
                        "hazard_id": None,
                        "element_id": None,
                    }
                ],
            )
        ]
        self.repo.add(game)
        return self.state(game)

    @transactional
    def set_elements(self, game_id: str, request: SetElementsRequest) -> GameState:
        game = self._game_in_setup(game_id)
        wanted = {e.name.casefold(): e.name for e in request.elements}
        existing = {e.name.casefold(): e for e in game.elements}

        removed = [e for key, e in existing.items() if key not in wanted]
        removed_ids = {e.id for e in removed}
        game.vulnerabilities[:] = [v for v in game.vulnerabilities if v.element_id not in removed_ids]
        self.repo.flush()
        for element in removed:
            game.elements.remove(element)
        for key, name in wanted.items():
            if key in existing:
                existing[key].name = name
            else:
                game.elements.append(Element(name=name, status=rules.STARTING_STATUS, active=True))
        return self.state(game)

    @transactional
    def set_hazards(self, game_id: str, request: SetHazardsRequest) -> GameState:
        game = self._game_in_setup(game_id)
        wanted = {h.name.casefold(): h for h in request.hazards}
        existing = {h.name.casefold(): h for h in game.hazards}

        removed = [h for key, h in existing.items() if key not in wanted]
        removed_ids = {h.id for h in removed}
        game.vulnerabilities[:] = [v for v in game.vulnerabilities if v.hazard_id not in removed_ids]
        self.repo.flush()
        for hazard in removed:
            game.hazards.remove(hazard)
        for key, item in wanted.items():
            if key in existing:
                existing[key].name = item.name
                existing[key].probability = item.probability
            else:
                game.hazards.append(Hazard(name=item.name, probability=item.probability))
        return self.state(game)

    @transactional
    def set_vulnerabilities(self, game_id: str, request: SetVulnerabilitiesRequest) -> GameState:
        game = self._game_in_setup(game_id)
        element_ids = {e.id for e in game.elements}
        hazard_ids = {h.id for h in game.hazards}
        if not element_ids or not hazard_ids:
            raise InvalidInputError("Set elements and hazards before the vulnerability matrix.")

        cells: dict[tuple[int, int], int] = {}
        for item in request.vulnerabilities:
            if item.element_id not in element_ids:
                raise InvalidInputError(f"Unknown element {item.element_id}.")
            if item.hazard_id not in hazard_ids:
                raise InvalidInputError(f"Unknown hazard {item.hazard_id}.")
            key = (item.element_id, item.hazard_id)
            if key in cells:
                raise InvalidInputError(f"Duplicate vulnerability for element {key[0]} and hazard {key[1]}.")
            cells[key] = item.value
        missing = [(e, h) for e in sorted(element_ids) for h in sorted(hazard_ids) if (e, h) not in cells]
        if missing:
            raise InvalidInputError(
                f"Vulnerability matrix is incomplete: {len(missing)} element-hazard pair(s) missing, "
                f"first is element {missing[0][0]} / hazard {missing[0][1]}."
            )

        existing = {(v.element_id, v.hazard_id): v for v in game.vulnerabilities}
        for (element_id, hazard_id), value in sorted(cells.items()):
            if (element_id, hazard_id) in existing:
                existing[(element_id, hazard_id)].value = value
            else:
                game.vulnerabilities.append(Vulnerability(element_id=element_id, hazard_id=hazard_id, value=value))
        return self.state(game)

    @transactional
    def set_teams(self, game_id: str, request: SetTeamsRequest) -> GameState:
        game = self.repo.get(game_id)
        if game.phase not in (Phase.SETUP, Phase.PRIORITIES):
            raise InvalidPhaseError(f"Teams cannot be changed in phase {game.phase}.")
        roles = [t.role for t in request.teams]
        if len(set(roles)) != len(roles):
            raise InvalidInputError("Each team role may appear only once.")
        by_role = {t.role: t for t in game.teams}
        for item in request.teams:
            by_role[item.role].members = [m.strip() for m in item.members if m.strip()]
        return self.state(game)

    @transactional
    def set_events(self, game_id: str, request: SetEventsRequest) -> GameState:
        game = self._game_in_setup(game_id, allowed=(Phase.SETUP, Phase.PRIORITIES))
        game.events[:] = [_new_event(item) for item in request.events]
        self.repo.flush()
        self._validate_events(game)
        return self.state(game)

    @transactional
    def complete_setup(self, game_id: str) -> GameState:
        game = self.repo.get(game_id)
        if game.phase is not Phase.SETUP:
            return self.state(game)
        if not rules.MIN_ELEMENTS <= len(game.elements) <= rules.MAX_ELEMENTS:
            raise InvalidInputError(
                f"Select between {rules.MIN_ELEMENTS} and {rules.MAX_ELEMENTS} elements "
                f"(currently {len(game.elements)})."
            )
        if not rules.MIN_HAZARDS <= len(game.hazards) <= rules.MAX_HAZARDS:
            raise InvalidInputError(
                f"Select between {rules.MIN_HAZARDS} and {rules.MAX_HAZARDS} hazards (currently {len(game.hazards)})."
            )
        expected_cells = len(game.elements) * len(game.hazards)
        if len(game.vulnerabilities) != expected_cells:
            raise InvalidInputError(
                f"Vulnerability matrix needs {expected_cells} values; {len(game.vulnerabilities)} are set."
            )
        self._validate_events(game)
        game.phase = Phase.PRIORITIES
        return self.state(game)

    @transactional
    def set_priorities(self, game_id: str, request: SetPrioritiesRequest) -> GameState:
        game = self.repo.get(game_id)
        if game.phase is not Phase.PRIORITIES:
            raise InvalidPhaseError(f"Priorities can only be set in phase PRIORITIES, not {game.phase}.")
        roles = [t.role for t in request.teams]
        if len(set(roles)) != len(roles) or set(roles) != set(TeamRole):
            raise InvalidInputError("Provide priorities for each of the three teams exactly once.")
        element_ids_in_game = {e.id for e in game.elements}
        by_role = {t.role: t for t in game.teams}

        for item in request.teams:
            entries = item.entries()
            element_ids = [element_id for element_id, _ in entries]
            if len(set(element_ids)) != len(element_ids):
                raise InvalidInputError(
                    f"{rules.TEAM_NAMES[item.role]} must choose four different elements for its priorities."
                )
            unknown = [e for e in element_ids if e not in element_ids_in_game]
            if unknown:
                raise InvalidInputError(f"Unknown element(s) {unknown} for {rules.TEAM_NAMES[item.role]}.")
            _replace_priorities(by_role[item.role], dict(entries))

        # Elements nobody prioritised leave the active destination. Checked against every element, not only the
        # active ones, so a corrected submission can bring a removed element back.
        chosen = {p.element_id for team in game.teams for p in team.priorities}
        for element in game.elements:
            element.active = element.id in chosen
        return self.state(game)

    def _game_in_setup(self, game_id: str, allowed: tuple[Phase, ...] = (Phase.SETUP,)) -> Game:
        game = self.repo.get(game_id)
        if game.phase not in allowed:
            raise InvalidPhaseError(f"Setup can no longer be changed in phase {game.phase}.")
        return game

    def _validate_events(self, game: Game) -> None:
        element_ids = {e.id for e in game.elements}
        hazard_ids = {h.id for h in game.hazards}
        transition = [e for e in game.events if e.event_type is EventType.TRANSITION_PRESSURE]
        if len(transition) != 1 or transition[0].round_number != rules.TRANSITION_PRESSURE_ROUND:
            raise InvalidInputError(
                f"Exactly one transition_pressure event is required, in round {rules.TRANSITION_PRESSURE_ROUND}."
            )
        for event in game.events:
            if event.round_number > game.total_rounds:
                raise InvalidInputError(
                    f"Event '{event.name}' is in round {event.round_number}; the game has {game.total_rounds}."
                )
            for effect in event.effects:
                if effect["hazard_id"] is not None and effect["hazard_id"] not in hazard_ids:
                    raise InvalidInputError(f"Event '{event.name}' references unknown hazard {effect['hazard_id']}.")
                if effect["element_id"] is not None and effect["element_id"] not in element_ids:
                    raise InvalidInputError(f"Event '{event.name}' references unknown element {effect['element_id']}.")
                if event.event_type is EventType.TRANSITION_PRESSURE and (
                    effect["kind"] != EffectKind.ELEMENT_STATUS.value or effect["delta"] >= 0
                ):
                    raise InvalidInputError("Transition pressure must only reduce element status.")


def _replace_priorities(team: Team, wanted: dict[int, PrioritySize]) -> None:
    """Update in place: SQLAlchemy inserts before it deletes, so replacing a (team, element) row would collide."""
    current = {p.element_id: p for p in team.priorities}
    for element_id, priority in current.items():
        if element_id not in wanted:
            team.priorities.remove(priority)
    for element_id, size in wanted.items():
        if element_id in current:
            current[element_id].size = size
        else:
            team.priorities.append(TeamPriority(element_id=element_id, size=size))


def _new_event(item: EventInput) -> Event:
    return Event(
        round_number=item.round,
        event_type=item.type,
        name=item.name,
        description=item.description,
        effects=[effect.model_dump(mode="json") for effect in item.effects],
        status=EventStatus.PENDING,
    )

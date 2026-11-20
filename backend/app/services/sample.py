"""A short scripted game, played with the real rules on a throwaway in-memory database.

Editor mode shows every screen of the game with these snapshots, so editors can reword pages they would otherwise only
reach by playing. Nothing is written to the application's database.
"""

import functools
from itertools import cycle

from pydantic import BaseModel

from app.db.base import Base
from app.db.session import create_db_engine, create_session_factory
from app.domain.enums import EffectKind, EventType, TeamRole
from app.schemas.requests import (
    ActionRequest,
    AdaptRequest,
    CreateGameRequest,
    ElementInput,
    EventEffectInput,
    EventInput,
    HazardInput,
    InvestRequest,
    PaymentInput,
    PredictRequest,
    SetElementsRequest,
    SetEventsRequest,
    SetHazardsRequest,
    SetPrioritiesRequest,
    SetTeamsRequest,
    SetVulnerabilitiesRequest,
    TeamInput,
    TeamPrioritiesInput,
    VulnerabilityInput,
)
from app.schemas.responses import GameState

from .actions import ActionService
from .events import EventService
from .game import GameService
from .hazards import HazardService
from .rounds import RoundService
from .scoring import ScoringService

ELEMENTS = ["Beach tourism", "Hiking and camping", "Tourism businesses", "Water supply", "Nature and wildlife"]
HAZARDS = {"Extreme heat": 4, "Extreme precipitation": 3, "Long drought": 2, "Wildfire": 2}
# element -> vulnerability to each hazard, in HAZARDS order
VULNERABILITY = {
    "Beach tourism": (2, 1, 1, 0),
    "Hiking and camping": (2, 2, 0, 3),
    "Tourism businesses": (1, 2, 1, 1),
    "Water supply": (1, 1, 3, 1),
    "Nature and wildlife": (1, 1, 2, 3),
}
MEMBERS = {
    TeamRole.LOCAL_GOVERNMENT: ["Alex", "Sam"],
    TeamRole.TOURISM_INDUSTRY: ["Robin", "Kim"],
    TeamRole.CIVIL_SOCIETY: ["Jo", "Charlie"],
}
PRIORITIES = {
    TeamRole.LOCAL_GOVERNMENT: (["Water supply", "Tourism businesses"], ["Beach tourism", "Nature and wildlife"]),
    TeamRole.TOURISM_INDUSTRY: (["Beach tourism", "Tourism businesses"], ["Hiking and camping", "Water supply"]),
    TeamRole.CIVIL_SOCIETY: (["Nature and wildlife", "Water supply"], ["Hiking and camping", "Beach tourism"]),
}
# Chosen so that hazards trigger in Round 0 and in Round 1 and the boards show damage.
DICE = (5, 3, 2, 1, 6, 4, 1, 5)


class SampleStateOut(BaseModel):
    key: str
    state: GameState


class SampleGameOut(BaseModel):
    """Snapshots of one sample game, in the order the screens appear."""

    states: list[SampleStateOut]


class _CyclingDice:
    def __init__(self) -> None:
        self._values = cycle(DICE)

    def roll(self) -> int:
        return next(self._values)


@functools.cache
def sample_game() -> SampleGameOut:
    engine = create_db_engine("sqlite://")
    Base.metadata.create_all(engine)
    session = create_session_factory(engine)()
    dice = _CyclingDice()
    games, rounds = GameService(session), RoundService(session)
    actions, hazards = ActionService(session, dice), HazardService(session, dice)
    events, scoring = EventService(session), ScoringService(session)
    states: list[SampleStateOut] = []

    def snap(key: str, state: GameState) -> GameState:
        states.append(SampleStateOut(key=key, state=state))
        return state

    try:
        state = games.create_game(
            CreateGameRequest(destination_name="Sample Coast", geographic_scope="Region", total_rounds=4)
        )
        game_id = state.id
        state = games.set_elements(game_id, SetElementsRequest(elements=[ElementInput(name=n) for n in ELEMENTS]))
        state = games.set_hazards(
            game_id, SetHazardsRequest(hazards=[HazardInput(name=n, probability=p) for n, p in HAZARDS.items()])
        )
        element_ids = {e.name: e.id for e in state.elements}
        hazard_ids = {h.name: h.id for h in state.hazards}
        element, hazard = element_ids.__getitem__, hazard_ids.__getitem__
        state = games.set_vulnerabilities(
            game_id,
            SetVulnerabilitiesRequest(
                vulnerabilities=[
                    VulnerabilityInput(element_id=element(name), hazard_id=hazard(hazard_name), value=values[i])
                    for name, values in VULNERABILITY.items()
                    for i, hazard_name in enumerate(HAZARDS)
                ]
            ),
        )
        state = games.set_events(
            game_id,
            SetEventsRequest(
                events=[
                    EventInput(
                        round=1,
                        name="Rising temperatures",
                        description="Warmer conditions make extreme heat more likely.",
                        effects=[
                            EventEffectInput(
                                kind=EffectKind.HAZARD_PROBABILITY, delta=1, hazard_id=hazard("Extreme heat")
                            )
                        ],
                    ),
                    EventInput(
                        round=2,
                        name="Longer dry seasons",
                        description="Dry periods last longer, making long droughts more likely.",
                        effects=[
                            EventEffectInput(
                                kind=EffectKind.HAZARD_PROBABILITY, delta=1, hazard_id=hazard("Long drought")
                            )
                        ],
                    ),
                    EventInput(
                        round=3,
                        type=EventType.TRANSITION_PRESSURE,
                        name="Transition pressure",
                        description="Applies unless Reduce Emissions was completed once in each of Rounds 1 and 2.",
                        effects=[
                            EventEffectInput(
                                kind=EffectKind.ELEMENT_STATUS, delta=-2, element_id=element("Tourism businesses")
                            )
                        ],
                    ),
                ]
            ),
        )
        state = games.set_teams(
            game_id, SetTeamsRequest(teams=[TeamInput(role=role, members=names) for role, names in MEMBERS.items()])
        )
        snap("setup", state)
        snap("priorities", games.complete_setup(game_id))
        state = games.set_priorities(
            game_id,
            SetPrioritiesRequest(
                teams=[
                    TeamPrioritiesInput(role=role, large=[element(n) for n in large], small=[element(n) for n in small])
                    for role, (large, small) in PRIORITIES.items()
                ]
            ),
        )
        snap("priorities_set", state)
        snap("round0_prediction", rounds.start_round_zero(game_id))
        snap("round0_adaptation", actions.predict(game_id, PredictRequest(hazard_id=hazard("Extreme heat"))))
        snap(
            "round0_investment",
            actions.adapt(game_id, AdaptRequest(element_id=element("Water supply"), hazard_id=hazard("Long drought"))),
        )
        snap("round0_hazards", actions.invest(game_id, InvestRequest(element_id=element("Beach tourism"))))
        snap("round0_result", hazards.resolve_hazards(game_id, 0))
        snap("round0_scores", scoring.score_round(game_id, 0))
        snap("allocation", rounds.complete_round(game_id, 0))
        snap("actions", rounds.allocate_resources(game_id, 1))
        actions.adapt(
            game_id,
            AdaptRequest(
                element_id=element("Nature and wildlife"),
                hazard_id=hazard("Wildfire"),
                payments=[
                    PaymentInput(team=TeamRole.LOCAL_GOVERNMENT, money=1, authority=2),
                    PaymentInput(team=TeamRole.CIVIL_SOCIETY, knowledge=1),
                ],
            ),
        )
        snap(
            "actions_taken",
            actions.reduce_emissions(
                game_id,
                ActionRequest(
                    payments=[
                        PaymentInput(team=TeamRole.TOURISM_INDUSTRY, money=1),
                        PaymentInput(team=TeamRole.CIVIL_SOCIETY, knowledge=1),
                        PaymentInput(team=TeamRole.LOCAL_GOVERNMENT, authority=1),
                    ]
                ),
            ),
        )
        snap("hazards", rounds.close_actions(game_id, 1))
        snap("hazard_results", hazards.resolve_hazards(game_id, 1))
        snap("event", events.apply_events(game_id, 1))
        snap("scores", scoring.score_round(game_id, 1))
        snap("final", rounds.finish_game(game_id))
    finally:
        session.close()
        engine.dispose()
    return SampleGameOut(states=states)

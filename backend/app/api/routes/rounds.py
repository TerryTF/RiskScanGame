from typing import Annotated

from fastapi import APIRouter, Path

from app.api.deps import (
    EventServiceDep,
    HazardServiceDep,
    RoundServiceDep,
    ScoringServiceDep,
)
from app.schemas.responses import GameState

router = APIRouter(prefix="/games/{game_id}/rounds", tags=["rounds"])
finish_router = APIRouter(prefix="/games/{game_id}", tags=["rounds"])

RoundNumber = Annotated[int, Path(ge=0, description="0 is the Round 0 tutorial; 1 and up are regular rounds.")]


@router.post("/0/start", summary="Start the Round 0 guided tutorial")
def start_round_zero(game_id: str, service: RoundServiceDep) -> GameState:
    return service.start_round_zero(game_id)


@router.post("/0/skip", summary="Skip the Round 0 tutorial and go straight to Round 1")
def skip_round_zero(game_id: str, service: RoundServiceDep) -> GameState:
    return service.skip_round_zero(game_id)


@router.post("/{round_number}/allocate-resources", summary="Allocate fresh team resources for a regular round")
def allocate_resources(game_id: str, round_number: RoundNumber, service: RoundServiceDep) -> GameState:
    return service.allocate_resources(game_id, round_number)


@router.post("/{round_number}/close-actions", summary="Close the action phase")
def close_actions(game_id: str, round_number: RoundNumber, service: RoundServiceDep) -> GameState:
    return service.close_actions(game_id, round_number)


@router.post("/{round_number}/resolve-hazards", summary="Resolve hazards (reusing predicted dice) and apply damage")
def resolve_hazards(game_id: str, round_number: RoundNumber, service: HazardServiceDep) -> GameState:
    return service.resolve_hazards(game_id, round_number)


@router.post("/{round_number}/apply-event", summary="Apply the configured events of the round")
def apply_event(game_id: str, round_number: RoundNumber, service: EventServiceDep) -> GameState:
    return service.apply_events(game_id, round_number)


@router.post("/{round_number}/score", summary="Snapshot team scores for the round")
def score_round(game_id: str, round_number: RoundNumber, service: ScoringServiceDep) -> GameState:
    return service.score_round(game_id, round_number)


@router.post("/{round_number}/complete", summary="Complete the round, expire resources, open the next round")
def complete_round(game_id: str, round_number: RoundNumber, service: RoundServiceDep) -> GameState:
    return service.complete_round(game_id, round_number)


@finish_router.post("/finish", summary="Finish the game after a scored round; that round's scores are final")
def finish_game(game_id: str, service: RoundServiceDep) -> GameState:
    return service.finish_game(game_id)

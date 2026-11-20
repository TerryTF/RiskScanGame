from fastapi import APIRouter, status

from app.api.deps import GameServiceDep
from app.schemas.requests import (
    CreateGameRequest,
    SetElementsRequest,
    SetEventsRequest,
    SetHazardsRequest,
    SetPrioritiesRequest,
    SetTeamsRequest,
    SetVulnerabilitiesRequest,
)
from app.schemas.responses import GameState

router = APIRouter(prefix="/games", tags=["game setup"])
# Readable without logging in, so participants can follow the board.
public_router = APIRouter(prefix="/games", tags=["game setup"])


@router.post("", status_code=status.HTTP_201_CREATED, summary="Create a game (destination and rounds)")
def create_game(body: CreateGameRequest, service: GameServiceDep) -> GameState:
    return service.create_game(body)


@public_router.get("/{game_id}", summary="Get the full game state")
def get_game(game_id: str, service: GameServiceDep) -> GameState:
    return service.get_game(game_id)


@router.put("/{game_id}/elements", summary="Set the destination elements (status starts at 10)")
def set_elements(game_id: str, body: SetElementsRequest, service: GameServiceDep) -> GameState:
    return service.set_elements(game_id, body)


@router.put("/{game_id}/hazards", summary="Set hazards and their probability thresholds (1-6)")
def set_hazards(game_id: str, body: SetHazardsRequest, service: GameServiceDep) -> GameState:
    return service.set_hazards(game_id, body)


@router.put("/{game_id}/vulnerabilities", summary="Set the complete element-hazard vulnerability matrix (0-3)")
def set_vulnerabilities(game_id: str, body: SetVulnerabilitiesRequest, service: GameServiceDep) -> GameState:
    return service.set_vulnerabilities(game_id, body)


@router.put("/{game_id}/teams", summary="Set team members")
def set_teams(game_id: str, body: SetTeamsRequest, service: GameServiceDep) -> GameState:
    return service.set_teams(game_id, body)


@router.put("/{game_id}/events", summary="Configure round events (replaces all pending events)")
def set_events(game_id: str, body: SetEventsRequest, service: GameServiceDep) -> GameState:
    return service.set_events(game_id, body)


@router.post("/{game_id}/setup/complete", summary="Validate setup and move to team priorities")
def complete_setup(game_id: str, service: GameServiceDep) -> GameState:
    return service.complete_setup(game_id)


@router.put("/{game_id}/priorities", summary="Set each team's 2 large and 2 small priorities")
def set_priorities(game_id: str, body: SetPrioritiesRequest, service: GameServiceDep) -> GameState:
    return service.set_priorities(game_id, body)

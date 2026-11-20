from fastapi import APIRouter

from app.api.deps import ActionServiceDep
from app.schemas.requests import ActionRequest, AdaptRequest, DiversifyRequest, InvestRequest, PredictRequest
from app.schemas.responses import GameState

router = APIRouter(prefix="/games/{game_id}/actions", tags=["actions"])


@router.post("/predict", summary="Hazard Prediction: store dice for the current and next round")
def predict(game_id: str, body: PredictRequest, service: ActionServiceDep) -> GameState:
    return service.predict(game_id, body)


@router.post("/adapt", summary="Risk Adaptation: reduce one vulnerability by 1 (minimum 0)")
def adapt(game_id: str, body: AdaptRequest, service: ActionServiceDep) -> GameState:
    return service.adapt(game_id, body)


@router.post("/invest", summary="Local Investment: increase one element's status by 2")
def invest(game_id: str, body: InvestRequest, service: ActionServiceDep) -> GameState:
    return service.invest(game_id, body)


@router.post(
    "/diversify",
    summary="Diversification: add a new element (status 7 by default); each team may move or split one marker onto it",
)
def diversify(game_id: str, body: DiversifyRequest, service: ActionServiceDep) -> GameState:
    return service.diversify(game_id, body)


@router.post("/reduce-emissions", summary="Reduce Emissions: once in each of Rounds 1 and 2")
def reduce_emissions(game_id: str, service: ActionServiceDep, body: ActionRequest | None = None) -> GameState:
    return service.reduce_emissions(game_id, body or ActionRequest())

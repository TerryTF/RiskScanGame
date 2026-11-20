from collections.abc import Iterator
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import APIKeyCookie
from sqlalchemy.orm import Session

from app.domain.dice import DiceProvider
from app.security import SESSION_COOKIE, Auth
from app.services.actions import ActionService
from app.services.events import EventService
from app.services.game import GameService
from app.services.hazards import HazardService
from app.services.rounds import RoundService
from app.services.scoring import ScoringService
from app.services.texts import TextService


def get_session(request: Request) -> Iterator[Session]:
    session = request.app.state.session_factory()
    try:
        yield session
    finally:
        session.close()


def get_dice(request: Request) -> DiceProvider:
    dice: DiceProvider = request.app.state.dice
    return dice


SessionDep = Annotated[Session, Depends(get_session)]
DiceDep = Annotated[DiceProvider, Depends(get_dice)]


def get_auth(request: Request) -> Auth:
    auth: Auth = request.app.state.auth
    return auth


AuthDep = Annotated[Auth, Depends(get_auth)]
session_cookie = APIKeyCookie(name=SESSION_COOKIE, auto_error=False, description="Set by POST /api/v1/auth/login.")


def require_user(auth: AuthDep, token: Annotated[str | None, Depends(session_cookie)]) -> str:
    username = auth.user_for(token)
    if username is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Log in to continue.")
    return username


UserDep = Annotated[str, Depends(require_user)]


def get_game_service(session: SessionDep) -> GameService:
    return GameService(session)


def get_round_service(session: SessionDep) -> RoundService:
    return RoundService(session)


def get_action_service(session: SessionDep, dice: DiceDep) -> ActionService:
    return ActionService(session, dice)


def get_hazard_service(session: SessionDep, dice: DiceDep) -> HazardService:
    return HazardService(session, dice)


def get_event_service(session: SessionDep) -> EventService:
    return EventService(session)


def get_scoring_service(session: SessionDep) -> ScoringService:
    return ScoringService(session)


def get_text_service(session: SessionDep) -> TextService:
    return TextService(session)


GameServiceDep = Annotated[GameService, Depends(get_game_service)]
RoundServiceDep = Annotated[RoundService, Depends(get_round_service)]
ActionServiceDep = Annotated[ActionService, Depends(get_action_service)]
HazardServiceDep = Annotated[HazardService, Depends(get_hazard_service)]
EventServiceDep = Annotated[EventService, Depends(get_event_service)]
ScoringServiceDep = Annotated[ScoringService, Depends(get_scoring_service)]
TextServiceDep = Annotated[TextService, Depends(get_text_service)]

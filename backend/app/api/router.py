from fastapi import APIRouter, Depends

from app.api.deps import require_user
from app.api.routes import actions, auth, catalogue, editor, games, rounds, texts

api_router = APIRouter(prefix="/api/v1")

# Open to everyone: logging in, and the reads the participants' board needs.
api_router.include_router(auth.router)
api_router.include_router(catalogue.router)
api_router.include_router(games.public_router)
api_router.include_router(texts.public_router)

# Everything else needs the moderator's login. New routers belong here unless players must reach them.
protected = APIRouter(dependencies=[Depends(require_user)])
protected.include_router(games.router)
protected.include_router(rounds.router)
protected.include_router(rounds.finish_router)
protected.include_router(actions.router)
protected.include_router(texts.router)
protected.include_router(editor.router)
api_router.include_router(protected)

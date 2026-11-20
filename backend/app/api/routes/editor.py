from fastapi import APIRouter

from app.services.sample import SampleGameOut, sample_game

router = APIRouter(prefix="/editor", tags=["texts"])


@router.get("/sample-game", summary="Snapshots of a scripted sample game, used to preview every screen in editor mode")
def get_sample_game() -> SampleGameOut:
    return sample_game()

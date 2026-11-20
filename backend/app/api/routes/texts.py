from fastapi import APIRouter

from app.api.deps import TextServiceDep
from app.schemas.texts import SaveTextsRequest, TextsOut

router = APIRouter(prefix="/texts", tags=["texts"])
# Readable without logging in: the participants' board shows the edited wording too.
public_router = APIRouter(prefix="/texts", tags=["texts"])


@public_router.get("", summary="Edited screen and card texts (keys not listed use the default wording)")
def get_texts(service: TextServiceDep) -> TextsOut:
    return service.get_texts()


@router.put("", summary="Save edited texts; null restores a text's default wording")
def save_texts(body: SaveTextsRequest, service: TextServiceDep) -> TextsOut:
    return service.save_texts(body)


@router.post("/undo", summary="Undo the last save once: put back the texts as they were before it")
def undo_last_save(service: TextServiceDep) -> TextsOut:
    return service.undo_last_save()

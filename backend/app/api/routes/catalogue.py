from fastapi import APIRouter

from app.schemas.catalogue import CatalogueOut
from app.services.catalogue import build_catalogue

router = APIRouter(prefix="/catalogue", tags=["catalogue"])


@router.get("", summary="Standard elements, hazards, role cards, action cards, event examples and rule limits")
def get_catalogue() -> CatalogueOut:
    return build_catalogue()

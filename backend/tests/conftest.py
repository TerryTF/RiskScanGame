from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine

from app.db.session import create_db_engine
from app.domain.dice import FixedDiceProvider
from app.main import create_app
from tests.helpers import log_in, settings_with_login


@pytest.fixture
def dice() -> FixedDiceProvider:
    return FixedDiceProvider()


@pytest.fixture
def engine() -> Engine:
    return create_db_engine("sqlite://")


@pytest.fixture
def client(dice: FixedDiceProvider, engine: Engine) -> Iterator[TestClient]:
    """A client logged in as the moderator."""
    app = create_app(settings_with_login(), dice_provider=dice, engine=engine)
    with TestClient(app) as test_client:
        yield log_in(test_client)

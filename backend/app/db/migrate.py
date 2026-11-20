from alembic.config import Config
from sqlalchemy import Engine

from alembic import command

from .session import BACKEND_DIR


def alembic_config() -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    return config


def upgrade_to_head(engine: Engine) -> None:
    """Run Alembic migrations on the given engine (works for in-memory SQLite too)."""
    config = alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")

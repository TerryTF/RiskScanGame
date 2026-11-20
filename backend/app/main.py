import secrets
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import Engine

from app import __version__
from app.api.errors import register_error_handlers
from app.api.router import api_router
from app.config import Settings
from app.db.migrate import upgrade_to_head
from app.db.session import create_db_engine, create_session_factory
from app.domain.dice import DiceProvider, SeededDiceProvider, SystemDiceProvider
from app.schemas.responses import HealthResponse
from app.security import Auth

LOGIN_NOT_CONFIGURED = (
    "No login is configured, so nobody could use the game. In the backend folder run "
    "`.venv/bin/python scripts/set_login.py` to choose a username and password, then start the server again."
)


def create_app(
    settings: Settings | None = None,
    dice_provider: DiceProvider | None = None,
    engine: Engine | None = None,
) -> FastAPI:
    """Build the application. Tests inject a fixed dice provider and an in-memory engine."""
    if settings is None:
        settings = Settings.from_env()
        if not settings.login_configured:
            raise RuntimeError(LOGIN_NOT_CONFIGURED)
    db_engine = engine or create_db_engine(settings.database_url)
    if dice_provider is None:
        dice_provider = (
            SeededDiceProvider(settings.dice_seed) if settings.dice_seed is not None else SystemDiceProvider()
        )

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if settings.auto_migrate:
            upgrade_to_head(db_engine)
        yield

    app = FastAPI(
        title="RiskScan API",
        version=__version__,
        description="Deterministic, moderator-driven backend for the RiskScan climate-resilience game.",
        lifespan=lifespan,
    )
    app.state.session_factory = create_session_factory(db_engine)
    app.state.dice = dice_provider
    app.state.engine = db_engine
    app.state.auth = Auth(
        settings.auth_username, settings.auth_password_hash, settings.secret_key or secrets.token_urlsafe(32)
    )

    if settings.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(settings.cors_origins),
            allow_methods=["*"],
            allow_headers=["*"],
        )
    register_error_handlers(app)

    @app.get("/health", tags=["health"], summary="Liveness check")
    def health() -> HealthResponse:
        return HealthResponse(status="ok", version=__version__)

    app.include_router(api_router)
    return app

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from sqlalchemy.exc import OperationalError

from app.domain.errors import ConflictError, DomainError, InvalidInputError, NotFoundError


def _status_for(error: DomainError) -> int:
    if isinstance(error, NotFoundError):
        return status.HTTP_404_NOT_FOUND
    if isinstance(error, ConflictError):
        return status.HTTP_409_CONFLICT
    if isinstance(error, InvalidInputError):
        # numeric on purpose: the named constant differs between the Starlette versions fastapi>=0.115 allows
        return 422
    return status.HTTP_400_BAD_REQUEST


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(DomainError)
    async def handle_domain_error(_: Request, exc: DomainError) -> JSONResponse:
        return JSONResponse(status_code=_status_for(exc), content={"detail": exc.message})

    @app.exception_handler(OperationalError)
    async def handle_operational_error(_: Request, exc: OperationalError) -> JSONResponse:
        # Every request takes a SQLite write lock (BEGIN IMMEDIATE, see app/db/session.py) and waits up to
        # SQLITE_LOCK_TIMEOUT_SECONDS for it. Under enough concurrent load that wait can still time out; that
        # is transient contention, not a bug in the request, so it must not surface as a bare 500.
        if "database is locked" in str(exc.orig):
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"detail": "The game database is busy handling another request. Please retry."},
            )
        raise exc

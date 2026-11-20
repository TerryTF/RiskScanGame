import sqlite3
from collections.abc import Callable
from pathlib import Path

from sqlalchemy import Connection, Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

# How long a request waits for another transaction on the same SQLite file before giving up.
SQLITE_LOCK_TIMEOUT_SECONDS = 30


def create_db_engine(database_url: str) -> Engine:
    kwargs: dict[str, object] = {}
    is_sqlite = database_url.startswith("sqlite")
    if is_sqlite:
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": SQLITE_LOCK_TIMEOUT_SECONDS}
        if database_url in ("sqlite://", "sqlite:///:memory:"):
            kwargs["poolclass"] = StaticPool
    engine = create_engine(database_url, **kwargs)
    if is_sqlite:
        event.listen(engine, "connect", _configure_sqlite_connection)
        event.listen(engine, "begin", _begin_immediate)
    return engine


def _configure_sqlite_connection(dbapi_connection: sqlite3.Connection, _record: object) -> None:
    # pysqlite only opens a transaction at the first INSERT/UPDATE/DELETE, after a use case has already read the
    # state it is about to change. Disable that so _begin_immediate decides when the transaction starts.
    dbapi_connection.isolation_level = None
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


def _begin_immediate(connection: Connection) -> None:
    # Take SQLite's write lock before the first read. Concurrent use cases queue here and then see the committed
    # result of the previous one, so read-check-write rules (phase guards, balances, stored dice) cannot interleave.
    connection.exec_driver_sql("BEGIN IMMEDIATE")


def create_session_factory(engine: Engine) -> Callable[[], Session]:
    return sessionmaker(bind=engine, expire_on_commit=False, autoflush=True)


BACKEND_DIR = Path(__file__).resolve().parents[2]

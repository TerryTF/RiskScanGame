from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, inspect, text

from alembic import command
from app.db.base import Base
from app.db.migrate import alembic_config, upgrade_to_head
from app.db.session import create_db_engine


def test_migrations_create_schema_matching_models() -> None:
    engine: Engine = create_db_engine("sqlite://")
    upgrade_to_head(engine)

    assert set(inspect(engine).get_table_names()) >= set(Base.metadata.tables)
    with engine.connect() as connection:
        diff = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    assert diff == []


def test_migrations_are_repeatable() -> None:
    engine = create_db_engine("sqlite://")
    upgrade_to_head(engine)
    upgrade_to_head(engine)


def test_revision_0002_keeps_existing_data_and_downgrades_cleanly() -> None:
    engine = create_db_engine("sqlite://")
    config = alembic_config()
    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "0001")
        connection.execute(
            text(
                "INSERT INTO games (id, destination_name, total_rounds, phase, created_at, updated_at) "
                "VALUES ('g1', 'Old game', 4, 'SETUP', '2026-01-01', '2026-01-01')"
            )
        )
        connection.execute(text("INSERT INTO hazards (id, game_id, name, probability) VALUES (1, 'g1', 'Flood', 3)"))
        connection.execute(
            text(
                "INSERT INTO hazard_rolls "
                "(id, game_id, hazard_id, round_number, die, source, resolved, probability_at_roll, triggered) VALUES "
                "(1, 'g1', 1, 1, 2, 'rolled', 1, 3, 1), (2, 'g1', 1, 2, 6, 'rolled', 1, 3, 0)"
            )
        )

        command.upgrade(config, "head")
        assert connection.execute(text("SELECT geographic_scope FROM games")).scalar_one() == "Region"
        rolls = connection.execute(text("SELECT id, applied FROM hazard_rolls ORDER BY id")).all()
        assert [(row[0], bool(row[1])) for row in rolls] == [(1, True), (2, False)]

        command.downgrade(config, "0001")
        assert "applied" not in {c["name"] for c in inspect(connection).get_columns("hazard_rolls")}
        assert "geographic_scope" not in {c["name"] for c in inspect(connection).get_columns("games")}
        assert connection.execute(text("SELECT COUNT(*) FROM hazard_rolls")).scalar_one() == 2

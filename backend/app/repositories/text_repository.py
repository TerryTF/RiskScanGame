from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.db.models import TextOverride, TextUndo

# The only row of text_undo: one previous version is kept, never more.
UNDO_ROW_ID = 1


class TextRepository:
    """Persistence boundary for the editor's text overrides and the copy kept to undo the last save."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def all(self) -> dict[str, str]:
        rows = self._session.scalars(select(TextOverride).order_by(TextOverride.key)).all()
        return {row.key: row.value for row in rows}

    def put(self, key: str, value: str) -> None:
        row = self._session.get(TextOverride, key)
        if row is None:
            self._session.add(TextOverride(key=key, value=value))
        else:
            row.value = value

    def remove(self, key: str) -> None:
        self._session.execute(delete(TextOverride).where(TextOverride.key == key))

    def replace_all(self, texts: dict[str, str]) -> None:
        self._session.execute(delete(TextOverride))
        self._session.add_all(TextOverride(key=key, value=value) for key, value in texts.items())

    def previous(self) -> TextUndo | None:
        return self._session.get(TextUndo, UNDO_ROW_ID)

    def keep_previous(self, texts: dict[str, str]) -> None:
        """Remember `texts` as the version to go back to, replacing any older one."""
        row = self.previous()
        if row is None:
            self._session.add(TextUndo(id=UNDO_ROW_ID, texts=texts))
        else:
            row.texts = texts
            row.saved_at = datetime.now(UTC)

    def forget_previous(self) -> None:
        self._session.execute(delete(TextUndo))

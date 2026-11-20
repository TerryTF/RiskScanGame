from app.domain.errors import ConflictError
from app.repositories.text_repository import TextRepository
from app.schemas.texts import SaveTextsRequest, TextsOut

from .base import ServiceBase, transactional


class TextService(ServiceBase):
    """The wording editors changed in editor mode. Every game and board uses it."""

    def _out(self, repo: TextRepository) -> TextsOut:
        return TextsOut(texts=repo.all(), undo_available=repo.previous() is not None)

    def get_texts(self) -> TextsOut:
        return self._out(TextRepository(self.session))

    @transactional
    def save_texts(self, body: SaveTextsRequest) -> TextsOut:
        repo = TextRepository(self.session)
        before = repo.all()
        for key, value in body.texts.items():
            if value is None:
                repo.remove(key)
            else:
                repo.put(key, value)
        self.session.flush()
        # Only the version before this save is kept; a save that changes nothing keeps the older one.
        if repo.all() != before:
            repo.keep_previous(before)
        self.session.flush()
        return self._out(repo)

    @transactional
    def undo_last_save(self) -> TextsOut:
        repo = TextRepository(self.session)
        previous = repo.previous()
        if previous is None:
            raise ConflictError("There is no saved change to undo.")
        repo.replace_all(dict(previous.texts))
        repo.forget_previous()
        self.session.flush()
        return self._out(repo)

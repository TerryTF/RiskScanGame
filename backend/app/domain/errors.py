class DomainError(Exception):
    """Base class for rule violations. The API layer maps subclasses to HTTP status codes."""

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFoundError(DomainError):
    """A referenced entity does not exist (404)."""


class InvalidInputError(DomainError):
    """The request content breaks a rule independent of the game state (422)."""


class ConflictError(DomainError):
    """The request is valid but does not fit the current game state (409)."""


class InvalidPhaseError(ConflictError):
    """The operation is not allowed in the current phase or round."""


class InsufficientResourcesError(ConflictError):
    """A team cannot afford its contribution."""

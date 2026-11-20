from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

TEXT_KEY_PATTERN = r"^[A-Za-z0-9_.\-]+$"
TEXT_KEY_MAX_LENGTH = 160
TEXT_VALUE_MAX_LENGTH = 2000
TEXT_CHANGES_MAX = 2000

TextKey = Annotated[str, StringConstraints(min_length=1, max_length=TEXT_KEY_MAX_LENGTH, pattern=TEXT_KEY_PATTERN)]
TextValue = Annotated[str, StringConstraints(max_length=TEXT_VALUE_MAX_LENGTH)]


class TextsOut(BaseModel):
    texts: dict[str, str] = Field(description="Edited texts by key. Missing keys use the default wording.")
    undo_available: bool = Field(
        description="True when the last save can be undone. Only the version before the last save is kept."
    )


class SaveTextsRequest(BaseModel):
    # Whitespace is kept as typed: editors may want trailing spaces or line breaks.
    model_config = ConfigDict(extra="forbid")

    texts: dict[TextKey, TextValue | None] = Field(
        max_length=TEXT_CHANGES_MAX,
        description="Texts to change by key. A string replaces the wording; null restores the default.",
    )

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.domain import rules
from app.domain.enums import EffectKind, EventType, MarkerChange, PrioritySize, TeamRole


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


def _unique(values: list[str], label: str) -> list[str]:
    seen = {v.casefold() for v in values}
    if len(seen) != len(values):
        raise ValueError(f"{label} names must be unique.")
    return values


class CreateGameRequest(StrictModel):
    destination_name: str = Field(min_length=1, max_length=120)
    geographic_scope: str = Field(
        default=rules.DEFAULT_GEOGRAPHIC_SCOPE,
        min_length=1,
        max_length=120,
        description="Free text describing the destination's scale, for example Region, City or Island.",
    )
    total_rounds: int = Field(
        default=rules.DEFAULT_REGULAR_ROUNDS,
        ge=rules.MIN_REGULAR_ROUNDS,
        le=rules.MAX_REGULAR_ROUNDS,
        description="Number of regular rounds (Round 0 tutorial not included).",
    )


class ElementInput(StrictModel):
    name: str = Field(min_length=1, max_length=120)


class SetElementsRequest(StrictModel):
    elements: list[ElementInput] = Field(min_length=rules.MIN_ELEMENTS, max_length=rules.MAX_ELEMENTS)

    @field_validator("elements")
    @classmethod
    def _names_unique(cls, value: list[ElementInput]) -> list[ElementInput]:
        _unique([e.name for e in value], "Element")
        return value


class HazardInput(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    probability: int = Field(ge=rules.MIN_PROBABILITY, le=rules.MAX_PROBABILITY)


class SetHazardsRequest(StrictModel):
    hazards: list[HazardInput] = Field(min_length=rules.MIN_HAZARDS, max_length=rules.MAX_HAZARDS)

    @field_validator("hazards")
    @classmethod
    def _names_unique(cls, value: list[HazardInput]) -> list[HazardInput]:
        _unique([h.name for h in value], "Hazard")
        return value


class VulnerabilityInput(StrictModel):
    element_id: int
    hazard_id: int
    value: int = Field(ge=rules.MIN_VULNERABILITY, le=rules.MAX_VULNERABILITY)


class SetVulnerabilitiesRequest(StrictModel):
    vulnerabilities: list[VulnerabilityInput]


class TeamInput(StrictModel):
    role: TeamRole
    members: list[str] = Field(default_factory=list, max_length=30)


class SetTeamsRequest(StrictModel):
    teams: list[TeamInput]


class TeamPrioritiesInput(StrictModel):
    role: TeamRole
    large: list[int] = Field(min_length=rules.LARGE_PRIORITIES_PER_TEAM, max_length=rules.LARGE_PRIORITIES_PER_TEAM)
    small: list[int] = Field(min_length=rules.SMALL_PRIORITIES_PER_TEAM, max_length=rules.SMALL_PRIORITIES_PER_TEAM)

    def entries(self) -> list[tuple[int, PrioritySize]]:
        return [(e, PrioritySize.LARGE) for e in self.large] + [(e, PrioritySize.SMALL) for e in self.small]


class SetPrioritiesRequest(StrictModel):
    teams: list[TeamPrioritiesInput]


class EventEffectInput(StrictModel):
    kind: EffectKind
    delta: int = Field(ge=-10, le=10)
    hazard_id: int | None = None
    element_id: int | None = Field(
        default=None, description="For element_status effects, null means every active element."
    )

    @model_validator(mode="after")
    def _targets_match_kind(self) -> "EventEffectInput":
        if self.delta == 0:
            raise ValueError("Effect delta must not be 0.")
        if self.kind is EffectKind.HAZARD_PROBABILITY and (self.hazard_id is None or self.element_id is not None):
            raise ValueError("hazard_probability effects need hazard_id and no element_id.")
        if self.kind is EffectKind.VULNERABILITY and (self.hazard_id is None or self.element_id is None):
            raise ValueError("vulnerability effects need both hazard_id and element_id.")
        if self.kind is EffectKind.ELEMENT_STATUS and self.hazard_id is not None:
            raise ValueError("element_status effects must not set hazard_id.")
        return self


class EventInput(StrictModel):
    round: int = Field(ge=1)
    type: EventType = EventType.STANDARD
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)
    effects: list[EventEffectInput] = Field(min_length=1, max_length=20)


class SetEventsRequest(StrictModel):
    events: list[EventInput] = Field(max_length=30)


class PaymentInput(StrictModel):
    team: TeamRole
    money: int = Field(default=0, ge=0, le=20)
    knowledge: int = Field(default=0, ge=0, le=20)
    authority: int = Field(default=0, ge=0, le=20)


class ActionRequest(StrictModel):
    payments: list[PaymentInput] = Field(
        default_factory=list,
        description="Exact contributors and amounts. Must be empty in Round 0 (free actions).",
    )


class PredictRequest(ActionRequest):
    hazard_id: int


class AdaptRequest(ActionRequest):
    element_id: int
    hazard_id: int


class InvestRequest(ActionRequest):
    element_id: int


class HazardVulnerabilityInput(StrictModel):
    hazard_id: int
    value: int = Field(ge=rules.MIN_VULNERABILITY, le=rules.MAX_VULNERABILITY)


class MarkerChangeInput(StrictModel):
    team: TeamRole
    change: MarkerChange
    element_id: int = Field(description="The element that holds the team's marker now.")


class DiversifyRequest(ActionRequest):
    name: str = Field(min_length=1, max_length=120, description="Name of the new destination element.")
    status: int = Field(
        default=rules.DIVERSIFICATION_STATUS,
        ge=rules.MIN_STATUS,
        le=rules.STARTING_STATUS,
        description="Starting status of the new element: 7 unless the moderator changes it.",
    )
    vulnerabilities: list[HazardVulnerabilityInput] = Field(
        description="The new element's vulnerability to every hazard in the game, one value per hazard."
    )
    marker_changes: list[MarkerChangeInput] = Field(
        default_factory=list,
        max_length=len(TeamRole),
        description="At most one change per team: move one marker, or split one large marker, onto the new element. "
        "A team that is not listed keeps its markers.",
    )

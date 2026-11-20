from pydantic import BaseModel

from app.domain.enums import EffectKind, EventType, TeamRole

from .responses import ResourcesOut


class ElementGroupOut(BaseModel):
    name: str
    elements: list[str]


class TeamCardOut(BaseModel):
    role: TeamRole
    name: str
    interests: list[str]
    allowance: ResourcesOut


class ActionCostOut(BaseModel):
    money: int
    knowledge: int
    authority: int
    wild: int


class ActionCardOut(BaseModel):
    key: str
    name: str
    description: str
    cost: ActionCostOut
    free_in_round_zero: bool
    rounds: list[int] | None
    available: bool


class TemplateEffectOut(BaseModel):
    kind: EffectKind
    delta: int
    hazard: str | None
    element: str | None


class EventTemplateOut(BaseModel):
    key: str
    name: str
    description: str
    type: EventType
    suggested_round: int | None
    effects: list[TemplateEffectOut]


class LimitsOut(BaseModel):
    regular_rounds: list[int]
    default_regular_rounds: int
    elements_min: int
    elements_max: int
    hazards_min: int
    hazards_max: int
    probability_min: int
    probability_max: int
    vulnerability_min: int
    vulnerability_max: int
    starting_status: int
    events_per_round_max: int
    transition_pressure_round: int
    reduce_emissions_rounds: list[int]
    reduce_emissions_target: int
    round_zero_damage_limit: int
    large_priorities_per_team: int
    small_priorities_per_team: int
    local_investment_gain: int
    adaptation_reduction: int
    diversification_status: int


class CatalogueOut(BaseModel):
    """Standard game content and rule limits, so clients do not hard-code them."""

    element_groups: list[ElementGroupOut]
    hazards: list[str]
    teams: list[TeamCardOut]
    actions: list[ActionCardOut]
    event_templates: list[EventTemplateOut]
    limits: LimitsOut

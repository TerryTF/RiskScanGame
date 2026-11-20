from typing import Any

from pydantic import BaseModel, Field

from app.domain.enums import (
    ActionType,
    EffectKind,
    EventStatus,
    EventType,
    LedgerKind,
    Phase,
    PrioritySize,
    ResourceType,
    RollSource,
    TeamRole,
)


class ElementOut(BaseModel):
    id: int
    name: str
    status: int
    active: bool


class HazardOut(BaseModel):
    id: int
    name: str
    probability: int


class VulnerabilityOut(BaseModel):
    element_id: int
    hazard_id: int
    value: int


class ResourcesOut(BaseModel):
    money: int = 0
    knowledge: int = 0
    authority: int = 0


class PriorityOut(BaseModel):
    element_id: int
    size: PrioritySize


class TeamOut(BaseModel):
    id: int
    role: TeamRole
    name: str
    members: list[str]
    priorities: list[PriorityOut]
    resources: ResourcesOut


class DamageOut(BaseModel):
    element_id: int
    vulnerability: int
    status_before: int
    status_after: int


class HazardRollOut(BaseModel):
    id: int
    round: int
    hazard_id: int
    die: int
    source: RollSource
    resolved: bool
    probability_at_roll: int | None
    triggered: bool | None
    applied: bool = Field(
        description="True when the hazard dealt damage. A triggered hazard can be skipped in Round 0."
    )
    damages: list[DamageOut]


class ContributionOut(BaseModel):
    team_id: int
    resource: ResourceType
    amount: int


class ActionOut(BaseModel):
    id: int
    round: int
    type: ActionType
    element_id: int | None
    hazard_id: int | None
    free: bool
    cost: dict[str, Any]
    contributions: list[ContributionOut]
    result: dict[str, Any]


class EffectOut(BaseModel):
    kind: EffectKind
    delta: int
    hazard_id: int | None
    element_id: int | None


class AppliedChangeOut(BaseModel):
    kind: EffectKind
    hazard_id: int | None
    element_id: int | None
    before: int
    after: int


class EventOut(BaseModel):
    id: int
    round: int
    type: EventType
    name: str
    description: str
    effects: list[EffectOut]
    status: EventStatus
    applied_changes: list[AppliedChangeOut]


class ScoreOut(BaseModel):
    round: int
    team_id: int
    large_total: int
    small_total: int
    score: int


class LedgerOut(BaseModel):
    id: int
    team_id: int
    round: int
    resource: ResourceType
    delta: int
    kind: LedgerKind
    action_id: int | None


class GameState(BaseModel):
    """Full game state returned by every read and mutation so one board can render any phase."""

    id: str
    destination_name: str
    geographic_scope: str
    total_rounds: int
    phase: Phase
    current_round: int | None
    elements: list[ElementOut]
    hazards: list[HazardOut]
    vulnerabilities: list[VulnerabilityOut]
    teams: list[TeamOut]
    hazard_rolls: list[HazardRollOut]
    actions: list[ActionOut]
    events: list[EventOut]
    scores: list[ScoreOut]
    ledger: list[LedgerOut]
    reduce_emissions_progress: int
    winners: list[int]


class HealthResponse(BaseModel):
    status: str
    version: str


class ErrorResponse(BaseModel):
    detail: str

from enum import StrEnum


class Phase(StrEnum):
    SETUP = "SETUP"
    PRIORITIES = "PRIORITIES"
    ROUND0_PREDICTION = "ROUND0_PREDICTION"
    ROUND0_ADAPTATION = "ROUND0_ADAPTATION"
    ROUND0_INVESTMENT = "ROUND0_INVESTMENT"
    ROUND0_HAZARDS = "ROUND0_HAZARDS"
    RESOURCE_ALLOCATION = "RESOURCE_ALLOCATION"
    ACTION_PHASE = "ACTION_PHASE"
    HAZARD_PHASE = "HAZARD_PHASE"
    EVENT_PHASE = "EVENT_PHASE"
    SCORING = "SCORING"
    ROUND_COMPLETE = "ROUND_COMPLETE"
    GAME_COMPLETE = "GAME_COMPLETE"


class ResourceType(StrEnum):
    MONEY = "money"
    KNOWLEDGE = "knowledge"
    AUTHORITY = "authority"


class TeamRole(StrEnum):
    LOCAL_GOVERNMENT = "local_government"
    TOURISM_INDUSTRY = "tourism_industry"
    CIVIL_SOCIETY = "civil_society"


class PrioritySize(StrEnum):
    LARGE = "large"
    SMALL = "small"

    @property
    def weight(self) -> int:
        return 2 if self is PrioritySize.LARGE else 1


class ActionType(StrEnum):
    HAZARD_PREDICTION = "hazard_prediction"
    RISK_ADAPTATION = "risk_adaptation"
    LOCAL_INVESTMENT = "local_investment"
    DIVERSIFICATION = "diversification"
    REDUCE_EMISSIONS = "reduce_emissions"


class MarkerChange(StrEnum):
    """What a team may do with one priority marker when Diversification adds a new element."""

    MOVE = "move"
    SPLIT = "split"


class RollSource(StrEnum):
    PREDICTED = "predicted"
    ROLLED = "rolled"


class LedgerKind(StrEnum):
    ALLOCATION = "allocation"
    SPEND = "spend"
    EXPIRY = "expiry"


class EventType(StrEnum):
    STANDARD = "standard"
    TRANSITION_PRESSURE = "transition_pressure"


class EffectKind(StrEnum):
    HAZARD_PROBABILITY = "hazard_probability"
    VULNERABILITY = "vulnerability"
    ELEMENT_STATUS = "element_status"


class EventStatus(StrEnum):
    PENDING = "pending"
    APPLIED = "applied"
    AVOIDED = "avoided"

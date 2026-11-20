"""Static game content from the storyboard: element and hazard catalogues, role cards, action cards, event examples."""

from dataclasses import dataclass

from . import rules
from .costs import ACTION_COSTS, ActionCost
from .enums import ActionType, EffectKind, EventType, TeamRole


@dataclass(frozen=True)
class ElementGroup:
    name: str
    elements: tuple[str, ...]


@dataclass(frozen=True)
class ActionCard:
    key: str
    name: str
    description: str
    cost: ActionCost
    free_in_round_zero: bool
    # None means any regular round.
    rounds: tuple[int, ...] | None = None
    # False means the card is only explained to the players; it cannot be played yet.
    available: bool = True


@dataclass(frozen=True)
class TemplateEffect:
    kind: EffectKind
    delta: int
    hazard: str | None = None
    element: str | None = None


@dataclass(frozen=True)
class EventTemplate:
    key: str
    name: str
    description: str
    type: EventType
    effects: tuple[TemplateEffect, ...]
    suggested_round: int | None = None


TOURISM_BUSINESSES = "Tourism businesses"

ELEMENT_GROUPS: tuple[ElementGroup, ...] = (
    ElementGroup(
        "Tourism activities",
        ("Skiing and snow tourism", "Beach tourism", "Hiking and camping", "Urban sightseeing"),
    ),
    ElementGroup(
        "Tourism sector",
        (
            "Other attractions and experiences",
            TOURISM_BUSINESSES,
            "Tourism jobs and workers",
            "Visitor demand and travel connections",
        ),
    ),
    ElementGroup(
        "Wider destination systems",
        (
            "Water supply",
            "Food supply",
            "Nature and wildlife",
            "Energy supply",
            "Local transport infrastructure",
            "Internet and communications",
            "Waste and wastewater services",
            "Healthcare and public health",
            "Housing",
            "Schools and community services",
            "Safety and emergency services",
        ),
    ),
)

HAZARD_NAMES: tuple[str, ...] = (
    "Extreme heat",
    "Heat stress",
    "Cold",
    "Changes in precipitation",
    "Extreme precipitation",
    "Short drought",
    "Long drought",
    "Wildfire",
)

TEAM_INTERESTS: dict[TeamRole, tuple[str, ...]] = {
    TeamRole.LOCAL_GOVERNMENT: ("Inhabitant wellbeing", "Safety and cleanliness"),
    TeamRole.TOURISM_INDUSTRY: ("Local economy", "Tourist satisfaction"),
    TeamRole.CIVIL_SOCIETY: ("Local ecosystems", "Cultural history", "Social equity"),
}

ACTION_CARDS: tuple[ActionCard, ...] = (
    ActionCard(
        key=ActionType.HAZARD_PREDICTION.value,
        name="Hazard Prediction",
        description="Reveal one hazard's die for this round and the next. No damage is applied yet.",
        cost=ACTION_COSTS[ActionType.HAZARD_PREDICTION],
        free_in_round_zero=True,
    ),
    ActionCard(
        key=ActionType.RISK_ADAPTATION.value,
        name="Risk Adaptation",
        description="Reduce one element's vulnerability to one hazard by 1 (never below 0).",
        cost=ACTION_COSTS[ActionType.RISK_ADAPTATION],
        free_in_round_zero=True,
    ),
    ActionCard(
        key=ActionType.LOCAL_INVESTMENT.value,
        name="Local Investment",
        description="Raise one element's status by 2. Its vulnerability does not change.",
        cost=ACTION_COSTS[ActionType.LOCAL_INVESTMENT],
        free_in_round_zero=True,
    ),
    ActionCard(
        key=ActionType.DIVERSIFICATION.value,
        name="Diversification",
        description=(
            "Add a new destination element, by default at status 7. Each team may move or split one marker onto it."
        ),
        cost=ACTION_COSTS[ActionType.DIVERSIFICATION],
        free_in_round_zero=False,
    ),
    ActionCard(
        key=ActionType.REDUCE_EMISSIONS.value,
        name="Reduce Emissions",
        description="Available once in each of Rounds 1 and 2. Completing both avoids the Round 3 Transition pressure.",
        cost=ACTION_COSTS[ActionType.REDUCE_EMISSIONS],
        free_in_round_zero=False,
        rounds=rules.REDUCE_EMISSIONS_ROUNDS,
    ),
)

EVENT_TEMPLATES: tuple[EventTemplate, ...] = (
    EventTemplate(
        key="rising_temperatures",
        name="Rising temperatures",
        description="Warmer conditions make extreme heat and heat stress more likely.",
        type=EventType.STANDARD,
        suggested_round=1,
        effects=(
            TemplateEffect(EffectKind.HAZARD_PROBABILITY, 1, hazard="Extreme heat"),
            TemplateEffect(EffectKind.HAZARD_PROBABILITY, 1, hazard="Heat stress"),
        ),
    ),
    EventTemplate(
        key="longer_dry_seasons",
        name="Longer dry seasons",
        description="Dry periods last longer, making long droughts more likely.",
        type=EventType.STANDARD,
        suggested_round=2,
        effects=(TemplateEffect(EffectKind.HAZARD_PROBABILITY, 1, hazard="Long drought"),),
    ),
    EventTemplate(
        key="increasing_extreme_precipitation",
        name="Increasing extreme precipitation",
        description="Heavy rainfall becomes more frequent.",
        type=EventType.STANDARD,
        effects=(TemplateEffect(EffectKind.HAZARD_PROBABILITY, 1, hazard="Extreme precipitation"),),
    ),
    EventTemplate(
        key="pressure_on_water_supplies",
        name="Growing pressure on water supplies",
        description="Water supply becomes more vulnerable to long drought.",
        type=EventType.STANDARD,
        effects=(TemplateEffect(EffectKind.VULNERABILITY, 1, hazard="Long drought", element="Water supply"),),
    ),
    EventTemplate(
        key="heat_risks_for_workers",
        name="Heat risks for tourism workers",
        description="Tourism jobs and workers become more vulnerable to heat stress.",
        type=EventType.STANDARD,
        effects=(
            TemplateEffect(EffectKind.VULNERABILITY, 1, hazard="Heat stress", element="Tourism jobs and workers"),
        ),
    ),
    EventTemplate(
        key="improved_wildfire_preparedness",
        name="Improved wildfire preparedness",
        description="Safety and emergency services become less vulnerable to wildfire.",
        type=EventType.STANDARD,
        effects=(
            TemplateEffect(EffectKind.VULNERABILITY, -1, hazard="Wildfire", element="Safety and emergency services"),
        ),
    ),
    EventTemplate(
        key="transition_pressure",
        name="Transition pressure",
        description="Applies unless Reduce Emissions was completed once in each of Rounds 1 and 2.",
        type=EventType.TRANSITION_PRESSURE,
        suggested_round=rules.TRANSITION_PRESSURE_ROUND,
        effects=(
            TemplateEffect(
                EffectKind.ELEMENT_STATUS, rules.TRANSITION_PRESSURE_DEFAULT_PENALTY, element=TOURISM_BUSINESSES
            ),
        ),
    ),
)

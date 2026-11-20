"""Catalogue use case: publish the standard game content and the rule limits."""

from app.domain import catalogue, rules
from app.domain.enums import ResourceType, TeamRole
from app.schemas.catalogue import (
    ActionCardOut,
    ActionCostOut,
    CatalogueOut,
    ElementGroupOut,
    EventTemplateOut,
    LimitsOut,
    TeamCardOut,
    TemplateEffectOut,
)
from app.schemas.responses import ResourcesOut


def build_catalogue() -> CatalogueOut:
    return CatalogueOut(
        element_groups=[ElementGroupOut(name=g.name, elements=list(g.elements)) for g in catalogue.ELEMENT_GROUPS],
        hazards=list(catalogue.HAZARD_NAMES),
        teams=[_team_card(role) for role in TeamRole],
        actions=[
            ActionCardOut(
                key=card.key,
                name=card.name,
                description=card.description,
                cost=ActionCostOut(
                    money=card.cost.specific.money,
                    knowledge=card.cost.specific.knowledge,
                    authority=card.cost.specific.authority,
                    wild=card.cost.wild,
                ),
                free_in_round_zero=card.free_in_round_zero,
                rounds=list(card.rounds) if card.rounds is not None else None,
                available=card.available,
            )
            for card in catalogue.ACTION_CARDS
        ],
        event_templates=[
            EventTemplateOut(
                key=template.key,
                name=template.name,
                description=template.description,
                type=template.type,
                suggested_round=template.suggested_round,
                effects=[
                    TemplateEffectOut(kind=e.kind, delta=e.delta, hazard=e.hazard, element=e.element)
                    for e in template.effects
                ],
            )
            for template in catalogue.EVENT_TEMPLATES
        ],
        limits=LimitsOut(
            regular_rounds=list(rules.GUIDED_REGULAR_ROUNDS),
            default_regular_rounds=rules.DEFAULT_REGULAR_ROUNDS,
            elements_min=rules.MIN_ELEMENTS,
            elements_max=rules.MAX_ELEMENTS,
            hazards_min=rules.GUIDED_HAZARDS_MIN,
            hazards_max=rules.GUIDED_HAZARDS_MAX,
            probability_min=rules.MIN_PROBABILITY,
            probability_max=rules.MAX_PROBABILITY,
            vulnerability_min=rules.MIN_VULNERABILITY,
            vulnerability_max=rules.MAX_VULNERABILITY,
            starting_status=rules.STARTING_STATUS,
            events_per_round_max=rules.GUIDED_EVENTS_PER_ROUND_MAX,
            transition_pressure_round=rules.TRANSITION_PRESSURE_ROUND,
            reduce_emissions_rounds=list(rules.REDUCE_EMISSIONS_ROUNDS),
            reduce_emissions_target=rules.REDUCE_EMISSIONS_TARGET,
            round_zero_damage_limit=rules.ROUND_ZERO_DAMAGE_LIMIT,
            large_priorities_per_team=rules.LARGE_PRIORITIES_PER_TEAM,
            small_priorities_per_team=rules.SMALL_PRIORITIES_PER_TEAM,
            local_investment_gain=rules.LOCAL_INVESTMENT_GAIN,
            adaptation_reduction=rules.ADAPTATION_REDUCTION,
            diversification_status=rules.DIVERSIFICATION_STATUS,
        ),
    )


def _team_card(role: TeamRole) -> TeamCardOut:
    allowance = rules.TEAM_ALLOWANCES[role]
    return TeamCardOut(
        role=role,
        name=rules.TEAM_NAMES[role],
        interests=list(catalogue.TEAM_INTERESTS[role]),
        allowance=ResourcesOut(
            money=allowance.get(ResourceType.MONEY, 0),
            knowledge=allowance.get(ResourceType.KNOWLEDGE, 0),
            authority=allowance.get(ResourceType.AUTHORITY, 0),
        ),
    )

"""Pure event rules."""

from . import rules
from .enums import EventType


def is_event_avoided(event_type: EventType, emissions_progress: int) -> bool:
    """Transition pressure is avoided only when Reduce Emissions is complete (2/2)."""
    return event_type is EventType.TRANSITION_PRESSURE and emissions_progress >= rules.REDUCE_EMISSIONS_TARGET


def can_reduce_emissions(round_number: int, done_rounds: set[int]) -> bool:
    """Reduce Emissions is available once in each of the configured rounds."""
    return round_number in rules.REDUCE_EMISSIONS_ROUNDS and round_number not in done_rounds

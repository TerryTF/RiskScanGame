"""Pure hazard, vulnerability and status calculations."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from . import rules


def is_triggered(die: int, probability: int) -> bool:
    """A hazard triggers when the die result is at or below its probability threshold."""
    return die <= probability


def damage_limit(round_number: int) -> int | None:
    """How many triggered hazards may deal damage in a round; None means all of them."""
    return rules.ROUND_ZERO_DAMAGE_LIMIT if round_number == 0 else None


def hazards_that_apply(triggered: Sequence[bool], limit: int | None) -> list[bool]:
    """Which hazards deal damage. `triggered` is in board order (left to right); only the first `limit` count."""
    remaining = limit
    applied: list[bool] = []
    for is_hit in triggered:
        applies = is_hit and (remaining is None or remaining > 0)
        if applies and remaining is not None:
            remaining -= 1
        applied.append(applies)
    return applied


@dataclass(frozen=True)
class StatusChange:
    element_id: int
    vulnerability: int
    before: int
    after: int


def calculate_damage(
    statuses: Mapping[int, int],
    vulnerabilities: Mapping[int, int],
) -> list[StatusChange]:
    """Damage of one triggered hazard: every active element loses its vulnerability, never below 0.

    `statuses` maps active element id to current status; `vulnerabilities` maps element id to the
    vulnerability for this hazard. Elements are returned in ascending id order.
    """
    changes: list[StatusChange] = []
    for element_id in sorted(statuses):
        vulnerability = vulnerabilities.get(element_id, 0)
        before = statuses[element_id]
        changes.append(StatusChange(element_id, vulnerability, before, max(rules.MIN_STATUS, before - vulnerability)))
    return changes


def reduce_vulnerability(current: int, reduction: int = rules.ADAPTATION_REDUCTION) -> int:
    return max(rules.MIN_VULNERABILITY, current - reduction)


def increase_status(current: int, gain: int = rules.LOCAL_INVESTMENT_GAIN) -> int:
    return current + gain


def clamp_probability(value: int) -> int:
    return min(rules.MAX_PROBABILITY, max(rules.MIN_PROBABILITY, value))


def clamp_vulnerability(value: int) -> int:
    return min(rules.MAX_VULNERABILITY, max(rules.MIN_VULNERABILITY, value))


def clamp_status(value: int) -> int:
    return max(rules.MIN_STATUS, value)

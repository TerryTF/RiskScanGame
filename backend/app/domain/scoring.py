"""Team scoring. Scores are per-round snapshots and are never accumulated."""

from collections.abc import Iterable, Mapping
from dataclasses import dataclass

from .enums import PrioritySize


@dataclass(frozen=True)
class TeamScore:
    large_total: int
    small_total: int

    @property
    def total(self) -> int:
        return self.large_total + self.small_total


def score_team(
    priorities: Iterable[tuple[int, PrioritySize]],
    statuses: Mapping[int, int],
) -> TeamScore:
    """Large priority element status counts x2, small priority element status counts x1."""
    large = small = 0
    for element_id, size in priorities:
        points = statuses[element_id] * size.weight
        if size is PrioritySize.LARGE:
            large += points
        else:
            small += points
    return TeamScore(large_total=large, small_total=small)


def winners(scores: Mapping[int, int]) -> list[int]:
    """Team ids sharing the highest score; empty when there are no scores."""
    if not scores:
        return []
    best = max(scores.values())
    return sorted(team_id for team_id, score in scores.items() if score == best)

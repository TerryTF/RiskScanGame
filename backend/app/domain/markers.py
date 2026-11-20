"""Priority markers during Diversification: a team moves one marker or splits one large marker onto the new element."""

from dataclasses import dataclass

from .enums import MarkerChange, PrioritySize
from .errors import InvalidInputError


@dataclass(frozen=True)
class MarkerPlan:
    """Where a team's marker ends up. A team holds at most one marker per element."""

    # What stays on the original element; None when the marker moved away.
    stays: PrioritySize | None
    # What is placed on the new element.
    goes: PrioritySize


def plan_marker_change(size: PrioritySize, change: MarkerChange) -> MarkerPlan:
    """Move: the marker, large or small, keeps its size on the new element.

    Split: a large marker becomes two small ones, one on its element and one on the new element.
    Small markers cannot be split.
    """
    if change is MarkerChange.MOVE:
        return MarkerPlan(stays=None, goes=size)
    if size is not PrioritySize.LARGE:
        raise InvalidInputError("Small markers cannot be split.")
    return MarkerPlan(stays=PrioritySize.SMALL, goes=PrioritySize.SMALL)

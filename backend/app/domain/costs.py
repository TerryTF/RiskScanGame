"""Action costs and payment resolution, including explicit handling of the "Wild" part of a cost."""

from collections.abc import Collection, Iterable
from dataclasses import dataclass

from .enums import ActionType, ResourceType
from .errors import InvalidInputError


@dataclass(frozen=True)
class Bundle:
    money: int = 0
    knowledge: int = 0
    authority: int = 0

    def get(self, resource: ResourceType) -> int:
        return int(getattr(self, resource.value))

    def total(self) -> int:
        return self.money + self.knowledge + self.authority

    def plus(self, other: "Bundle") -> "Bundle":
        return Bundle(
            self.money + other.money,
            self.knowledge + other.knowledge,
            self.authority + other.authority,
        )

    def minus(self, other: "Bundle") -> "Bundle":
        return Bundle(
            self.money - other.money,
            self.knowledge - other.knowledge,
            self.authority - other.authority,
        )

    def covers(self, other: "Bundle") -> bool:
        return all(self.get(r) >= other.get(r) for r in ResourceType)

    def items(self) -> list[tuple[ResourceType, int]]:
        return [(r, self.get(r)) for r in ResourceType if self.get(r) > 0]

    def describe(self) -> str:
        return " + ".join(f"{amount} {resource.value}" for resource, amount in self.items()) or "nothing"


@dataclass(frozen=True)
class ActionCost:
    specific: Bundle
    wild: int = 0


ACTION_COSTS: dict[ActionType, ActionCost] = {
    ActionType.HAZARD_PREDICTION: ActionCost(Bundle(knowledge=1), wild=1),
    ActionType.RISK_ADAPTATION: ActionCost(Bundle(money=1, knowledge=1, authority=2)),
    ActionType.LOCAL_INVESTMENT: ActionCost(Bundle(money=1), wild=2),
    ActionType.DIVERSIFICATION: ActionCost(Bundle(money=2, knowledge=1, authority=1)),
    ActionType.REDUCE_EMISSIONS: ActionCost(Bundle(money=1, knowledge=1, authority=1)),
}


@dataclass(frozen=True)
class PaymentBreakdown:
    """How a total payment is split between the named cost components and the Wild part."""

    paid: Bundle
    specific: Bundle
    wild: Bundle


def resolve_payment(
    cost: ActionCost,
    contributions: Iterable[Bundle],
    wild_allowed: Collection[ResourceType],
) -> PaymentBreakdown:
    """Validate that the contributions pay exactly `cost`. Surplus over the named components is Wild.

    Raises InvalidInputError when a named component is not covered, the Wild part is paid with a
    resource that is not allowed, or the total differs from the cost.
    """
    paid = Bundle()
    for contribution in contributions:
        paid = paid.plus(contribution)

    for resource in ResourceType:
        if paid.get(resource) < cost.specific.get(resource):
            raise InvalidInputError(
                f"Payment is missing {cost.specific.get(resource) - paid.get(resource)} {resource.value}; "
                f"the action costs {cost.specific.describe()} + {cost.wild} wild."
            )
    wild = paid.minus(cost.specific)
    if wild.total() != cost.wild:
        raise InvalidInputError(
            f"Payment must total exactly {cost.specific.total() + cost.wild} resources "
            f"({cost.specific.describe()} + {cost.wild} wild); got {paid.total()}."
        )
    for resource, amount in wild.items():
        if resource not in wild_allowed:
            raise InvalidInputError(f"{resource.value} cannot be used as a wild resource ({amount} offered).")
    return PaymentBreakdown(paid=paid, specific=cost.specific, wild=wild)

"""Fixed rule values from references/game-rules.md."""

from .enums import ResourceType, TeamRole

STARTING_STATUS = 10
MIN_STATUS = 0

MIN_PROBABILITY = 1
MAX_PROBABILITY = 6
DIE_SIDES = 6

MIN_VULNERABILITY = 0
MAX_VULNERABILITY = 3

MIN_REGULAR_ROUNDS = 3
MAX_REGULAR_ROUNDS = 6
DEFAULT_REGULAR_ROUNDS = 4

MIN_ELEMENTS = 4
MAX_ELEMENTS = 12
MIN_HAZARDS = 1
MAX_HAZARDS = 8

LARGE_PRIORITIES_PER_TEAM = 2
SMALL_PRIORITIES_PER_TEAM = 2

DEFAULT_GEOGRAPHIC_SCOPE = "Region"

# Round 0 is practice: only the first triggered hazards (left to right on the board) cause damage.
ROUND_ZERO_DAMAGE_LIMIT = 2

# Storyboard setup guidance. The API accepts the wider ranges above; the catalogue publishes these for clients.
GUIDED_REGULAR_ROUNDS = (4, 5)
GUIDED_HAZARDS_MIN = 4
GUIDED_HAZARDS_MAX = 5
GUIDED_EVENTS_PER_ROUND_MAX = 2

LOCAL_INVESTMENT_GAIN = 2
ADAPTATION_REDUCTION = 1
# A diversified element starts lower than the usual STARTING_STATUS, by default at 7. The moderator may change it,
# from MIN_STATUS up to STARTING_STATUS.
DIVERSIFICATION_STATUS = 7

REDUCE_EMISSIONS_ROUNDS = (1, 2)
REDUCE_EMISSIONS_TARGET = 2
TRANSITION_PRESSURE_ROUND = 3
TRANSITION_PRESSURE_DEFAULT_PENALTY = -2

# Resource types that may be used to pay the "Wild" part of an action cost.
WILD_ALLOWED_RESOURCES = frozenset(ResourceType)

TEAM_NAMES: dict[TeamRole, str] = {
    TeamRole.LOCAL_GOVERNMENT: "Local Government",
    TeamRole.TOURISM_INDUSTRY: "Tourism Industry",
    TeamRole.CIVIL_SOCIETY: "Civil Society",
}

# Resources granted to each team at the start of every regular round.
TEAM_ALLOWANCES: dict[TeamRole, dict[ResourceType, int]] = {
    TeamRole.LOCAL_GOVERNMENT: {ResourceType.AUTHORITY: 4, ResourceType.MONEY: 2},
    TeamRole.TOURISM_INDUSTRY: {ResourceType.MONEY: 4, ResourceType.KNOWLEDGE: 2},
    TeamRole.CIVIL_SOCIETY: {ResourceType.KNOWLEDGE: 4, ResourceType.AUTHORITY: 2},
}

"""Round state machine: the ordered phases of each round and the idempotency check for transitions."""

from .enums import Phase
from .errors import InvalidPhaseError

ROUND_ZERO_PHASES: tuple[Phase, ...] = (
    Phase.ROUND0_PREDICTION,
    Phase.ROUND0_ADAPTATION,
    Phase.ROUND0_INVESTMENT,
    Phase.ROUND0_HAZARDS,
    Phase.SCORING,
    Phase.ROUND_COMPLETE,
)

REGULAR_ROUND_PHASES: tuple[Phase, ...] = (
    Phase.RESOURCE_ALLOCATION,
    Phase.ACTION_PHASE,
    Phase.HAZARD_PHASE,
    Phase.EVENT_PHASE,
    Phase.SCORING,
    Phase.ROUND_COMPLETE,
)


def phases_of_round(round_number: int) -> tuple[Phase, ...]:
    return ROUND_ZERO_PHASES if round_number == 0 else REGULAR_ROUND_PHASES


def next_phase(round_number: int, phase: Phase) -> Phase:
    """The phase that follows `phase` within the round. ROUND_COMPLETE is left via round completion."""
    phases = phases_of_round(round_number)
    if phase not in phases or phase == Phase.ROUND_COMPLETE:
        raise InvalidPhaseError(f"Phase {phase} has no successor in round {round_number}.")
    return phases[phases.index(phase) + 1]


def should_run_step(
    current_round: int | None,
    current_phase: Phase,
    round_number: int,
    expected_phase: Phase,
) -> bool:
    """Decide whether a step requested for `round_number` must run, was already done, or is invalid.

    Returns True when the game is exactly at `expected_phase` of `round_number`, False when that step
    is already behind the game (so repeating the request is a harmless no-op), and raises
    InvalidPhaseError when the step is not yet reachable or does not exist for that round.
    """
    phases = phases_of_round(round_number)
    if expected_phase not in phases:
        raise InvalidPhaseError(f"Step {expected_phase} does not exist in round {round_number}.")
    if current_round is None or round_number > current_round:
        raise InvalidPhaseError(f"Round {round_number} has not been reached yet (phase {current_phase}).")
    if round_number < current_round or current_phase == Phase.GAME_COMPLETE:
        return False
    if current_phase == expected_phase:
        return True
    if phases.index(current_phase) > phases.index(expected_phase):
        return False
    raise InvalidPhaseError(f"Round {round_number} is in {current_phase}; {expected_phase} is not reachable yet.")

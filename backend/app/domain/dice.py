import random
from collections.abc import Iterable
from typing import Protocol

from .rules import DIE_SIDES


class DiceProvider(Protocol):
    def roll(self) -> int:
        """Return one d6 result (1..6)."""
        ...


class SeededDiceProvider:
    """Reproducible pseudo-random dice: the same seed always yields the same sequence."""

    def __init__(self, seed: int) -> None:
        self._random = random.Random(seed)

    def roll(self) -> int:
        return self._random.randint(1, DIE_SIDES)


class SystemDiceProvider:
    """Non-reproducible dice backed by the operating system's entropy source."""

    def __init__(self) -> None:
        self._random = random.SystemRandom()

    def roll(self) -> int:
        return self._random.randint(1, DIE_SIDES)


class FixedDiceProvider:
    """Returns predetermined results in order. Used by tests and rehearsed demos."""

    def __init__(self, values: Iterable[int] = ()) -> None:
        self._values: list[int] = []
        self.push(*values)
        self.rolled: list[int] = []

    def push(self, *values: int) -> None:
        for value in values:
            if not 1 <= value <= DIE_SIDES:
                raise ValueError(f"Die value must be between 1 and {DIE_SIDES}, got {value}.")
            self._values.append(value)

    def roll(self) -> int:
        if not self._values:
            raise RuntimeError("FixedDiceProvider has no values left.")
        value = self._values.pop(0)
        self.rolled.append(value)
        return value

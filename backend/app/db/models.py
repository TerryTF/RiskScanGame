"""SQLAlchemy models. Persistence only; rules live in app.domain and app.services."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import Enum
from typing import Any

from sqlalchemy import JSON, CheckConstraint, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, false
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.domain import rules
from app.domain.enums import (
    ActionType,
    EventStatus,
    EventType,
    LedgerKind,
    Phase,
    PrioritySize,
    ResourceType,
    RollSource,
    TeamRole,
)

from .base import Base


def _now() -> datetime:
    return datetime.now(UTC)


def _enum(enum_class: type[Enum]) -> SAEnum:
    return SAEnum(
        enum_class,
        native_enum=False,
        length=32,
        values_callable=lambda members: [m.value for m in members],
    )


class Game(Base):
    __tablename__ = "games"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    destination_name: Mapped[str] = mapped_column(String(120))
    geographic_scope: Mapped[str] = mapped_column(
        String(120), default=rules.DEFAULT_GEOGRAPHIC_SCOPE, server_default=rules.DEFAULT_GEOGRAPHIC_SCOPE
    )
    total_rounds: Mapped[int] = mapped_column(Integer)
    phase: Mapped[Phase] = mapped_column(_enum(Phase), default=Phase.SETUP)
    current_round: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    elements: Mapped[list[Element]] = relationship(
        back_populates="game", cascade="all, delete-orphan", order_by="Element.id"
    )
    hazards: Mapped[list[Hazard]] = relationship(
        back_populates="game", cascade="all, delete-orphan", order_by="Hazard.id"
    )
    vulnerabilities: Mapped[list[Vulnerability]] = relationship(
        back_populates="game", cascade="all, delete-orphan", order_by="Vulnerability.id"
    )
    teams: Mapped[list[Team]] = relationship(back_populates="game", cascade="all, delete-orphan", order_by="Team.id")
    rounds: Mapped[list[Round]] = relationship(
        back_populates="game", cascade="all, delete-orphan", order_by="Round.number"
    )
    hazard_rolls: Mapped[list[HazardRoll]] = relationship(
        back_populates="game", cascade="all, delete-orphan", order_by="HazardRoll.id"
    )
    actions: Mapped[list[ActionExecution]] = relationship(
        back_populates="game", cascade="all, delete-orphan", order_by="ActionExecution.id"
    )
    events: Mapped[list[Event]] = relationship(
        back_populates="game", cascade="all, delete-orphan", order_by="Event.round_number, Event.id"
    )
    scores: Mapped[list[RoundScore]] = relationship(
        back_populates="game", cascade="all, delete-orphan", order_by="RoundScore.id"
    )
    ledger: Mapped[list[ResourceLedger]] = relationship(
        back_populates="game", cascade="all, delete-orphan", order_by="ResourceLedger.id"
    )


class Element(Base):
    __tablename__ = "elements"
    __table_args__ = (
        UniqueConstraint("game_id", "name"),
        CheckConstraint("status >= 0", name="status_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    status: Mapped[int] = mapped_column(Integer)
    active: Mapped[bool] = mapped_column(default=True)

    game: Mapped[Game] = relationship(back_populates="elements")


class Hazard(Base):
    __tablename__ = "hazards"
    __table_args__ = (
        UniqueConstraint("game_id", "name"),
        CheckConstraint("probability BETWEEN 1 AND 6", name="probability_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120))
    probability: Mapped[int] = mapped_column(Integer)

    game: Mapped[Game] = relationship(back_populates="hazards")


class Vulnerability(Base):
    __tablename__ = "vulnerabilities"
    __table_args__ = (
        UniqueConstraint("element_id", "hazard_id"),
        CheckConstraint("value BETWEEN 0 AND 3", name="value_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True)
    element_id: Mapped[int] = mapped_column(ForeignKey("elements.id", ondelete="CASCADE"))
    hazard_id: Mapped[int] = mapped_column(ForeignKey("hazards.id", ondelete="CASCADE"))
    value: Mapped[int] = mapped_column(Integer)

    game: Mapped[Game] = relationship(back_populates="vulnerabilities")


class Team(Base):
    __tablename__ = "teams"
    __table_args__ = (UniqueConstraint("game_id", "role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True)
    role: Mapped[TeamRole] = mapped_column(_enum(TeamRole))
    name: Mapped[str] = mapped_column(String(120))
    members: Mapped[list[str]] = mapped_column(JSON, default=list)

    game: Mapped[Game] = relationship(back_populates="teams")
    priorities: Mapped[list[TeamPriority]] = relationship(
        back_populates="team", cascade="all, delete-orphan", order_by="TeamPriority.id"
    )


class TeamPriority(Base):
    __tablename__ = "team_priorities"
    __table_args__ = (UniqueConstraint("team_id", "element_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"), index=True)
    element_id: Mapped[int] = mapped_column(ForeignKey("elements.id", ondelete="CASCADE"))
    size: Mapped[PrioritySize] = mapped_column(_enum(PrioritySize))

    team: Mapped[Team] = relationship(back_populates="priorities")


class Round(Base):
    __tablename__ = "rounds"
    __table_args__ = (UniqueConstraint("game_id", "number"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True)
    number: Mapped[int] = mapped_column(Integer)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    game: Mapped[Game] = relationship(back_populates="rounds")


class ResourceLedger(Base):
    """Append-only record of every resource movement. A team's balance is the sum of its round's deltas."""

    __tablename__ = "resource_ledger"

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    round_number: Mapped[int] = mapped_column(Integer)
    resource: Mapped[ResourceType] = mapped_column(_enum(ResourceType))
    delta: Mapped[int] = mapped_column(Integer)
    kind: Mapped[LedgerKind] = mapped_column(_enum(LedgerKind))
    action_id: Mapped[int | None] = mapped_column(
        ForeignKey("action_executions.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    game: Mapped[Game] = relationship(back_populates="ledger")


class ActionExecution(Base):
    __tablename__ = "action_executions"

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True)
    round_number: Mapped[int] = mapped_column(Integer)
    action_type: Mapped[ActionType] = mapped_column(_enum(ActionType))
    element_id: Mapped[int | None] = mapped_column(ForeignKey("elements.id", ondelete="SET NULL"), nullable=True)
    hazard_id: Mapped[int | None] = mapped_column(ForeignKey("hazards.id", ondelete="SET NULL"), nullable=True)
    free: Mapped[bool] = mapped_column(default=False)
    cost: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    result: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    game: Mapped[Game] = relationship(back_populates="actions")
    contributions: Mapped[list[ActionContribution]] = relationship(
        back_populates="action", cascade="all, delete-orphan", order_by="ActionContribution.id"
    )


class ActionContribution(Base):
    __tablename__ = "action_contributions"
    __table_args__ = (CheckConstraint("amount > 0", name="amount_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    action_id: Mapped[int] = mapped_column(ForeignKey("action_executions.id", ondelete="CASCADE"), index=True)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    resource: Mapped[ResourceType] = mapped_column(_enum(ResourceType))
    amount: Mapped[int] = mapped_column(Integer)

    action: Mapped[ActionExecution] = relationship(back_populates="contributions")


class HazardRoll(Base):
    """One die per hazard per round. A predicted die is stored here and reused at resolution."""

    __tablename__ = "hazard_rolls"
    __table_args__ = (
        UniqueConstraint("game_id", "hazard_id", "round_number"),
        CheckConstraint("die BETWEEN 1 AND 6", name="die_range"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True)
    hazard_id: Mapped[int] = mapped_column(ForeignKey("hazards.id", ondelete="CASCADE"))
    round_number: Mapped[int] = mapped_column(Integer)
    die: Mapped[int] = mapped_column(Integer)
    source: Mapped[RollSource] = mapped_column(_enum(RollSource))
    resolved: Mapped[bool] = mapped_column(default=False)
    probability_at_roll: Mapped[int | None] = mapped_column(Integer, nullable=True)
    triggered: Mapped[bool | None] = mapped_column(nullable=True)
    # A triggered hazard may still be skipped (Round 0 damage limit); `applied` records whether damage was dealt.
    applied: Mapped[bool] = mapped_column(default=False, server_default=false())

    game: Mapped[Game] = relationship(back_populates="hazard_rolls")
    damages: Mapped[list[HazardDamage]] = relationship(
        back_populates="roll", cascade="all, delete-orphan", order_by="HazardDamage.id"
    )


class HazardDamage(Base):
    __tablename__ = "hazard_damages"

    id: Mapped[int] = mapped_column(primary_key=True)
    roll_id: Mapped[int] = mapped_column(ForeignKey("hazard_rolls.id", ondelete="CASCADE"), index=True)
    element_id: Mapped[int] = mapped_column(ForeignKey("elements.id", ondelete="CASCADE"))
    vulnerability: Mapped[int] = mapped_column(Integer)
    status_before: Mapped[int] = mapped_column(Integer)
    status_after: Mapped[int] = mapped_column(Integer)

    roll: Mapped[HazardRoll] = relationship(back_populates="damages")


class Event(Base):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True)
    round_number: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[EventType] = mapped_column(_enum(EventType))
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    effects: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    status: Mapped[EventStatus] = mapped_column(_enum(EventStatus), default=EventStatus.PENDING)
    applied_changes: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)

    game: Mapped[Game] = relationship(back_populates="events")


class RoundScore(Base):
    __tablename__ = "round_scores"
    __table_args__ = (UniqueConstraint("game_id", "round_number", "team_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[str] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), index=True)
    round_number: Mapped[int] = mapped_column(Integer)
    team_id: Mapped[int] = mapped_column(ForeignKey("teams.id", ondelete="CASCADE"))
    large_total: Mapped[int] = mapped_column(Integer)
    small_total: Mapped[int] = mapped_column(Integer)
    score: Mapped[int] = mapped_column(Integer)

    game: Mapped[Game] = relationship(back_populates="scores")


class TextOverride(Base):
    """Wording an editor changed. Defaults live in the frontend; only edited texts are stored."""

    __tablename__ = "text_overrides"

    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    value: Mapped[str] = mapped_column(Text)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class TextUndo(Base):
    """The edited texts as they were before the last save, so that one save can be undone. There is at most one row."""

    __tablename__ = "text_undo"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    texts: Mapped[dict[str, str]] = mapped_column(JSON)
    saved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

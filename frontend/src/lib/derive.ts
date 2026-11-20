import type {
  AppliedChange,
  Element,
  EventEffect,
  GameAction,
  GameEvent,
  GameState,
  HazardRoll,
  Limits,
  PrioritySize,
  Team,
  TeamRole,
} from '../api/types';
import { TEAM_ROLES, actionResult, type ActionResults } from '../api/types';
import { cardKeys, type Texts, type Translate } from '../texts';
import { ACTION_LABEL, resourceKey, roleKey, signed } from './format';

export const cellKey = (elementId: number, hazardId: number) => `${elementId}:${hazardId}`;

export function activeElements(game: GameState): Element[] {
  return game.elements.filter((element) => element.active);
}

export function elementName(game: GameState, id: number | null): string {
  if (id === null) return 'All elements';
  return game.elements.find((element) => element.id === id)?.name ?? `Element ${id}`;
}

export function hazardName(game: GameState, id: number | null): string {
  if (id === null) return 'Unknown hazard';
  return game.hazards.find((hazard) => hazard.id === id)?.name ?? `Hazard ${id}`;
}

export function teamByRole(game: GameState, role: TeamRole): Team | undefined {
  return game.teams.find((team) => team.role === role);
}

export function teamById(game: GameState, id: number): Team | undefined {
  return game.teams.find((team) => team.id === id);
}

/** Teams in the fixed storyboard order, whatever order the API returned them in. */
export function orderedTeams(game: GameState): Team[] {
  return TEAM_ROLES.flatMap((role) => teamByRole(game, role) ?? []);
}

export function vulnerabilityMap(game: GameState): Map<string, number> {
  return new Map(game.vulnerabilities.map((v) => [cellKey(v.element_id, v.hazard_id), v.value]));
}

export interface Marker {
  team: Team;
  size: PrioritySize;
}

export function markersByElement(game: GameState): Map<number, Marker[]> {
  const markers = new Map<number, Marker[]>();
  for (const team of orderedTeams(game)) {
    for (const priority of team.priorities) {
      const list = markers.get(priority.element_id) ?? [];
      list.push({ team, size: priority.size });
      markers.set(priority.element_id, list);
    }
  }
  for (const list of markers.values()) list.sort((a, b) => Number(b.size === 'large') - Number(a.size === 'large'));
  return markers;
}

export interface HazardDice {
  current: HazardRoll | null;
  next: HazardRoll | null;
}

/** The die stored for the current round (predicted or rolled) and the one predicted for the next round. */
export function hazardDice(game: GameState): Map<number, HazardDice> {
  const dice = new Map<number, HazardDice>();
  for (const hazard of game.hazards) {
    const rolls = game.hazard_rolls.filter((roll) => roll.hazard_id === hazard.id);
    const round = game.current_round;
    dice.set(hazard.id, {
      current: round === null ? null : (rolls.find((roll) => roll.round === round) ?? null),
      next: round === null ? null : (rolls.find((roll) => roll.round === round + 1) ?? null),
    });
  }
  return dice;
}

export type RollOutcome = 'trigger' | 'no_event' | 'skip';

export function rollOutcome(roll: HazardRoll): RollOutcome {
  if (!roll.triggered) return 'no_event';
  return roll.applied ? 'trigger' : 'skip';
}

export interface ScoreRow {
  team: Team;
  score: number;
  large: number;
  small: number;
}

export function roundScores(game: GameState, round: number): ScoreRow[] {
  const rows = orderedTeams(game).flatMap((team) => {
    const entry = game.scores.find((score) => score.round === round && score.team_id === team.id);
    return entry ? [{ team, score: entry.score, large: entry.large_total, small: entry.small_total }] : [];
  });
  return rows.sort((a, b) => b.score - a.score);
}

export interface ScoreCell {
  score: number;
  large: number;
  small: number;
  /** Difference from this team's previous scored round; null for its first scored round. */
  change: number | null;
  previousRound: number | null;
  /** Equal to the highest score of the round (ties are all highlighted). */
  best: boolean;
}

export interface ScoreHistoryRow {
  team: Team;
  /** One entry per round in `ScoreHistory.rounds`; null when the team has no score for that round. */
  cells: (ScoreCell | null)[];
}

export interface ScoreHistory {
  rounds: number[];
  rows: ScoreHistoryRow[];
}

/** Every scored round up to `upTo`, one row per team, ordered by the latest round's score. */
export function scoreHistory(game: GameState, upTo: number): ScoreHistory {
  const rounds = [...new Set(game.scores.map((score) => score.round))]
    .filter((round) => round <= upTo)
    .sort((a, b) => a - b);
  const best = new Map(
    rounds.map((round) => [round, Math.max(...game.scores.filter((s) => s.round === round).map((s) => s.score))]),
  );
  const rows = orderedTeams(game).map((team) => {
    let previous: { round: number; score: number } | null = null;
    const cells = rounds.map((round): ScoreCell | null => {
      const entry = game.scores.find((score) => score.round === round && score.team_id === team.id);
      if (!entry) return null;
      const cell = {
        score: entry.score,
        large: entry.large_total,
        small: entry.small_total,
        change: previous === null ? null : entry.score - previous.score,
        previousRound: previous?.round ?? null,
        best: entry.score === best.get(round),
      };
      previous = { round, score: entry.score };
      return cell;
    });
    return { team, cells };
  });
  const latest = (row: ScoreHistoryRow) => row.cells[row.cells.length - 1]?.score ?? -Infinity;
  rows.sort((a, b) => latest(b) - latest(a));
  return { rounds, rows };
}

export function latestScoredRound(game: GameState): number | null {
  return game.scores.length === 0 ? null : Math.max(...game.scores.map((score) => score.round));
}

export function actionsInRound(game: GameState, round: number): GameAction[] {
  return game.actions.filter((action) => action.round === round);
}

/** Players only see events once they have taken effect; the moderator sees the whole queue. */
export function visibleEvents(game: GameState, audience: 'moderator' | 'participant'): GameEvent[] {
  return audience === 'moderator' ? game.events : game.events.filter((event) => event.status !== 'pending');
}

export function describeEffect(game: GameState, effect: EventEffect, t: Translate): string {
  const vars = {
    hazard: hazardName(game, effect.hazard_id),
    element: effect.element_id === null ? t('describe.all_elements') : elementName(game, effect.element_id),
    delta: signed(effect.delta),
  };
  switch (effect.kind) {
    case 'hazard_probability':
      return t('describe.effect.probability', vars);
    case 'vulnerability':
      return t('describe.effect.vulnerability', vars);
    case 'element_status':
      return t('describe.effect.status', vars);
  }
}

export function describeChange(game: GameState, change: AppliedChange, t: Translate): string {
  const range = `${change.before}\u2192${change.after}`;
  const element = change.element_id === null ? t('describe.all_elements') : elementName(game, change.element_id);
  switch (change.kind) {
    case 'hazard_probability':
      return `${hazardName(game, change.hazard_id)} ${range}`;
    case 'vulnerability':
      return `${element} \u00d7 ${hazardName(game, change.hazard_id)} ${range}`;
    case 'element_status':
      return `${element} ${range}`;
  }
}

export interface StatusChange {
  elementId: number;
  before: number;
  after: number;
}

/** Net status change per element caused by the hazards of one round (cumulative over every triggered hazard). */
export function hazardStatusChanges(game: GameState, round: number): StatusChange[] {
  const changes = new Map<number, StatusChange>();
  for (const roll of game.hazard_rolls.filter((r) => r.round === round)) {
    for (const damage of roll.damages) {
      const known = changes.get(damage.element_id);
      changes.set(damage.element_id, {
        elementId: damage.element_id,
        before: known?.before ?? damage.status_before,
        after: damage.status_after,
      });
    }
  }
  return [...changes.values()].filter((change) => change.before !== change.after);
}

export interface ReduceEmissionsInfo {
  progress: number;
  target: number;
  eligibleRound: boolean;
  usedThisRound: boolean;
}

export function reduceEmissionsInfo(game: GameState, limits: Limits): ReduceEmissionsInfo {
  const round = game.current_round;
  return {
    progress: game.reduce_emissions_progress,
    target: limits.reduce_emissions_target,
    eligibleRound: round !== null && limits.reduce_emissions_rounds.includes(round),
    usedThisRound: game.actions.some((a) => a.type === 'reduce_emissions' && a.round === round),
  };
}

export interface Changes {
  statuses: ReadonlySet<number>;
  cells: ReadonlySet<string>;
  probabilities: ReadonlySet<number>;
  /** Elements that were not on the board in the previous snapshot, for example one added by Diversification. */
  added: ReadonlySet<number>;
  /** Elements whose priority markers changed. Placing the markers for the first time does not count. */
  markers: ReadonlySet<number>;
}

export const NO_CHANGES: Changes = {
  statuses: new Set(),
  cells: new Set(),
  probabilities: new Set(),
  added: new Set(),
  markers: new Set(),
};

function markerSignatures(game: GameState): Map<number, string> {
  return new Map(
    [...markersByElement(game)].map(([elementId, markers]) => [
      elementId,
      markers.map((marker) => `${marker.team.id}:${marker.size}`).join(','),
    ]),
  );
}

function changedMarkers(previous: GameState, next: GameState): Set<number> {
  if (!previous.teams.some((team) => team.priorities.length > 0)) return new Set();
  const before = markerSignatures(previous);
  const after = markerSignatures(next);
  return new Set([...before.keys(), ...after.keys()].filter((id) => before.get(id) !== after.get(id)));
}

/** What differs between two snapshots of the same game, so the board can highlight what just changed. */
export function diffStates(previous: GameState, next: GameState): Changes {
  if (previous.id !== next.id) return NO_CHANGES;
  const status = new Map(previous.elements.map((e) => [e.id, e.status]));
  const vulnerability = vulnerabilityMap(previous);
  const probability = new Map(previous.hazards.map((h) => [h.id, h.probability]));
  return {
    statuses: new Set(next.elements.filter((e) => status.has(e.id) && status.get(e.id) !== e.status).map((e) => e.id)),
    cells: new Set(
      next.vulnerabilities
        .filter((v) => {
          const before = vulnerability.get(cellKey(v.element_id, v.hazard_id));
          return before !== undefined && before !== v.value;
        })
        .map((v) => cellKey(v.element_id, v.hazard_id)),
    ),
    probabilities: new Set(
      next.hazards.filter((h) => probability.has(h.id) && probability.get(h.id) !== h.probability).map((h) => h.id),
    ),
    added: new Set(next.elements.filter((e) => !status.has(e.id)).map((e) => e.id)),
    markers: changedMarkers(previous, next),
  };
}

export interface HistoryRound {
  round: number;
  lines: string[];
}

type MarkerChangeResult = ActionResults['diversification']['marker_changes'][number];

/** "Tourism industry moved its small marker from Housing" or "Local government split its large marker on Housing". */
export function describeMarkerChange(game: GameState, change: MarkerChangeResult, t: Translate): string {
  const team = teamById(game, change.team_id);
  const who = team ? t(roleKey(team.role)) : `Team ${change.team_id}`;
  const element = elementName(game, change.element_id);
  return change.change === 'split'
    ? t('describe.marker.split', { team: who, element })
    : t('describe.marker.moved', { team: who, size: change.size, element });
}

export function describeAction(game: GameState, action: GameAction, { t, card }: Texts): string {
  const label = card(cardKeys.actionName(action.type), ACTION_LABEL[action.type]);
  const element = elementName(game, action.element_id);
  const hazard = hazardName(game, action.hazard_id);
  const prediction = actionResult(action, 'hazard_prediction');
  if (prediction) {
    const dice = prediction.rolls.map((roll) => roll.die).join(` ${t('describe.and')} `);
    return t('describe.action.prediction', { action: label, hazard, dice });
  }
  const adaptation = actionResult(action, 'risk_adaptation');
  if (adaptation) {
    const [before, after] = [adaptation.vulnerability_before, adaptation.vulnerability_after];
    return t('describe.action.adaptation', { action: label, element, hazard, before, after });
  }
  const investment = actionResult(action, 'local_investment');
  if (investment) {
    const [before, after] = [investment.status_before, investment.status_after];
    return t('describe.action.investment', { action: label, element, before, after });
  }
  const diversification = actionResult(action, 'diversification');
  if (diversification) {
    const added = t('describe.action.diversification', {
      action: label,
      element: diversification.element_name,
      status: diversification.status,
    });
    return [added, ...diversification.marker_changes.map((change) => describeMarkerChange(game, change, t))].join('; ');
  }
  const emissions = actionResult(action, 'reduce_emissions');
  return emissions
    ? t('describe.action.emissions', { action: label, progress: emissions.progress, target: emissions.target })
    : label;
}

/** "Local government 1 money + 1 authority; Tourism industry 1 knowledge", or null for free actions. */
export function describePayers(game: GameState, action: GameAction, t: Translate): string | null {
  if (action.free || action.contributions.length === 0) return null;
  return orderedTeams(game)
    .flatMap((team) => {
      const paid = action.contributions
        .filter((c) => c.team_id === team.id)
        .map((c) => `${c.amount} ${t(resourceKey(c.resource)).toLowerCase()}`);
      return paid.length === 0 ? [] : [`${t(roleKey(team.role))} ${paid.join(' + ')}`];
    })
    .join('; ');
}

/** One entry per round that has happened, summarising actions, hazards, events and scores. */
export function buildHistory(game: GameState, texts: Texts): HistoryRound[] {
  const { t } = texts;
  if (game.current_round === null) return [];
  const rounds: HistoryRound[] = [];
  for (let round = 0; round <= game.current_round; round += 1) {
    const lines = actionsInRound(game, round).map((action) => describeAction(game, action, texts));

    const rolls = game.hazard_rolls.filter((roll) => roll.round === round && roll.resolved);
    if (rolls.length > 0) {
      const applied = rolls.filter((roll) => roll.applied).map((roll) => hazardName(game, roll.hazard_id));
      const skipped = rolls.filter((roll) => roll.triggered && !roll.applied).map((roll) => hazardName(game, roll.hazard_id));
      lines.push(applied.length > 0 ? t('history.hazards_triggered', { hazards: applied.join(', ') }) : t('history.no_hazard'));
      if (skipped.length > 0) lines.push(t('history.skipped_round0', { hazards: skipped.join(', ') }));
    }

    for (const event of game.events.filter((e) => e.round === round && e.status !== 'pending')) {
      if (event.status === 'avoided') {
        lines.push(t('history.event_avoided', { event: event.name }));
      } else {
        const changes = event.applied_changes.map((c) => describeChange(game, c, t)).join(', ') || t('history.no_change');
        lines.push(t('history.event_applied', { event: event.name, changes }));
      }
    }

    // A played Round 0 always resolves hazards, so an empty one that is over was skipped.
    if (round === 0 && lines.length === 0 && game.current_round >= 1) lines.push(t('history.round0_skipped'));
    rounds.push({ round, lines });
  }
  return rounds;
}

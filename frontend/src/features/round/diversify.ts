import type {
  Catalogue,
  DiversifyRequest,
  GameState,
  Hazard,
  MarkerChange,
  PaymentInput,
  Team,
  TeamRole,
} from '../../api/types';
import { describeMarkerChange, orderedTeams } from '../../lib/derive';
import type { Translate } from '../../texts';

/** A team's choice for one of its markers: move it, or split it, onto the new element. */
export interface MarkerChoice {
  change: MarkerChange;
  elementId: number;
}

/** What the moderator has entered so far for a Diversification. */
export interface DiversifyDraft {
  name: string;
  /** The starting status; null while its field is empty. */
  status: number | null;
  /** Vulnerability to each hazard, by hazard id. A hazard without an entry is still empty. */
  vulnerabilities: ReadonlyMap<number, number>;
  /** A team without a choice keeps its markers. */
  markers: Partial<Record<TeamRole, MarkerChoice | null>>;
}

type Limits = Catalogue['limits'];

/** A new element is lowest at status 0 and starts at most at the usual starting status. */
const LOWEST_STATUS = 0;

/** A blank form: the new element starts at its default status until the moderator changes it. */
export const emptyDraft = (limits: Limits): DiversifyDraft => ({
  name: '',
  status: limits.diversification_status,
  vulnerabilities: new Map(),
  markers: {},
});

export interface MarkerOption extends MarkerChoice {
  value: string;
  size: 'large' | 'small';
}

export const markerValue = (choice: MarkerChoice): string => `${choice.change}:${choice.elementId}`;

export function parseMarkerValue(value: string): MarkerChoice | null {
  const [change, id] = value.split(':');
  return (change === 'move' || change === 'split') && id !== undefined ? { change, elementId: Number(id) } : null;
}

/** What a team can do: any marker can move to the new element, but only a large marker can split. */
export function markerOptions(team: Team): MarkerOption[] {
  const largeFirst = [...team.priorities].sort((a, b) => Number(b.size === 'large') - Number(a.size === 'large'));
  return largeFirst.flatMap(({ element_id: elementId, size }) => {
    const move: MarkerOption = { change: 'move', elementId, size, value: markerValue({ change: 'move', elementId }) };
    const split: MarkerOption = { change: 'split', elementId, size, value: markerValue({ change: 'split', elementId }) };
    return size === 'large' ? [move, split] : [move];
  });
}

/** Why the name cannot be used, or null. Names are compared ignoring case, like the API does. */
export function nameProblem(game: GameState, draft: DiversifyDraft, t: Translate): string | null {
  const name = draft.name.trim();
  if (name === '') return t('round.diversify.problem_name');
  const taken = game.elements.some((element) => element.name.trim().toLowerCase() === name.toLowerCase());
  return taken ? t('round.diversify.problem_name_taken', { name }) : null;
}

/** Why the starting status cannot be used, or null: a whole number from 0 up to the usual starting status. */
export function statusProblem(draft: DiversifyDraft, limits: Limits, t: Translate): string | null {
  const { status } = draft;
  if (status === null) return t('round.diversify.problem_status_missing');
  const valid = Number.isInteger(status) && status >= LOWEST_STATUS && status <= limits.starting_status;
  return valid ? null : t('round.diversify.problem_status_range', { min: LOWEST_STATUS, max: limits.starting_status });
}

export function hazardsWithoutValue(game: GameState, draft: DiversifyDraft): Hazard[] {
  return game.hazards.filter((hazard) => !draft.vulnerabilities.has(hazard.id));
}

/** Why the action cannot be applied yet, or null once the element is named, has a status and a full vulnerability row. */
export function draftProblem(game: GameState, draft: DiversifyDraft, limits: Limits, t: Translate): string | null {
  const name = nameProblem(game, draft, t);
  if (name) return name;
  const status = statusProblem(draft, limits, t);
  if (status) return status;
  const missing = hazardsWithoutValue(game, draft);
  return missing.length > 0
    ? t('round.diversify.problem_vulnerability', { hazards: missing.map((hazard) => hazard.name).join(', ') })
    : null;
}

/** One sentence per team that changes a marker, for the preview. */
export function describeMarkerChoices(game: GameState, draft: DiversifyDraft, t: Translate): string[] {
  return orderedTeams(game).flatMap((team) => {
    const choice = draft.markers[team.role];
    if (!choice) return [];
    const size = team.priorities.find((priority) => priority.element_id === choice.elementId)?.size ?? 'small';
    return [describeMarkerChange(game, { team_id: team.id, change: choice.change, element_id: choice.elementId, size }, t)];
  });
}

export function toDiversifyRequest(
  game: GameState,
  draft: DiversifyDraft,
  payments: PaymentInput[],
  limits: Limits,
): DiversifyRequest {
  return {
    name: draft.name.trim(),
    status: draft.status ?? limits.diversification_status,
    vulnerabilities: game.hazards.map((hazard) => ({
      hazard_id: hazard.id,
      value: draft.vulnerabilities.get(hazard.id) ?? 0,
    })),
    marker_changes: orderedTeams(game).flatMap((team) => {
      const choice = draft.markers[team.role];
      return choice ? [{ team: team.role, change: choice.change, element_id: choice.elementId }] : [];
    }),
    payments,
  };
}

/** Standard catalogue elements that are not on the board yet, offered as name suggestions. */
export function unusedCatalogueElements(game: GameState, catalogue: Catalogue): string[] {
  const used = new Set(game.elements.map((element) => element.name.trim().toLowerCase()));
  return catalogue.element_groups.flatMap((group) => group.elements).filter((name) => !used.has(name.toLowerCase()));
}

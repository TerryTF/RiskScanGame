import type { ActionType, GameState, ResourceType, Resources, TeamRole } from '../api/types';

/** Text keys for team and resource names; the wording lives in `texts/keys/common.ts`. */
export const roleKey = (role: TeamRole) => `role.${role}` as const;
export const resourceKey = (resource: ResourceType) => `resource.${resource}` as const;

/** Fallback action names for `cardKeys.actionName`, used where the catalogue is not at hand. */
export const ACTION_LABEL: Record<ActionType, string> = {
  hazard_prediction: 'Hazard Prediction',
  risk_adaptation: 'Risk Adaptation',
  local_investment: 'Local Investment',
  diversification: 'Diversification',
  reduce_emissions: 'Reduce Emissions',
};

/** A signed change with a real minus sign, for example +1 or −2. */
export function signed(value: number): string {
  if (value > 0) return `+${value}`;
  if (value < 0) return `\u2212${Math.abs(value)}`;
  return '0';
}

export function totalResources(resources: Resources): number {
  return resources.money + resources.knowledge + resources.authority;
}

export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function roundTitle(game: GameState): string {
  return game.current_round === null ? 'Setup' : `Round ${game.current_round}`;
}

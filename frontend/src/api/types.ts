import type { components } from './schema';

type Schemas = components['schemas'];

export type GameState = Schemas['GameState'];
export type Element = Schemas['ElementOut'];
export type Hazard = Schemas['HazardOut'];
export type Vulnerability = Schemas['VulnerabilityOut'];
export type Team = Schemas['TeamOut'];
export type Priority = Schemas['PriorityOut'];
export type HazardRoll = Schemas['HazardRollOut'];
export type Damage = Schemas['DamageOut'];
export type GameAction = Schemas['ActionOut'];
export type GameEvent = Schemas['EventOut'];
export type EventEffect = Schemas['EffectOut'];
export type AppliedChange = Schemas['AppliedChangeOut'];
export type Score = Schemas['ScoreOut'];
export type Resources = Schemas['ResourcesOut'];

export type Catalogue = Schemas['CatalogueOut'];
export type ActionCard = Schemas['ActionCardOut'];
export type EventTemplate = Schemas['EventTemplateOut'];
export type TeamCard = Schemas['TeamCardOut'];
export type Limits = Schemas['LimitsOut'];

export type Phase = Schemas['Phase'];
export type TeamRole = Schemas['TeamRole'];
export type ResourceType = Schemas['ResourceType'];
export type PrioritySize = Schemas['PrioritySize'];
export type EffectKind = Schemas['EffectKind'];
export type EventType = Schemas['EventType'];
export type ActionType = Schemas['ActionType'];

export type CreateGameRequest = Schemas['CreateGameRequest'];
export type HazardInput = Schemas['HazardInput'];
export type VulnerabilityInput = Schemas['VulnerabilityInput'];
export type TeamInput = Schemas['TeamInput'];
export type TeamPrioritiesInput = Schemas['TeamPrioritiesInput'];
export type EventInput = Schemas['EventInput'];
export type EventEffectInput = Schemas['EventEffectInput'];
export type PaymentInput = Schemas['PaymentInput'];
export type PredictRequest = Schemas['PredictRequest'];
export type AdaptRequest = Schemas['AdaptRequest'];
export type InvestRequest = Schemas['InvestRequest'];
export type DiversifyRequest = Schemas['DiversifyRequest'];
export type HazardVulnerabilityInput = Schemas['HazardVulnerabilityInput'];
export type MarkerChangeInput = Schemas['MarkerChangeInput'];
export type MarkerChange = Schemas['MarkerChange'];

export type SavedTexts = Schemas['TextsOut'];
/** Text changes to save: a string replaces the wording, null restores the default. */
export type TextChanges = Schemas['SaveTextsRequest']['texts'];
export type SampleGame = Schemas['SampleGameOut'];

export const RESOURCE_TYPES: readonly ResourceType[] = ['money', 'knowledge', 'authority'];
export const TEAM_ROLES: readonly TeamRole[] = ['local_government', 'tourism_industry', 'civil_society'];

/** What an action stored as its `result`; the API types it loosely because it depends on the action. */
export interface ActionResults {
  hazard_prediction: { hazard_id: number; rolls: { round: number; die: number; newly_rolled: boolean }[] };
  risk_adaptation: { vulnerability_before: number; vulnerability_after: number };
  local_investment: { status_before: number; status_after: number };
  diversification: {
    element_id: number;
    element_name: string;
    status: number;
    vulnerabilities: { hazard_id: number; value: number }[];
    /** `element_id` is where the marker was before the change; `size` is the marker's size before it. */
    marker_changes: { team_id: number; change: MarkerChange; element_id: number; size: PrioritySize }[];
  };
  reduce_emissions: { progress: number; target: number };
}

export function actionResult<T extends ActionType>(action: GameAction, type: T): ActionResults[T] | null {
  return action.type === type ? (action.result as unknown as ActionResults[T]) : null;
}

/** How a paid action was split between its named cost parts and the wild part; null for free actions. */
export interface PaidCost {
  specific: Resources;
  wild: Resources;
}

export function paidCost(action: GameAction): PaidCost | null {
  return action.free ? null : (action.cost as unknown as PaidCost);
}

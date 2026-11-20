import type {
  Catalogue,
  EffectKind,
  EventInput,
  EventTemplate,
  EventType,
  GameState,
  Limits,
} from '../../api/types';
import { signed } from '../../lib/format';
import { cardKeys, editTemplateTargets, type CardTranslate, type Translate } from '../../texts';

/**
 * Events as the moderator edits them. Targets are held by name rather than id because the catalogue's templates name
 * hazards and elements; they are turned into ids when saved.
 */
export interface DraftEffect {
  id: string;
  kind: EffectKind;
  hazard: string | null;
  /** For element_status effects, null means every active element. */
  element: string | null;
  delta: number;
}

export interface DraftEvent {
  id: string;
  round: number;
  type: EventType;
  name: string;
  description: string;
  enabled: boolean;
  effects: DraftEffect[];
}

let counter = 0;
export const newDraftId = (): string => `draft-${(counter += 1)}`;

/** A draft from a catalogue template, worded and targeted with the names as edited in editor mode (`card`). */
export function instantiateTemplate(
  template: EventTemplate,
  game: GameState,
  round: number,
  card: CardTranslate,
): DraftEvent | null {
  const hazards = new Set(game.hazards.map((hazard) => hazard.name));
  const elements = new Set(game.elements.map((element) => element.name));
  const effects: DraftEffect[] = editTemplateTargets(template, card).effects.flatMap((effect) => {
    if (effect.hazard && !hazards.has(effect.hazard)) return [];
    if (effect.element && !elements.has(effect.element)) {
      // A status penalty falls back to every element; a vulnerability change needs its element.
      if (effect.kind !== 'element_status') return [];
      return [{ id: newDraftId(), kind: effect.kind, hazard: null, element: null, delta: effect.delta }];
    }
    return [{ id: newDraftId(), kind: effect.kind, hazard: effect.hazard, element: effect.element, delta: effect.delta }];
  });
  if (effects.length === 0) return null;
  return {
    id: newDraftId(),
    round,
    type: template.type,
    name: card(cardKeys.eventName(template.key), template.name),
    description: card(cardKeys.eventDescription(template.key), template.description),
    enabled: true,
    effects,
  };
}

export function blankEvent(game: GameState, round: number): DraftEvent {
  return {
    id: newDraftId(),
    round,
    type: 'standard',
    name: '',
    description: '',
    enabled: true,
    effects: [
      { id: newDraftId(), kind: 'hazard_probability', hazard: game.hazards[0]?.name ?? null, element: null, delta: 1 },
    ],
  };
}

export function draftsFromGame(game: GameState): DraftEvent[] {
  const hazardName = (id: number | null) => game.hazards.find((hazard) => hazard.id === id)?.name ?? null;
  const elementName = (id: number | null) => game.elements.find((element) => element.id === id)?.name ?? null;
  return game.events.map((event) => ({
    id: newDraftId(),
    round: event.round,
    type: event.type,
    name: event.name,
    description: event.description,
    enabled: true,
    effects: event.effects.map((effect) => ({
      id: newDraftId(),
      kind: effect.kind,
      hazard: effect.kind === 'element_status' ? null : hazardName(effect.hazard_id),
      element: effect.kind === 'hazard_probability' ? null : elementName(effect.element_id),
      delta: effect.delta,
    })),
  }));
}

/** A game still holding the API's default transition event, with nothing the moderator chose yet. */
function isPristine(game: GameState): boolean {
  return (
    game.events.every((event) => event.type === 'transition_pressure') &&
    game.events.every((event) => event.effects.every((effect) => effect.element_id === null))
  );
}

/**
 * The cards shown when the events step opens: the moderator's saved events, or, for a new game, the catalogue's
 * suggestion for each round plus the mandatory transition pressure event aimed at tourism businesses.
 */
export function initialDrafts(game: GameState, catalogue: Catalogue, card: CardTranslate): DraftEvent[] {
  if (!isPristine(game)) return draftsFromGame(game);

  const { transition_pressure_round: transitionRound } = catalogue.limits;
  const drafts: DraftEvent[] = [];
  for (let round = 1; round <= game.total_rounds; round += 1) {
    const suggestion = catalogue.event_templates
      .filter((template) => template.type === 'standard' && template.suggested_round === round)
      .map((template) => instantiateTemplate(template, game, round, card))
      .find((draft) => draft !== null);
    if (suggestion) drafts.push(suggestion);
  }
  const transition = catalogue.event_templates.find((template) => template.type === 'transition_pressure');
  const transitionDraft = transition && instantiateTemplate(transition, game, transitionRound, card);
  if (transitionDraft) drafts.push(transitionDraft);
  return drafts;
}

export function describeDraftEffect(effect: DraftEffect, type: EventType, t: Translate): string {
  const change = signed(effect.delta);
  switch (effect.kind) {
    case 'hazard_probability':
      return `${effect.hazard ?? t('setup.events.effect_no_hazard')} ${change}`;
    case 'vulnerability':
      return t('setup.events.effect_vulnerability', {
        element: effect.element ?? t('setup.events.effect_no_element'),
        hazard: effect.hazard ?? t('setup.events.effect_no_hazard_lower'),
        change,
      });
    case 'element_status': {
      const element = effect.element ?? t('setup.events.all_elements');
      return type === 'transition_pressure'
        ? t('setup.events.effect_transition', { element, change })
        : `${element} ${change}`;
    }
  }
}

export function validateDrafts(drafts: DraftEvent[], limits: Limits, t: Translate): string[] {
  const problems: string[] = [];
  const enabled = drafts.filter((draft) => draft.enabled);

  for (const draft of enabled) {
    const label = draft.name.trim() || t('setup.events.problem_unnamed_label', { round: draft.round });
    if (!draft.name.trim()) problems.push(t('setup.events.problem_name', { round: draft.round }));
    if (draft.effects.length === 0) problems.push(t('setup.events.problem_no_effect', { label }));
    for (const effect of draft.effects) {
      if (effect.delta === 0) problems.push(t('setup.events.problem_zero', { label }));
      if (effect.kind !== 'element_status' && !effect.hazard) problems.push(t('setup.events.problem_hazard', { label }));
      if (effect.kind === 'vulnerability' && !effect.element) problems.push(t('setup.events.problem_element', { label }));
      if (draft.type === 'transition_pressure' && effect.delta >= 0) problems.push(t('setup.events.problem_penalty', { label }));
    }
  }

  for (let round = 1; round <= Math.max(0, ...enabled.map((draft) => draft.round)); round += 1) {
    const count = enabled.filter((draft) => draft.round === round).length;
    if (count > limits.events_per_round_max) {
      problems.push(t('setup.events.problem_too_many', { round, count, max: limits.events_per_round_max }));
    }
  }

  const transitions = enabled.filter((draft) => draft.type === 'transition_pressure');
  if (transitions.length !== 1 || transitions[0]?.round !== limits.transition_pressure_round) {
    problems.push(t('setup.events.problem_transition', { round: limits.transition_pressure_round }));
  }
  return [...new Set(problems)];
}

export function toEventInputs(game: GameState, drafts: DraftEvent[]): EventInput[] {
  const hazardId = (name: string | null) => game.hazards.find((hazard) => hazard.name === name)?.id ?? null;
  const elementId = (name: string | null) => game.elements.find((element) => element.name === name)?.id ?? null;
  return drafts
    .filter((draft) => draft.enabled)
    .map((draft) => ({
      round: draft.round,
      type: draft.type,
      name: draft.name.trim(),
      description: draft.description.trim(),
      effects: draft.effects.map((effect) => ({
        kind: effect.kind,
        delta: effect.delta,
        hazard_id: effect.kind === 'element_status' ? null : hazardId(effect.hazard),
        element_id: effect.kind === 'hazard_probability' ? null : elementId(effect.element),
      })),
    }));
}

import type { ActionType, Catalogue, EventTemplate, TeamRole } from '../api/types';
import type { CardTranslate } from './context';

/** A stable key part from a catalogue name, for catalogue entries that have no key of their own. */
const slug = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'unnamed';

/**
 * Keys for card texts whose default wording comes from the game catalogue. Element and hazard names are keyed by their
 * catalogue name; a renamed element or hazard is saved into new games under its new name (see `editElementGroups`, `editHazardNames`).
 */
export const cardKeys = {
  elementGroup: (name: string) => `card.element_group.${slug(name)}`,
  elementName: (name: string) => `card.element.${slug(name)}`,
  hazardName: (name: string) => `card.hazard.${slug(name)}`,
  actionName: (key: ActionType | string) => `card.action.${key}.name`,
  actionDescription: (key: ActionType | string) => `card.action.${key}.description`,
  teamInterests: (role: TeamRole) => `card.team.${role}.interests`,
  eventName: (templateKey: string) => `card.event.${templateKey}.name`,
  eventDescription: (templateKey: string) => `card.event.${templateKey}.description`,
};

export const interestsText = (interests: string[]) => interests.join(', ');

/** Every card text and its default wording, for the editor's list of all texts. */
export function cardTextDefaults(catalogue: Catalogue): Record<string, string> {
  return Object.fromEntries([
    ...catalogue.element_groups.flatMap((group) => [
      [cardKeys.elementGroup(group.name), group.name],
      ...group.elements.map((name) => [cardKeys.elementName(name), name]),
    ]),
    ...catalogue.hazards.map((name) => [cardKeys.hazardName(name), name]),
    ...catalogue.actions.flatMap((card) => [
      [cardKeys.actionName(card.key), card.name],
      [cardKeys.actionDescription(card.key), card.description],
    ]),
    ...catalogue.teams.map((team) => [cardKeys.teamInterests(team.role), interestsText(team.interests)]),
    ...catalogue.event_templates.flatMap((template) => [
      [cardKeys.eventName(template.key), template.name],
      [cardKeys.eventDescription(template.key), template.description],
    ]),
  ]);
}

/** A template whose effects target elements and hazards by their names as edited in editor mode. */
export function editTemplateTargets(template: EventTemplate, card: CardTranslate): EventTemplate {
  return {
    ...template,
    effects: template.effects.map((effect) => ({
      ...effect,
      hazard: effect.hazard && card(cardKeys.hazardName(effect.hazard), effect.hazard),
      element: effect.element && card(cardKeys.elementName(effect.element), effect.element),
    })),
  };
}

/** Element groups with group and element names as edited in editor mode. New games are saved with these names. */
export function editElementGroups(groups: Catalogue['element_groups'], card: CardTranslate): Catalogue['element_groups'] {
  return groups.map((group) => ({
    name: card(cardKeys.elementGroup(group.name), group.name),
    elements: group.elements.map((name) => card(cardKeys.elementName(name), name)),
  }));
}

/** Hazard names as edited in editor mode. New games are saved with these names. */
export function editHazardNames(hazards: string[], card: CardTranslate): string[] {
  return hazards.map((name) => card(cardKeys.hazardName(name), name));
}

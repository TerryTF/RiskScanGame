import { describe, expect, it } from 'vitest';
import { makeCatalogue, makeGame } from '../../test/fixtures';
import { defaultTexts } from '../../texts';
import { initialDrafts, instantiateTemplate, toEventInputs, validateDrafts, type DraftEvent } from './events';

const { t, card } = defaultTexts;
const catalogue = makeCatalogue();
const game = makeGame({
  phase: 'SETUP',
  current_round: null,
  elements: [
    { id: 1, name: 'Tourism businesses', status: 10, active: true },
    { id: 2, name: 'Water supply', status: 10, active: true },
  ],
  hazards: [
    { id: 11, name: 'Extreme heat', probability: 4 },
    { id: 12, name: 'Heat stress', probability: 3 },
    { id: 13, name: 'Long drought', probability: 2 },
  ],
  teams: [],
  events: [
    {
      id: 1,
      round: 3,
      type: 'transition_pressure',
      name: 'Transition pressure',
      description: 'Penalty applies unless Reduce Emissions was completed.',
      effects: [{ kind: 'element_status', delta: -2, hazard_id: null, element_id: null }],
      status: 'pending',
      applied_changes: [],
    },
  ],
});

describe('initialDrafts', () => {
  it('suggests the storyboard events for a new game', () => {
    const drafts = initialDrafts(game, catalogue, card);

    expect(drafts.map((d) => `${d.round}:${d.name}`)).toEqual([
      '1:Rising temperatures',
      '2:Longer dry seasons',
      '3:Transition pressure',
    ]);
    const transition = drafts.at(-1);
    expect(transition?.type).toBe('transition_pressure');
    expect(transition?.effects[0]).toMatchObject({ element: 'Tourism businesses', delta: -2 });
  });

  it('only suggests effects for hazards and elements the game actually has', () => {
    const noHeatStress = { ...game, hazards: game.hazards.filter((h) => h.name !== 'Heat stress') };
    const first = initialDrafts(noHeatStress, catalogue, card)[0];
    expect(first?.effects.map((e) => e.hazard)).toEqual(['Extreme heat']);

    const noTourism = { ...game, elements: game.elements.filter((e) => e.name !== 'Tourism businesses') };
    const transition = initialDrafts(noTourism, catalogue, card).at(-1);
    expect(transition?.effects[0]?.element).toBeNull(); // falls back to every element
  });

  it('keeps the moderator\u2019s saved events instead of suggesting new ones', () => {
    const saved = makeGame({
      ...game,
      events: [
        {
          id: 5,
          round: 1,
          type: 'standard',
          name: 'My event',
          description: '',
          effects: [{ kind: 'vulnerability', delta: 1, hazard_id: 13, element_id: 2 }],
          status: 'pending',
          applied_changes: [],
        },
        ...game.events,
      ],
    });

    const drafts = initialDrafts(saved, catalogue, card);

    expect(drafts.map((d) => d.name)).toEqual(['My event', 'Transition pressure']);
    expect(drafts[0]?.effects[0]).toMatchObject({ kind: 'vulnerability', hazard: 'Long drought', element: 'Water supply' });
  });
});

describe('validateDrafts', () => {
  const limits = catalogue.limits;

  it('accepts the suggested events', () => {
    expect(validateDrafts(initialDrafts(game, catalogue, card), limits, t)).toEqual([]);
  });

  it('requires exactly one enabled transition pressure event in round 3', () => {
    const withoutTransition = initialDrafts(game, catalogue, card).filter((d) => d.type !== 'transition_pressure');
    expect(validateDrafts(withoutTransition, limits, t)).toContain('Round 3 needs exactly one Transition pressure event.');
  });

  it('allows at most two enabled events per round and ignores disabled ones', () => {
    const base = initialDrafts(game, catalogue, card);
    const extra = (name: string): DraftEvent => ({ ...(base[0] as DraftEvent), id: name, name });
    expect(validateDrafts([...base, extra('B'), extra('C')], limits, t).join(' ')).toContain('Round 1 has 3 events');
    expect(validateDrafts([...base, extra('B'), { ...extra('C'), enabled: false }], limits, t)).toEqual([]);
  });

  it('flags unnamed events, empty effects and a penalty that would help', () => {
    const base = initialDrafts(game, catalogue, card);
    const unnamed = { ...(base[0] as DraftEvent), name: ' ' };
    const bonus = {
      ...(base[2] as DraftEvent),
      effects: [{ ...(base[2] as DraftEvent).effects[0]!, delta: 2 }],
    };
    expect(validateDrafts([unnamed, base[1] as DraftEvent, bonus], limits, t)).toEqual(
      expect.arrayContaining(['Give the event in Round 1 a name.', 'Transition pressure: the penalty must reduce status.']),
    );
  });
});

describe('toEventInputs', () => {
  it('turns names into ids and drops disabled events', () => {
    const drafts = initialDrafts(game, catalogue, card);
    drafts[1] = { ...(drafts[1] as DraftEvent), enabled: false };

    const inputs = toEventInputs(game, drafts);

    expect(inputs).toHaveLength(2);
    expect(inputs[0]).toMatchObject({
      round: 1,
      type: 'standard',
      effects: [
        { kind: 'hazard_probability', delta: 1, hazard_id: 11, element_id: null },
        { kind: 'hazard_probability', delta: 1, hazard_id: 12, element_id: null },
      ],
    });
    expect(inputs[1]).toMatchObject({
      round: 3,
      type: 'transition_pressure',
      effects: [{ kind: 'element_status', delta: -2, hazard_id: null, element_id: 1 }],
    });
  });
});

describe('instantiateTemplate', () => {
  it('targets elements and hazards by the names edited in editor mode', () => {
    const edits: Record<string, string> = { 'card.hazard.long_drought': 'Dry spell', 'card.element.water_supply': 'Water' };
    const renamed = makeGame({
      elements: [{ id: 2, name: 'Water', status: 10, active: true }],
      hazards: [{ id: 13, name: 'Dry spell', probability: 2 }],
    });
    const template = catalogue.event_templates.find((item) => item.key === 'pressure_on_water_supplies')!;

    const draft = instantiateTemplate(template, renamed, 2, (key, fallback) => edits[key] ?? fallback);

    expect(draft?.effects).toMatchObject([{ kind: 'vulnerability', hazard: 'Dry spell', element: 'Water' }]);
    expect(instantiateTemplate(template, renamed, 2, card)).toBeNull();
  });
});

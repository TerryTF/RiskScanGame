import { describe, expect, it } from 'vitest';
import { makeCatalogue, makeGame } from '../../test/fixtures';
import { defaultTexts } from '../../texts';
import {
  describeMarkerChoices,
  draftProblem,
  emptyDraft,
  markerOptions,
  nameProblem,
  parseMarkerValue,
  statusProblem,
  toDiversifyRequest,
  unusedCatalogueElements,
  type DiversifyDraft,
} from './diversify';

// Elements: Beach tourism (1), Water supply (2), Harbour (3, inactive). Hazards: Extreme heat (1), Long drought (2).
// Local government holds a large marker on 1 and a small one on 2; Tourism a large on 2 and a small on 1; Civil society a large on 2.
const game = makeGame();
const { t } = defaultTexts;
const { limits } = makeCatalogue(); // a new element starts at status 7, the usual starting status is 10
const blank = emptyDraft(limits);
const team = (role: string) => {
  const found = game.teams.find((t) => t.role === role);
  if (!found) throw new Error(`no ${role}`);
  return found;
};

const complete: DiversifyDraft = {
  ...blank,
  name: '  Shaded walking routes ',
  vulnerabilities: new Map([
    [1, 1],
    [2, 0],
  ]),
};

describe('the Diversification draft', () => {
  it('needs a name that is not on the board yet, ignoring case and counting inactive elements', () => {
    expect(nameProblem(game, blank, t)).toBe('Name the new element.');
    expect(nameProblem(game, { ...blank, name: 'water SUPPLY' }, t)).toMatch(/already an element called/);
    expect(nameProblem(game, { ...blank, name: 'harbour' }, t)).toMatch(/already an element called/);
    expect(nameProblem(game, complete, t)).toBeNull();
  });

  it('starts at status 7, which the moderator may change to a whole number from 0 to the usual starting status', () => {
    expect(blank.status).toBe(7);
    expect(statusProblem(blank, limits, t)).toBeNull();
    for (const status of [0, 5, 10]) expect(statusProblem({ ...blank, status }, limits, t)).toBeNull();
    for (const status of [null, -1, 11, 5.5]) {
      expect(statusProblem({ ...blank, status }, limits, t)).toMatch(/^(Set the starting status|The starting status is a whole number from 0 to 10)/);
    }
    expect(draftProblem(game, { ...complete, status: 11 }, limits, t)).toBe('The starting status is a whole number from 0 to 10.');
    expect(draftProblem(game, { ...complete, status: null }, limits, t)).toBe('Set the starting status.');
  });

  it('needs a vulnerability for every hazard, and 0 counts as a value', () => {
    const missing = { ...complete, vulnerabilities: new Map([[1, 0]]) };

    expect(draftProblem(game, missing, limits, t)).toBe('Set the vulnerability to Long drought.');
    expect(draftProblem(game, { ...missing, vulnerabilities: new Map() }, limits, t)).toBe(
      'Set the vulnerability to Extreme heat, Long drought.',
    );
    expect(draftProblem(game, complete, limits, t)).toBeNull();
  });

  it('lets any marker move but only a large marker split, large markers first', () => {
    expect(markerOptions(team('local_government')).map((option) => option.value)).toEqual(['move:1', 'split:1', 'move:2']);
    expect(markerOptions(team('tourism_industry')).map((option) => option.value)).toEqual(['move:2', 'split:2', 'move:1']);
    expect(markerOptions(team('civil_society')).map((option) => option.value)).toEqual(['move:2', 'split:2']);
  });

  it('reads a choice back from its select value', () => {
    expect(parseMarkerValue('split:12')).toEqual({ change: 'split', elementId: 12 });
    expect(parseMarkerValue('move:3')).toEqual({ change: 'move', elementId: 3 });
    expect(parseMarkerValue('')).toBeNull();
    expect(parseMarkerValue('teleport:3')).toBeNull();
  });

  it('builds the request: trimmed name, status, one value per hazard, and only the teams that change a marker', () => {
    const draft: DiversifyDraft = {
      ...complete,
      status: 5,
      markers: {
        civil_society: { change: 'move', elementId: 2 },
        local_government: { change: 'split', elementId: 1 },
        tourism_industry: null,
      },
    };
    const payments = [{ team: 'tourism_industry' as const, money: 2, knowledge: 1, authority: 0 }];

    expect(toDiversifyRequest(game, draft, payments, limits)).toEqual({
      name: 'Shaded walking routes',
      status: 5,
      vulnerabilities: [
        { hazard_id: 1, value: 1 },
        { hazard_id: 2, value: 0 },
      ],
      marker_changes: [
        { team: 'local_government', change: 'split', element_id: 1 },
        { team: 'civil_society', change: 'move', element_id: 2 },
      ],
      payments,
    });
    expect(toDiversifyRequest(game, complete, payments, limits).status).toBe(7); // the default when left alone
  });

  it('describes the marker choices for the preview', () => {
    const draft: DiversifyDraft = {
      ...complete,
      markers: { local_government: { change: 'split', elementId: 1 }, civil_society: { change: 'move', elementId: 2 } },
    };

    expect(describeMarkerChoices(game, draft, t)).toEqual([
      'Local government split its large marker on Beach tourism',
      'Civil society moved its large marker from Water supply',
    ]);
    expect(describeMarkerChoices(game, complete, t)).toEqual([]);
  });

  it('suggests the standard elements that are not on the board', () => {
    const suggestions = unusedCatalogueElements(game, makeCatalogue());

    expect(suggestions).toHaveLength(19 - 2);
    expect(suggestions).toContain('Housing');
    expect(suggestions).not.toContain('Water supply');
    expect(suggestions).not.toContain('Beach tourism');
  });
});

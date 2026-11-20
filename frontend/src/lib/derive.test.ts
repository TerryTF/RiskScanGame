import { describe, expect, it } from 'vitest';
import type { GameEvent, GameState, HazardRoll } from '../api/types';
import { makeGame } from '../test/fixtures';
import {
  NO_CHANGES,
  buildHistory,
  describeAction,
  describeChange,
  describeEffect,
  diffStates,
  hazardDice,
  hazardStatusChanges,
  markersByElement,
  reduceEmissionsInfo,
  rollOutcome,
  roundScores,
  scoreHistory,
  visibleEvents,
} from './derive';
import { makeCatalogue } from '../test/fixtures';
import { defaultTexts, fillTemplate, type Texts } from '../texts';

const roll = (overrides: Partial<HazardRoll> = {}): HazardRoll => ({
  id: 1,
  round: 1,
  hazard_id: 1,
  die: 3,
  source: 'rolled',
  resolved: true,
  probability_at_roll: 4,
  triggered: true,
  applied: true,
  damages: [],
  ...overrides,
});

const event = (overrides: Partial<GameEvent> = {}): GameEvent => ({
  id: 1,
  round: 1,
  type: 'standard',
  name: 'Rising temperatures',
  description: '',
  effects: [{ kind: 'hazard_probability', delta: 1, hazard_id: 1, element_id: null }],
  status: 'pending',
  applied_changes: [],
  ...overrides,
});

/** The game after Local government split its large Beach tourism marker and Tourism moved its small one (new id 4). */
function diversified(game: GameState): GameState {
  return {
    ...game,
    elements: [...game.elements, { id: 4, name: 'Shaded walking routes', status: 7, active: true }],
    vulnerabilities: [
      ...game.vulnerabilities,
      { element_id: 4, hazard_id: 1, value: 1 },
      { element_id: 4, hazard_id: 2, value: 0 },
    ],
    teams: game.teams.map((team) => {
      if (team.role === 'local_government') {
        return {
          ...team,
          priorities: [
            { element_id: 1, size: 'small' },
            { element_id: 2, size: 'small' },
            { element_id: 4, size: 'small' },
          ],
        };
      }
      if (team.role === 'tourism_industry') {
        return {
          ...team,
          priorities: [
            { element_id: 2, size: 'large' },
            { element_id: 4, size: 'small' },
          ],
        };
      }
      return team;
    }),
    actions: [
      {
        id: 1,
        round: 1,
        type: 'diversification',
        element_id: 4,
        hazard_id: null,
        free: false,
        cost: {},
        contributions: [],
        result: {
          element_id: 4,
          element_name: 'Shaded walking routes',
          status: 7,
          vulnerabilities: [
            { hazard_id: 1, value: 1 },
            { hazard_id: 2, value: 0 },
          ],
          marker_changes: [
            { team_id: 1, change: 'split', element_id: 1, size: 'large' },
            { team_id: 2, change: 'move', element_id: 1, size: 'small' },
          ],
        },
      },
    ],
  };
}

describe('diffStates', () => {
  it('reports what changed in status, vulnerability and probability', () => {
    const before = makeGame();
    const after = makeGame({
      elements: before.elements.map((e) => (e.id === 1 ? { ...e, status: 8 } : e)),
      vulnerabilities: before.vulnerabilities.map((v) =>
        v.element_id === 2 && v.hazard_id === 2 ? { ...v, value: 2 } : v,
      ),
      hazards: before.hazards.map((h) => (h.id === 1 ? { ...h, probability: 5 } : h)),
    });

    const changes = diffStates(before, after);

    expect([...changes.statuses]).toEqual([1]);
    expect([...changes.cells]).toEqual(['2:2']);
    expect([...changes.probabilities]).toEqual([1]);
  });

  it('reports nothing for identical states or for a different game', () => {
    const game = makeGame();
    expect(diffStates(game, makeGame()).statuses.size).toBe(0);
    expect(diffStates(game, makeGame({ id: 'other', elements: [] }))).toBe(NO_CHANGES);
  });

  it('reports an added element and the markers that moved to it, but not the first placement of markers', () => {
    const before = makeGame();
    const after = diversified(before);

    const changes = diffStates(before, after);

    expect([...changes.added]).toEqual([4]);
    // Beach tourism's markers changed (a split and a move), Water supply's did not, and the new row gained markers.
    expect([...changes.markers].sort()).toEqual([1, 4]);

    const unplaced = makeGame({ teams: before.teams.map((team) => ({ ...team, priorities: [] })) });
    expect(diffStates(unplaced, before).markers.size).toBe(0);
  });
});

describe('hazards', () => {
  it('adds up the damage of every triggered hazard in a round per element', () => {
    const game = makeGame({
      hazard_rolls: [
        roll({
          id: 1,
          hazard_id: 1,
          damages: [
            { element_id: 1, vulnerability: 2, status_before: 10, status_after: 8 },
            { element_id: 2, vulnerability: 0, status_before: 8, status_after: 8 },
          ],
        }),
        roll({
          id: 2,
          hazard_id: 2,
          damages: [{ element_id: 1, vulnerability: 1, status_before: 8, status_after: 7 }],
        }),
      ],
    });

    expect(hazardStatusChanges(game, 1)).toEqual([{ elementId: 1, before: 10, after: 7 }]);
  });

  it('tells apart a trigger, no event, and a skipped trigger', () => {
    expect(rollOutcome(roll())).toBe('trigger');
    expect(rollOutcome(roll({ triggered: false, applied: false }))).toBe('no_event');
    expect(rollOutcome(roll({ applied: false }))).toBe('skip');
  });

  it('finds the die for this round and the predicted die for the next', () => {
    const game = makeGame({
      hazard_rolls: [
        roll({ id: 1, round: 1, die: 4, resolved: false, source: 'predicted' }),
        roll({ id: 2, round: 2, die: 6, resolved: false, source: 'predicted' }),
      ],
    });

    const dice = hazardDice(game).get(1);

    expect(dice?.current?.die).toBe(4);
    expect(dice?.next?.die).toBe(6);
    expect(hazardDice(game).get(2)).toEqual({ current: null, next: null });
  });
});

describe('markers and scores', () => {
  it('lists large markers before small ones, teams in the fixed order', () => {
    const markers = markersByElement(makeGame()).get(2) ?? [];
    expect(markers.map((m) => `${m.team.role}:${m.size}`)).toEqual([
      'tourism_industry:large',
      'civil_society:large',
      'local_government:small',
    ]);
  });

  it('orders a round\u2019s scores from highest to lowest', () => {
    const game = makeGame({
      scores: [
        { round: 1, team_id: 1, large_total: 20, small_total: 5, score: 25 },
        { round: 1, team_id: 2, large_total: 30, small_total: 0, score: 30 },
        { round: 2, team_id: 3, large_total: 1, small_total: 1, score: 2 },
      ],
    });

    expect(roundScores(game, 1).map((row) => row.score)).toEqual([30, 25]);
  });

  it('builds a per-round score table with each change and each round\u2019s highest score', () => {
    const game = makeGame({
      scores: [
        { round: 1, team_id: 1, large_total: 20, small_total: 5, score: 25 },
        { round: 1, team_id: 2, large_total: 30, small_total: 0, score: 30 },
        { round: 2, team_id: 1, large_total: 22, small_total: 6, score: 28 },
        { round: 2, team_id: 2, large_total: 20, small_total: 0, score: 20 },
        { round: 3, team_id: 1, large_total: 1, small_total: 1, score: 2 },
      ],
    });

    const table = scoreHistory(game, 2);
    const byTeam = new Map(table.rows.map((row) => [row.team.id, row.cells]));

    expect(table.rounds).toEqual([1, 2]);
    expect(table.rows[0]?.team.id).toBe(1);
    expect(byTeam.get(1)?.map((c) => c && [c.score, c.best, c.change])).toEqual([
      [25, false, null],
      [28, true, 3],
    ]);
    expect(byTeam.get(2)?.map((c) => c && [c.score, c.best, c.change])).toEqual([
      [30, true, null],
      [20, false, -10],
    ]);
  });
});

describe('events', () => {
  it('hides events that have not taken effect from participants', () => {
    const game = makeGame({ events: [event({ id: 1 }), event({ id: 2, status: 'applied' })] });

    expect(visibleEvents(game, 'moderator')).toHaveLength(2);
    expect(visibleEvents(game, 'participant').map((e) => e.id)).toEqual([2]);
  });

  it('describes effects and what they changed with element and hazard names', () => {
    const game = makeGame();
    expect(describeEffect(game, { kind: 'hazard_probability', delta: 1, hazard_id: 1, element_id: null }, defaultTexts.t)).toBe(
      'Extreme heat probability +1',
    );
    expect(describeEffect(game, { kind: 'element_status', delta: -2, hazard_id: null, element_id: null }, defaultTexts.t)).toBe(
      'All elements status \u22122',
    );
    expect(
      describeChange(game, { kind: 'vulnerability', hazard_id: 2, element_id: 2, before: 3, after: 2 }, defaultTexts.t),
    ).toBe('Water supply \u00d7 Long drought 3\u21922');
  });
});

describe('reduceEmissionsInfo', () => {
  it('knows the eligible rounds and whether it was already used this round', () => {
    const limits = makeCatalogue().limits;
    const used = makeGame({
      reduce_emissions_progress: 1,
      actions: [
        { id: 1, round: 1, type: 'reduce_emissions', element_id: null, hazard_id: null, free: false, cost: {}, contributions: [], result: {} },
      ],
    });

    expect(reduceEmissionsInfo(used, limits)).toMatchObject({ progress: 1, eligibleRound: true, usedThisRound: true });
    expect(reduceEmissionsInfo(makeGame({ current_round: 3 }), limits).eligibleRound).toBe(false);
  });
});

describe('buildHistory', () => {
  it('summarises actions, hazards (including Round 0 skips) and events per round', () => {
    const game = makeGame({
      current_round: 1,
      hazard_rolls: [
        roll({ id: 1, round: 0, hazard_id: 1, triggered: true, applied: true }),
        roll({ id: 2, round: 0, hazard_id: 2, triggered: true, applied: false }),
      ],
      actions: [
        {
          id: 1,
          round: 0,
          type: 'local_investment',
          element_id: 1,
          hazard_id: null,
          free: true,
          cost: {},
          contributions: [],
          result: { status_before: 10, status_after: 12 },
        },
      ],
      events: [
        event({
          round: 1,
          status: 'applied',
          applied_changes: [{ kind: 'hazard_probability', hazard_id: 1, element_id: null, before: 4, after: 5 }],
        }),
      ],
      scores: [{ round: 1, team_id: 1, large_total: 20, small_total: 5, score: 25 }],
    });

    const history = buildHistory(game, defaultTexts);

    expect(history[0]?.lines).toEqual([
      'Local Investment: Beach tourism, status 10\u219212',
      'Hazards triggered: Extreme heat',
      'Skipped in Round 0: Long drought',
    ]);
    expect(history[1]?.lines).toEqual(['Rising temperatures: Extreme heat 4\u21925']);
  });

  it('has nothing to show before Round 0 starts', () => {
    expect(buildHistory(makeGame({ current_round: null }), defaultTexts)).toEqual([]);
  });

  it('says Round 0 was skipped once Round 1 has begun without it, but not while Round 0 is under way', () => {
    expect(buildHistory(makeGame({ current_round: 1 }), defaultTexts)[0]).toEqual({
      round: 0,
      lines: ['Practice round skipped'],
    });
    expect(buildHistory(makeGame({ current_round: 0 }), defaultTexts)[0]?.lines).toEqual([]);
  });

  it('records a Diversification with the new element and each marker change', () => {
    const game = diversified(makeGame());
    const action = game.actions[0];
    expect(action && describeAction(game, action, defaultTexts)).toBe(
      'Diversification: Shaded walking routes added at status 7; ' +
        'Local government split its large marker on Beach tourism; ' +
        'Tourism industry moved its small marker from Beach tourism',
    );
    expect(buildHistory(game, defaultTexts)[1]?.lines[0]).toContain('Shaded walking routes added at status 7');
  });

  it('records a Diversification without marker changes as just the new element', () => {
    const game = diversified(makeGame());
    const action = game.actions[0];
    if (!action) throw new Error('expected a diversification');
    const bare = { ...action, result: { ...action.result, marker_changes: [] } };
    expect(describeAction(game, bare, defaultTexts)).toBe('Diversification: Shaded walking routes added at status 7');
  });

  it('words a Diversification with the edited texts', () => {
    const game = diversified(makeGame());
    const action = game.actions[0];
    if (!action) throw new Error('expected a diversification');
    const edited: Texts = {
      ...defaultTexts,
      t: (key, vars) =>
        key === 'describe.marker.split'
          ? fillTemplate('{team} divided a large marker on {element}', vars)
          : defaultTexts.t(key, vars),
    };

    expect(describeAction(game, action, edited)).toContain('Local government divided a large marker on Beach tourism');
  });
});

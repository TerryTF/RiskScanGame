import { describe, expect, it } from 'vitest';
import { createClient, type RiskScanClient } from '../api/client';
import type { GameState, PaymentInput } from '../api/types';

/**
 * Plays a whole game through the typed API client against a real backend, so the client, its types and the API
 * cannot drift apart unnoticed. It is skipped unless a backend URL is given:
 *
 *   RISKSCAN_E2E_URL=http://127.0.0.1:8000 npm test -- src/e2e
 *
 * Dice come from whatever provider the backend runs with, so it checks rules that hold for any dice.
 */
const baseUrl = process.env.RISKSCAN_E2E_URL;

const pay = (team: PaymentInput['team'], money = 0, knowledge = 0, authority = 0): PaymentInput => ({
  team,
  money,
  knowledge,
  authority,
});

describe.skipIf(!baseUrl)('a full game against a running backend', () => {
  const api = createClient({ baseUrl });

  it('is set up, practised in Round 0, played for four rounds and scored', async () => {
    const catalogue = await api.catalogue();
    expect(catalogue.limits.regular_rounds).toContain(4);

    let game = await api.createGame({ destination_name: 'E2E coast', geographic_scope: 'Island', total_rounds: 4 });
    const id = game.id;
    expect(game).toMatchObject({ phase: 'SETUP', geographic_scope: 'Island', total_rounds: 4 });

    game = await api.setElements(id, [
      'Beach tourism',
      'Tourism businesses',
      'Water supply',
      'Nature and wildlife',
      'Housing',
      'Energy supply',
    ]);
    game = await api.setHazards(id, [
      { name: 'Extreme heat', probability: 4 },
      { name: 'Heat stress', probability: 3 },
      { name: 'Long drought', probability: 2 },
      { name: 'Wildfire', probability: 2 },
    ]);
    game = await api.setVulnerabilities(
      id,
      game.elements.flatMap((e) => game.hazards.map((h) => ({ element_id: e.id, hazard_id: h.id, value: 1 }))),
    );
    const byName = <T extends { id: number; name: string }>(items: T[], name: string) => {
      const found = items.find((item) => item.name === name);
      if (!found) throw new Error(`Missing ${name}`);
      return found.id;
    };
    const heat = byName(game.hazards, 'Extreme heat');
    game = await api.setEvents(id, [
      {
        round: 1,
        type: 'standard',
        name: 'Rising temperatures',
        description: '',
        effects: [{ kind: 'hazard_probability', delta: 1, hazard_id: heat, element_id: null }],
      },
      {
        round: catalogue.limits.transition_pressure_round,
        type: 'transition_pressure',
        name: 'Transition pressure',
        description: '',
        effects: [
          { kind: 'element_status', delta: -2, hazard_id: null, element_id: byName(game.elements, 'Tourism businesses') },
        ],
      },
    ]);
    game = await api.completeSetup(id);
    expect(game.phase).toBe('PRIORITIES');

    // Nobody prioritises Energy supply, so it leaves the active destination.
    const chosen = ['Beach tourism', 'Tourism businesses', 'Water supply', 'Nature and wildlife'].map((n) =>
      byName(game.elements, n),
    );
    game = await api.setPriorities(
      id,
      (['local_government', 'tourism_industry', 'civil_society'] as const).map((role) => ({
        role,
        large: [chosen[0] as number, chosen[1] as number],
        small: [chosen[2] as number, chosen[3] as number],
      })),
    );
    const energy = game.elements.find((e) => e.name === 'Energy supply');
    expect(energy).toMatchObject({ active: false, status: 10 });

    // Round 0: three free demonstration actions, then hazards with at most two causing damage.
    game = await api.startRoundZero(id);
    expect(game.phase).toBe('ROUND0_PREDICTION');
    game = await api.predict(id, { hazard_id: heat, payments: [] });
    game = await api.adapt(id, { element_id: chosen[0] as number, hazard_id: heat, payments: [] });
    game = await api.invest(id, { element_id: chosen[1] as number, payments: [] });
    game = await api.runStep(id, 0, 'resolve-hazards');
    const roundZeroRolls = game.hazard_rolls.filter((r) => r.round === 0);
    expect(roundZeroRolls).toHaveLength(4);
    expect(roundZeroRolls.filter((r) => r.applied).length).toBeLessThanOrEqual(catalogue.limits.round_zero_damage_limit);
    expect(game.phase).toBe('SCORING');
    game = await api.runStep(id, 0, 'score');
    expect(game.scores.filter((s) => s.round === 0)).toHaveLength(3);
    game = await api.runStep(id, 0, 'complete');
    expect(game).toMatchObject({ phase: 'RESOURCE_ALLOCATION', current_round: 1 });

    for (let round = 1; round <= 4; round += 1) {
      game = await api.runStep(id, round, 'allocate-resources');
      expect(game.phase).toBe('ACTION_PHASE');

      const reduceRounds = catalogue.limits.reduce_emissions_rounds;
      if (reduceRounds.includes(round)) {
        game = await api.reduceEmissions(id, [pay('tourism_industry', 1), pay('civil_society', 0, 1), pay('local_government', 0, 0, 1)]);
      }
      game = await api.invest(id, { element_id: chosen[2] as number, payments: [pay('tourism_industry', 3)] });
      game = await api.adapt(id, {
        element_id: chosen[1] as number,
        hazard_id: byName(game.hazards, 'Long drought'),
        payments: [pay('local_government', 1, 0, 2), pay('civil_society', 0, 1)],
      });

      if (round === 3) {
        // Round 3 is the first round with enough left over (2 money, 1 knowledge, 1 authority) for Diversification.
        // It starts at status 6 rather than the default 7, to cover the moderator changing it.
        game = await api.diversify(id, {
          name: 'Shaded walking routes',
          status: 6,
          vulnerabilities: game.hazards.map((h) => ({ hazard_id: h.id, value: 1 })),
          marker_changes: [
            { team: 'local_government', change: 'split', element_id: chosen[0] as number },
            { team: 'tourism_industry', change: 'move', element_id: chosen[3] as number },
          ],
          payments: [pay('local_government', 1, 0, 1), pay('tourism_industry', 1, 1)],
        });
        expectDiversified(game, 6, chosen);
      }

      for (const step of ['close-actions', 'resolve-hazards', 'apply-event', 'score'] as const) {
        game = await api.runStep(id, round, step);
      }
      expect(game.phase).toBe('ROUND_COMPLETE');
      game = await api.runStep(id, round, 'complete');
    }

    expectFinishedGame(game);
  });

  it('can skip Round 0 and go straight to Round 1', async () => {
    const { id } = await gameReadyForRoundZero(api);

    let game = await api.skipRoundZero(id);
    expect(game).toMatchObject({ phase: 'RESOURCE_ALLOCATION', current_round: 1 });
    expect(game.actions).toEqual([]);
    expect(game.hazard_rolls).toEqual([]);
    expect(game.elements.every((e) => e.status === 10)).toBe(true);

    expect(await api.skipRoundZero(id)).toEqual(game); // repeating it changes nothing
    game = await api.runStep(id, 1, 'allocate-resources');
    expect(game.phase).toBe('ACTION_PHASE');
  });
});

/** A small game with its priorities saved, so it waits at the choice between Round 0 and Round 1. */
async function gameReadyForRoundZero(api: RiskScanClient): Promise<GameState> {
  const created = await api.createGame({ destination_name: 'E2E skip', geographic_scope: 'Island', total_rounds: 4 });
  const id = created.id;
  const withElements = await api.setElements(id, ['Beach tourism', 'Tourism businesses', 'Water supply', 'Nature and wildlife']);
  const { hazards } = await api.setHazards(id, [
    { name: 'Extreme heat', probability: 4 },
    { name: 'Long drought', probability: 2 },
  ]);
  const elements = withElements.elements.map((e) => e.id);
  await api.setVulnerabilities(
    id,
    elements.flatMap((element_id) => hazards.map((h) => ({ element_id, hazard_id: h.id, value: 1 }))),
  );
  await api.completeSetup(id);
  return api.setPriorities(
    id,
    (['local_government', 'tourism_industry', 'civil_society'] as const).map((role) => ({
      role,
      large: [elements[0] as number, elements[1] as number],
      small: [elements[2] as number, elements[3] as number],
    })),
  );
}

function expectDiversified(game: GameState, status: number, chosen: number[]) {
  const added = game.elements.find((e) => e.name === 'Shaded walking routes');
  expect(added).toMatchObject({ status, active: true });
  expect(game.vulnerabilities.filter((v) => v.element_id === added?.id)).toHaveLength(game.hazards.length);

  const markers = (role: string) =>
    Object.fromEntries((game.teams.find((t) => t.role === role)?.priorities ?? []).map((p) => [p.element_id, p.size]));
  const [first, second, third, fourth] = chosen;
  // A large marker split leaves a small one behind; a small marker moved leaves nothing behind.
  expect(markers('local_government')).toEqual({
    [first as number]: 'small',
    [second as number]: 'large',
    [third as number]: 'small',
    [fourth as number]: 'small',
    [added?.id as number]: 'small',
  });
  expect(markers('tourism_industry')).toEqual({
    [first as number]: 'large',
    [second as number]: 'large',
    [third as number]: 'small',
    [added?.id as number]: 'small',
  });
  expect(markers('civil_society')).toEqual({
    [first as number]: 'large',
    [second as number]: 'large',
    [third as number]: 'small',
    [fourth as number]: 'small',
  });
}

function expectFinishedGame(game: GameState) {
  expect(game.phase).toBe('GAME_COMPLETE');
  expect(game.reduce_emissions_progress).toBe(2);
  expect(game.events.find((e) => e.type === 'transition_pressure')?.status).toBe('avoided');
  expect(game.winners.length).toBeGreaterThan(0);

  for (const round of [1, 2, 3, 4]) {
    expect(game.scores.filter((s) => s.round === round)).toHaveLength(3);
    // Unused resources expire, so every round's ledger nets to zero.
    expect(game.ledger.filter((entry) => entry.round === round).reduce((sum, entry) => sum + entry.delta, 0)).toBe(0);
  }
  const final = game.scores.filter((s) => s.round === 4);
  const best = Math.max(...final.map((s) => s.score));
  expect([...game.winners].sort()).toEqual(final.filter((s) => s.score === best).map((s) => s.team_id).sort());
  expect(game.elements.find((e) => e.name === 'Energy supply')).toMatchObject({ active: false, status: 10 });
}

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/client';
import type { GameEvent, GameState } from '../api/types';
import { makeCatalogue, makeGame, makeSetupGame } from '../test/fixtures';
import { fakeClient, renderWithApp } from '../test/render';
import { BoardPage } from './BoardPage';
import { ModeratorPage } from './ModeratorPage';

const catalogue = makeCatalogue();

const risingTemperatures = (overrides: Partial<GameEvent> = {}): GameEvent => ({
  id: 1,
  round: 1,
  type: 'standard',
  name: 'Rising temperatures',
  description: 'Warmer conditions.',
  effects: [{ kind: 'hazard_probability', delta: 1, hazard_id: 1, element_id: null }],
  status: 'pending',
  applied_changes: [],
  ...overrides,
});

function moderate(game: GameState, overrides: Parameters<typeof fakeClient>[0] = {}) {
  const client = fakeClient({
    getGame: vi.fn().mockResolvedValue(game),
    catalogue: vi.fn().mockResolvedValue(catalogue),
    ...overrides,
  });
  renderWithApp(<ModeratorPage />, { client, route: `/games/${game.id}`, path: '/games/:gameId' });
  return { client, user: userEvent.setup() };
}

function watch(game: GameState) {
  const client = fakeClient({
    getGame: vi.fn().mockResolvedValue(game),
    catalogue: vi.fn().mockResolvedValue(catalogue),
  });
  renderWithApp(<BoardPage />, { client, route: `/board/${game.id}`, path: '/board/:gameId' });
  return { client };
}

/** The priorities step with six elements, every team holding its two large and two small markers. */
function withPriorities(saved = true): GameState {
  const game = makeGame();
  const elements = [1, 2, 3, 4, 5, 6].map((id) => ({ id, name: `Element ${id}`, status: 10, active: true }));
  const markers = saved ? [[1, 2, 3, 4], [3, 4, 5, 6], [5, 6, 1, 2]] : [[], [], []];
  return makeGame({
    phase: 'PRIORITIES',
    current_round: null,
    elements,
    vulnerabilities: elements.flatMap((e) => game.hazards.map((h) => ({ element_id: e.id, hazard_id: h.id, value: 1 }))),
    teams: game.teams.map((team, index) => ({
      ...team,
      priorities: (markers[index] ?? []).map((element_id, slot) => ({
        element_id,
        size: slot < 2 ? ('large' as const) : ('small' as const),
      })),
    })),
  });
}

describe('ModeratorPage', () => {
  it('opens the setup wizard at the first unfinished step for a game in setup', async () => {
    moderate(makeSetupGame({ elements: [], hazards: [] }));
    expect(await screen.findByRole('heading', { name: /Choose destination elements/ })).toBeInTheDocument();
    expect(screen.getByText('SETUP 2 / 5')).toBeInTheDocument();
  });

  it('asks before leaving a setup step with unsaved changes, and only then', async () => {
    const { user } = moderate(makeSetupGame({ elements: [], hazards: [] }));
    await screen.findByRole('heading', { name: /Choose destination elements/ });
    const startTab = screen.getByRole('button', { name: /1\s*Start/ });

    await user.click(screen.getByRole('checkbox', { name: 'Housing' }));
    await user.click(startTab);
    const dialog = screen.getByRole('dialog', { name: 'Unsaved changes' });
    await user.click(within(dialog).getByRole('button', { name: 'Stay on this step' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Housing' })).toBeChecked();

    await user.click(startTab);
    await user.click(screen.getByRole('button', { name: 'Leave without saving' }));
    expect(screen.getByText('SETUP 1 / 5')).toBeInTheDocument();

    // Nothing was changed on the summary step, so going on does not ask.
    await user.click(screen.getByRole('button', { name: /2\s*Elements/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Housing' })).not.toBeChecked();
  });

  it('says when the game does not exist', async () => {
    const client = fakeClient({
      getGame: vi.fn().mockRejectedValue(new ApiError(404, 'Game not found.')),
      catalogue: vi.fn().mockResolvedValue(catalogue),
    });
    renderWithApp(<ModeratorPage />, { client, route: '/games/nope', path: '/games/:gameId' });

    expect(await screen.findByRole('heading', { name: 'Game not found' })).toBeInTheDocument();
  });

  it('records a paid action with who pays and shows the result', async () => {
    const game = makeGame();
    const after = makeGame({
      elements: game.elements.map((e) => (e.id === 2 ? { ...e, status: 10 } : e)),
      actions: [
        {
          id: 1,
          round: 1,
          type: 'local_investment',
          element_id: 2,
          hazard_id: null,
          free: false,
          cost: {},
          contributions: [{ team_id: 2, resource: 'money', amount: 3 }],
          result: { status_before: 8, status_after: 10 },
        },
      ],
    });
    const { client, user } = moderate(game, { invest: vi.fn().mockResolvedValue(after) });

    await user.click(await screen.findByRole('button', { name: /Local Investment/ }));
    await user.selectOptions(screen.getByLabelText('Element'), '2');
    await user.type(screen.getByLabelText(/Tourism Industry pays money/), '3');
    await user.click(screen.getByRole('button', { name: 'Apply action' }));

    await waitFor(() =>
      expect(client.invest).toHaveBeenCalledWith('game-1', {
        element_id: 2,
        payments: [{ team: 'tourism_industry', money: 3, knowledge: 0, authority: 0 }],
      }),
    );
    expect(await screen.findByText(/Water supply, status 8\u219210/)).toBeInTheDocument();
    expect(screen.getByText(/paid by Tourism industry 3 money/)).toBeInTheDocument();
  });

  it('shows why the API refused an action and keeps the form', async () => {
    const refusal = new ApiError(409, 'Tourism Industry cannot contribute 3 money; it has 2 money.');
    const { user } = moderate(makeGame(), { invest: vi.fn().mockRejectedValue(refusal) });

    await user.click(await screen.findByRole('button', { name: /Local Investment/ }));
    await user.selectOptions(screen.getByLabelText('Element'), '2');
    await user.type(screen.getByLabelText(/Tourism Industry pays money/), '3');
    await user.click(screen.getByRole('button', { name: 'Apply action' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('cannot contribute 3 money');
    expect(screen.getByRole('button', { name: 'Apply action' })).toBeInTheDocument();
  });

  it('only offers Reduce Emissions in the rounds it exists in, while Diversification stays available', async () => {
    moderate(makeGame({ current_round: 3 }));
    expect(await screen.findByRole('button', { name: /Reduce Emissions/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Diversification/ })).toBeEnabled();
  });

  it('adds an element with Diversification: its name and vulnerabilities, a marker choice and one payment', async () => {
    const game = makeGame();
    const added = { id: 4, name: 'Shaded walking routes', status: 6, active: true };
    const after = makeGame({
      elements: [...game.elements, added],
      actions: [
        {
          id: 1,
          round: 1,
          type: 'diversification',
          element_id: 4,
          hazard_id: null,
          free: false,
          cost: {},
          contributions: [
            { team_id: 2, resource: 'money', amount: 2 },
            { team_id: 2, resource: 'knowledge', amount: 1 },
            { team_id: 1, resource: 'authority', amount: 1 },
          ],
          result: {
            element_id: 4,
            element_name: 'Shaded walking routes',
            status: 6,
            vulnerabilities: [
              { hazard_id: 1, value: 1 },
              { hazard_id: 2, value: 0 },
            ],
            marker_changes: [{ team_id: 1, change: 'split', element_id: 1, size: 'large' }],
          },
        },
      ],
    });
    const { client, user } = moderate(game, { diversify: vi.fn().mockResolvedValue(after) });

    await user.click(await screen.findByRole('button', { name: /Diversification/ }));
    const apply = screen.getByRole('button', { name: 'Apply action' });
    expect(apply).toBeDisabled();
    expect(screen.getByText('Name the new element.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('New element name'), 'Shaded walking routes');
    const status = screen.getByLabelText('Starting status');
    expect(status).toHaveValue(7); // the default, until the moderator changes it
    await user.clear(status);
    expect(screen.getByText('Set the starting status.')).toBeInTheDocument();
    await user.type(status, '6');
    await user.type(screen.getByLabelText('Vulnerability to Extreme heat'), '1');
    expect(screen.getByText('Set the vulnerability to Long drought.')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Vulnerability to Long drought'), '0');
    await user.selectOptions(screen.getByLabelText('Local Government marker choice'), 'split:1');
    expect(screen.getByText('Local government split its large marker on Beach tourism.')).toBeInTheDocument();
    expect(apply).toBeDisabled(); // the payment is still missing

    await user.type(screen.getByLabelText(/Tourism Industry pays money/), '2');
    await user.type(screen.getByLabelText(/Tourism Industry pays knowledge/), '1');
    await user.type(screen.getByLabelText(/Local Government pays authority/), '1');
    await user.click(apply);

    await waitFor(() =>
      expect(client.diversify).toHaveBeenCalledWith('game-1', {
        name: 'Shaded walking routes',
        status: 6,
        vulnerabilities: [
          { hazard_id: 1, value: 1 },
          { hazard_id: 2, value: 0 },
        ],
        marker_changes: [{ team: 'local_government', change: 'split', element_id: 1 }],
        payments: expect.arrayContaining([
          { team: 'tourism_industry', money: 2, knowledge: 1, authority: 0 },
          { team: 'local_government', money: 0, knowledge: 0, authority: 1 },
        ]),
      }),
    );
    expect(await screen.findByText(/Shaded walking routes added at status 6; Local government split/)).toBeInTheDocument();
    expect(screen.getByRole('row', { name: /Shaded walking routes/ })).toBeInTheDocument();
    expect(screen.queryByLabelText('New element name')).not.toBeInTheDocument(); // the form closed
  });

  it('explains a Diversification name that is already on the board and keeps Apply disabled', async () => {
    const { user } = moderate(makeGame());

    await user.click(await screen.findByRole('button', { name: /Diversification/ }));
    await user.type(screen.getByLabelText('New element name'), 'water SUPPLY');

    expect(screen.getAllByText(/There is already an element called/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Apply action' })).toBeDisabled();
  });

  it('closes the action phase', async () => {
    const { client, user } = moderate(makeGame(), { runStep: vi.fn().mockResolvedValue(makeGame({ phase: 'HAZARD_PHASE' })) });

    await user.click(await screen.findByRole('button', { name: 'Close action phase' }));

    await waitFor(() => expect(client.runStep).toHaveBeenCalledWith('game-1', 1, 'close-actions'));
    expect(await screen.findByRole('heading', { name: /HAZARDS: Predicted dice are reused/ })).toBeInTheDocument();
  });

  it('introduces the action cards, then runs a free practice prediction in Round 0', async () => {
    const game = makeGame({ phase: 'ROUND0_PREDICTION', current_round: 0 });
    const { client, user } = moderate(game, { predict: vi.fn().mockResolvedValue(makeGame({ phase: 'ROUND0_ADAPTATION', current_round: 0 })) });

    await user.click(await screen.findByRole('button', { name: 'Start Round 0 practice' }));
    expect(await screen.findByRole('heading', { name: /PRACTICE ACTION 1/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Apply practice action' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Hazard'), '1');
    await user.click(screen.getByRole('button', { name: 'Apply practice action' }));

    await waitFor(() => expect(client.predict).toHaveBeenCalledWith('game-1', { hazard_id: 1, payments: [] }));
  });

  it('lets the moderator skip Round 0 from the priorities step, after confirming', async () => {
    const roundOne = makeGame({ phase: 'RESOURCE_ALLOCATION', current_round: 1 });
    const { client, user } = moderate(withPriorities(), { skipRoundZero: vi.fn().mockResolvedValue(roundOne) });

    await user.click(await screen.findByRole('button', { name: 'Skip Round 0' }));
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Skip Round 0 and start Round 1 now?');
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(client.skipRoundZero).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Skip Round 0' }));
    await user.click(screen.getByRole('button', { name: 'Yes, skip Round 0' }));

    await waitFor(() => expect(client.skipRoundZero).toHaveBeenCalledWith('game-1'));
    expect(await screen.findByRole('heading', { name: /RESOURCE ALLOCATION/ })).toBeInTheDocument();
  });

  it('keeps Skip Round 0 disabled, like Start Round 0, until the priorities are saved', async () => {
    const { user } = moderate(withPriorities(false));

    await user.click(await screen.findByRole('button', { name: 'Continue to team priorities' }));

    expect(screen.getByRole('button', { name: 'Skip Round 0' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Start Round 0' })).toBeDisabled();
  });

  it('can still skip Round 0 from its introduction, before the first practice action', async () => {
    const roundOne = makeGame({ phase: 'RESOURCE_ALLOCATION', current_round: 1 });
    const { client, user } = moderate(makeGame({ phase: 'ROUND0_PREDICTION', current_round: 0 }), {
      skipRoundZero: vi.fn().mockResolvedValue(roundOne),
    });

    await user.click(await screen.findByRole('button', { name: 'Skip Round 0' }));
    await user.click(screen.getByRole('button', { name: 'Yes, skip Round 0' }));

    await waitFor(() => expect(client.skipRoundZero).toHaveBeenCalledWith('game-1'));
    expect(await screen.findByRole('heading', { name: /RESOURCE ALLOCATION/ })).toBeInTheDocument();
  });

  it('continues to the next round or finishes after asking for confirmation', async () => {
    const scores = [{ round: 1, team_id: 1, large_total: 20, small_total: 5, score: 25 }];
    const scored = makeGame({ phase: 'ROUND_COMPLETE', scores });
    const finished = makeGame({ phase: 'GAME_COMPLETE', scores, winners: [1] });
    const { client, user } = moderate(scored, { finishGame: vi.fn().mockResolvedValue(finished) });

    expect(await screen.findByRole('button', { name: 'CONTINUE TO ROUND 2' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'FINISH GAME' }));
    expect(client.finishGame).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('final scores will be the Round 1 scores');

    await user.click(screen.getByRole('button', { name: 'Yes, finish the game' }));

    await waitFor(() => expect(client.finishGame).toHaveBeenCalledWith('game-1'));
    expect(await screen.findByText('Winner')).toBeInTheDocument();
    expect(document.querySelector('.celebration')).toBeInTheDocument();
  });

  it('places priority markers on the board by picking a marker and then an element', async () => {
    const { user } = moderate(makeGame({ phase: 'PRIORITIES', current_round: null }));

    await user.click(await screen.findByRole('button', { name: 'Continue to team priorities' }));
    await user.click(screen.getByRole('button', { name: 'Local government large marker 2, not placed' }));

    expect(screen.getByRole('row', { name: /Beach tourism/ })).toHaveClass('is-blocked');
    await user.click(screen.getByRole('button', { name: 'Harbour' }));
    expect(screen.getByRole('button', { name: 'Local government large marker 2, on Harbour' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remove the Local government large marker from Harbour' }));
    expect(screen.getByRole('button', { name: 'Local government large marker 2, not placed' })).toBeInTheDocument();
  });

  it('locks the markers once the priorities are saved', async () => {
    const base = makeGame();
    const priorities = [
      { element_id: 1, size: 'large' as const },
      { element_id: 2, size: 'large' as const },
      { element_id: 3, size: 'small' as const },
      { element_id: 4, size: 'small' as const },
    ];
    moderate(
      makeGame({
        phase: 'PRIORITIES',
        current_round: null,
        elements: [...base.elements, { id: 4, name: 'Old town', status: 9, active: true }],
        teams: base.teams.map((team) => ({ ...team, priorities })),
      }),
    );

    expect(await screen.findByRole('button', { name: 'Local government large marker 1, on Beach tourism' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save priorities' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start Round 0' })).toBeEnabled();
  });

  it('reveals the Round 0 scores before continuing to Round 1', async () => {
    const scores = [{ round: 0, team_id: 1, large_total: 20, small_total: 5, score: 25 }];
    const { client, user } = moderate(makeGame({ phase: 'SCORING', current_round: 0 }), {
      runStep: vi.fn().mockResolvedValue(makeGame({ phase: 'ROUND_COMPLETE', current_round: 0, scores })),
    });

    await user.click(await screen.findByRole('button', { name: 'Reveal scores' }));

    await waitFor(() => expect(client.runStep).toHaveBeenCalledWith('game-1', 0, 'score'));
    expect(await screen.findByRole('columnheader', { name: 'Round 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue to Round 1' })).toBeInTheDocument();
  });

  it('offers only to finish after the last planned round', async () => {
    moderate(makeGame({ phase: 'ROUND_COMPLETE', current_round: 4 }));
    expect(await screen.findByRole('button', { name: 'FINISH GAME' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /CONTINUE TO ROUND/ })).not.toBeInTheDocument();
  });

  it('clears the choices on the current page with Undo, without saving anything or leaving the page', async () => {
    const { client, user } = moderate(makeGame());
    const undo = await screen.findByRole('button', { name: 'Undo: clear the choices on this page' });
    expect(undo).toBeDisabled();

    await user.click(screen.getByRole('button', { name: /Local Investment/ }));
    await user.selectOptions(screen.getByLabelText('Element'), '2');
    await user.type(screen.getByLabelText(/Tourism Industry pays money/), '3');
    await user.click(undo);

    expect(screen.getByRole('heading', { name: /ACTIONS: Teams negotiate/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Local Investment/ })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByLabelText('Element')).not.toBeInTheDocument();
    expect(screen.getByText('Choices on this page cleared')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo: clear the choices on this page' })).toBeDisabled();
    expect(client.invest).not.toHaveBeenCalled();
    expect(client.runStep).not.toHaveBeenCalled();
  });

  it('puts a setup step back the way it opened with Undo and stays on that step', async () => {
    const { client, user } = moderate(makeSetupGame({ elements: [], hazards: [] }));
    await user.click(await screen.findByRole('checkbox', { name: 'Beach tourism' }));
    await user.click(screen.getByRole('checkbox', { name: 'Housing' }));
    expect(screen.getByRole('checkbox', { name: 'Beach tourism' })).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Undo: clear the choices on this page' }));

    expect(screen.getByRole('heading', { name: /Choose destination elements/ })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Beach tourism' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Housing' })).not.toBeChecked();
    expect(client.setElements).not.toHaveBeenCalled();
  });

  it('goes Back through the setup steps', async () => {
    const elements = ['Beach tourism', 'Water supply', 'Housing', 'Nature'].map((name, index) => ({
      id: index + 1,
      name,
      status: 10,
      active: true,
    }));
    const { user } = moderate(makeSetupGame({ elements }));
    const back = await screen.findByRole('button', { name: 'Back to the previous screen' });
    expect(screen.getByRole('heading', { name: /Set vulnerabilities/ })).toBeInTheDocument();

    await user.click(back);
    expect(screen.getByRole('heading', { name: /Choose climate hazards/ })).toBeInTheDocument();
    await user.click(back);
    await user.click(back);
    expect(screen.getByRole('heading', { name: /Start a game/ })).toBeInTheDocument();
    expect(back).toBeDisabled();
  });

  it('goes Back from the first practice action to the introduction', async () => {
    const { user } = moderate(makeGame({ phase: 'ROUND0_PREDICTION', current_round: 0 }));

    await user.click(await screen.findByRole('button', { name: 'Start Round 0 practice' }));
    expect(await screen.findByRole('heading', { name: /PRACTICE ACTION 1/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Back to the previous screen' }));

    expect(screen.getByRole('heading', { name: 'How the shared action cards work' })).toBeInTheDocument();
  });

  it('shows the previous screen read-only on Back, then returns to the current one', async () => {
    const { user } = moderate(makeGame(), { runStep: vi.fn().mockResolvedValue(makeGame({ phase: 'HAZARD_PHASE' })) });
    await user.click(await screen.findByRole('button', { name: 'Close action phase' }));
    expect(await screen.findByRole('heading', { name: /HAZARDS: Predicted dice are reused/ })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Back to the previous screen' }));

    expect(screen.getByRole('heading', { name: /ACTIONS: Teams negotiate/ })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('inert');
    expect(screen.getByText(/shown as it was and cannot be changed/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Return to the current screen' }));

    expect(screen.getByRole('heading', { name: /HAZARDS: Predicted dice are reused/ })).toBeInTheDocument();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
  });
});

describe('BoardPage (participants)', () => {
  it('waits for the moderator while the game is still being set up', async () => {
    watch(makeSetupGame());
    expect(await screen.findByRole('heading', { name: 'The moderator is preparing the game' })).toBeInTheDocument();
  });

  it('shows the live board and resources but no controls and no upcoming events', async () => {
    watch(makeGame({ events: [risingTemperatures()] }));

    expect(await screen.findByRole('heading', { name: /ACTIONS: Teams negotiate/ })).toBeInTheDocument();
    expect(screen.getByText('Resource tokens')).toBeInTheDocument();
    expect(screen.queryByText('Rising temperatures')).not.toBeInTheDocument();
    expect(screen.queryByText('Event queue')).not.toBeInTheDocument();
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('reveals an event once it has been applied', async () => {
    const applied = risingTemperatures({
      status: 'applied',
      applied_changes: [{ kind: 'hazard_probability', hazard_id: 1, element_id: null, before: 4, after: 5 }],
    });
    watch(makeGame({ phase: 'SCORING', events: [applied] }));

    expect(await screen.findByText('Rising temperatures')).toBeInTheDocument();
    expect(screen.getByText('Extreme heat 4\u21925')).toBeInTheDocument();
  });

  it('celebrates the winner once the game is over', async () => {
    const scores = [{ round: 1, team_id: 1, large_total: 20, small_total: 5, score: 25 }];
    watch(makeGame({ phase: 'GAME_COMPLETE', scores, winners: [1] }));

    const badge = await screen.findByText('Winner');
    expect(badge.closest('tr')).toHaveClass('score-row--winner');
    expect(document.querySelector('.celebration')).toBeInTheDocument();
  });

  it('does not celebrate while the game is still being played', async () => {
    watch(makeGame());

    await screen.findByRole('heading', { name: /ACTIONS: Teams negotiate/ });
    expect(document.querySelector('.celebration')).not.toBeInTheDocument();
  });

  it('does not celebrate a finished game that has no winner', async () => {
    watch(makeGame({ phase: 'GAME_COMPLETE', winners: [] }));

    await screen.findByText('Final scores');
    expect(document.querySelector('.celebration')).not.toBeInTheDocument();
  });

  it('explains when the game cannot be found', async () => {
    const client = fakeClient({
      getGame: vi.fn().mockRejectedValue(new ApiError(404, 'Game not found.')),
      catalogue: vi.fn().mockResolvedValue(catalogue),
    });
    renderWithApp(<BoardPage />, { client, route: '/board/nope', path: '/board/:gameId' });

    expect(await screen.findByRole('heading', { name: 'Game not found' })).toBeInTheDocument();
  });
});

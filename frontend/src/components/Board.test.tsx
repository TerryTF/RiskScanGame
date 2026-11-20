import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HazardRoll } from '../api/types';
import { NO_CHANGES } from '../lib/derive';
import { makeGame } from '../test/fixtures';
import { Board } from './Board';

const roll = (overrides: Partial<HazardRoll>): HazardRoll => ({
  id: 1,
  round: 1,
  hazard_id: 1,
  die: 5,
  source: 'predicted',
  resolved: false,
  probability_at_roll: null,
  triggered: null,
  applied: false,
  damages: [],
  ...overrides,
});

describe('Board', () => {
  it('shows hazards with their probability and each active element with its status and vulnerabilities', () => {
    render(<Board game={makeGame()} />);

    expect(screen.getByRole('columnheader', { name: /Extreme heat/ })).toHaveTextContent('P 4/6');
    expect(screen.getByRole('columnheader', { name: /Long drought/ })).toHaveTextContent('P 2/6');
    const row = screen.getByRole('row', { name: /Water supply/ });
    const cells = within(row).getAllByRole('cell');
    expect(cells.slice(0, 3).map((cell) => cell.textContent)).toEqual(['1', '3', '8']);
  });

  it('colours each vulnerability by level and explains the scale', () => {
    render(<Board game={makeGame()} />);
    const [heat, drought] = within(screen.getByRole('row', { name: /Water supply/ })).getAllByRole('cell');

    expect(heat).toHaveClass('vuln--1');
    expect(drought).toHaveClass('vuln--3');
    expect(drought).toHaveAttribute('title', 'Water supply \u00d7 Long drought: High vulnerability');
    expect(within(screen.getByRole('list', { name: 'Vulnerability scale' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      '0No vulnerability',
      '1Low vulnerability',
      '2Moderate vulnerability',
      '3High vulnerability',
    ]);
  });

  it('leaves out elements that are no longer part of the active destination', () => {
    render(<Board game={makeGame()} />);
    expect(screen.queryByText('Harbour')).not.toBeInTheDocument();
  });

  it('shows each team\u2019s priority markers with their weight', () => {
    render(<Board game={makeGame()} />);
    const row = screen.getByRole('row', { name: /Water supply/ });

    expect(within(row).getByTitle('Tourism industry: large priority (\u00d72)')).toBeInTheDocument();
    expect(within(row).getByTitle('Local government: small priority (\u00d71)')).toBeInTheDocument();
  });

  it('can hide the priority column before priorities exist', () => {
    render(<Board game={makeGame()} showPriorities={false} />);
    expect(screen.queryByRole('columnheader', { name: 'Priority' })).not.toBeInTheDocument();
  });

  it('shows the die for this round and the predicted die for the next round in the hazard header', () => {
    const game = makeGame({
      hazard_rolls: [roll({ id: 1, round: 1, die: 5 }), roll({ id: 2, round: 2, die: 2 })],
    });
    render(<Board game={game} />);

    const header = screen.getByRole('columnheader', { name: /Extreme heat/ });
    expect(within(header).getByRole('img', { name: 'This round: 5' })).toBeInTheDocument();
    expect(within(header).getByRole('img', { name: 'Next round prediction: 2' })).toBeInTheDocument();
    expect(screen.getByText(/Dice in the hazard headers/)).toBeInTheDocument();
  });

  it('highlights what just changed', () => {
    const changes = { ...NO_CHANGES, statuses: new Set([1]), cells: new Set(['2:2']), probabilities: new Set([1]) };
    const { container } = render(<Board game={makeGame()} changes={changes} />);

    const changed = [...container.querySelectorAll('.is-changed')].map((node) => node.textContent);
    // Header first (probability), then rows top to bottom: the status of element 1, the vulnerability of element 2.
    expect(changed).toEqual(['P 4/6', '10', '3']);
  });

  it('marks an element that was just added, and the markers that changed', () => {
    const game = makeGame({
      elements: [...makeGame().elements, { id: 4, name: 'Shaded walking routes', status: 7, active: true }],
    });
    const changes = { ...NO_CHANGES, added: new Set([4]), markers: new Set([2]) };
    render(<Board game={game} changes={changes} />);

    expect(screen.getByRole('row', { name: /Shaded walking routes/ })).toHaveClass('is-new');
    expect(screen.getByRole('row', { name: /Water supply/ })).not.toHaveClass('is-new');
    const priority = (name: RegExp) => within(screen.getByRole('row', { name })).getAllByRole('cell').at(-1);
    expect(priority(/Water supply/)).toHaveClass('is-changed');
    expect(priority(/Beach tourism/)).not.toHaveClass('is-changed');
  });

  it('outlines the target of an action before it is applied', () => {
    const { container } = render(<Board game={makeGame()} preview={{ elementId: 2, hazardId: 2 }} />);

    expect(container.querySelector('.cell.is-target')).toHaveTextContent('3');
    expect(screen.getByRole('columnheader', { name: /Long drought/ })).toHaveClass('is-preview');
  });
});

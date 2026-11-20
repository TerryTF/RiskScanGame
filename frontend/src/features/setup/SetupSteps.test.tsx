import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HazardInput } from '../../api/types';
import { makeCatalogue, makeSetupGame } from '../../test/fixtures';
import { TextProvider } from '../../texts';
import { ElementsStep } from './ElementsStep';
import { EventsStep } from './EventsStep';
import { HazardsStep } from './HazardsStep';
import { StartStep } from './StartStep';
import { VulnerabilitiesStep } from './VulnerabilitiesStep';

const catalogue = makeCatalogue();

describe('StartStep', () => {
  function setup() {
    const onCreate = vi.fn();
    render(<StartStep catalogue={catalogue} busy={false} onCreate={onCreate} />);
    const user = userEvent.setup();
    return { onCreate, user, scope: screen.getByRole('combobox', { name: 'Geographic scope' }) };
  }

  it('lists the suggested scopes below the field, marks the default and says custom scopes are allowed', async () => {
    const { user, scope, onCreate } = setup();
    expect(screen.getByText(/Default: Region\. Choose a suggestion or type a custom scope\./)).toBeInTheDocument();

    await user.click(scope);
    expect(within(screen.getByRole('listbox')).getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Regiondefault',
      'City',
      'Island',
      'Coastline',
      'Mountain area',
      'National park',
    ]);
    expect(screen.getByText(/Not in the list\? Type your own scope/)).toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: 'Island' }));
    expect(scope).toHaveValue('Island');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Destination name'), 'Test bay');
    await user.click(screen.getByRole('button', { name: 'Save configuration' }));
    expect(onCreate).toHaveBeenCalledWith({ destination_name: 'Test bay', geographic_scope: 'Island', total_rounds: 4 });
  });

  it('accepts a scope that is not in the list', async () => {
    const { user, scope } = setup();
    await user.clear(scope);
    await user.type(scope, 'Lake district');

    expect(screen.getByRole('option', { name: /Use .Lake district. custom/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(scope).toHaveValue('Lake district');
  });
});

describe('ElementsStep', () => {
  function setup(saved: string[] = []) {
    const onSave = vi.fn();
    render(<ElementsStep catalogue={catalogue} saved={saved} busy={false} onBack={vi.fn()} onSave={onSave} />);
    return { onSave, user: userEvent.setup(), save: screen.getByRole('button', { name: 'Save elements' }) };
  }

  it('needs at least four elements and saves them in catalogue order', async () => {
    const { user, save, onSave } = setup();
    expect(save).toBeDisabled();

    for (const name of ['Housing', 'Water supply', 'Tourism businesses']) {
      await user.click(screen.getByRole('checkbox', { name }));
    }
    expect(save).toBeDisabled();
    expect(screen.getByText(/3 of 12 selected/)).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Beach tourism' }));
    await user.click(save);

    expect(onSave).toHaveBeenCalledWith(['Beach tourism', 'Tourism businesses', 'Water supply', 'Housing']);
  });

  it('shows and saves catalogue elements under the names edited in editor mode', async () => {
    const edits: Record<string, string> = { 'card.element.beach_tourism': 'Beaches', 'card.element_group.tourism_activities': 'Activities' };
    const onSave = vi.fn();
    render(
      <TextProvider source={{ lookup: (key) => edits[key] }}>
        <ElementsStep catalogue={catalogue} saved={['Beaches']} busy={false} onBack={vi.fn()} onSave={onSave} />
      </TextProvider>,
    );
    const user = userEvent.setup();

    expect(screen.getByRole('checkbox', { name: 'Beaches' })).toBeChecked();
    expect(screen.getByText('Activities')).toBeInTheDocument();
    for (const name of ['Housing', 'Water supply', 'Tourism businesses']) {
      await user.click(screen.getByRole('checkbox', { name }));
    }
    await user.click(screen.getByRole('button', { name: 'Save elements' }));

    expect(onSave).toHaveBeenCalledWith(['Beaches', 'Tourism businesses', 'Water supply', 'Housing']);
  });

  it('stops selecting at the maximum', async () => {
    const { user } = setup();
    const names = catalogue.element_groups.flatMap((group) => group.elements);
    for (const name of names.slice(0, 12)) await user.click(screen.getByRole('checkbox', { name }));

    expect(screen.getByText(/12 of 12 selected/)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: names[12] ?? '' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Add custom element' })).toBeDisabled();
  });

  it('adds custom elements after the catalogue ones and refuses duplicates', async () => {
    const { user, onSave } = setup(['Housing', 'Water supply', 'Beach tourism']);

    await user.click(screen.getByRole('button', { name: '+ Add custom element' }));
    await user.type(screen.getByLabelText('Custom element name'), 'Harbour');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(screen.getByRole('checkbox', { name: 'Harbour' })).toBeChecked();

    // The form stays open so several custom elements can be added in a row.
    await user.type(screen.getByLabelText('Custom element name'), 'beach TOURISM');
    await user.click(screen.getByRole('button', { name: 'Add' }));
    expect(screen.getByRole('alert')).toHaveTextContent('already selected');

    await user.click(screen.getByRole('button', { name: 'Save elements' }));
    expect(onSave).toHaveBeenCalledWith(['Beach tourism', 'Water supply', 'Housing', 'Harbour']);
  });
});

describe('HazardsStep', () => {
  function setup(saved: HazardInput[] = []) {
    const onSave = vi.fn();
    render(<HazardsStep catalogue={catalogue} saved={saved} busy={false} onBack={vi.fn()} onSave={onSave} />);
    return { onSave, user: userEvent.setup(), save: screen.getByRole('button', { name: 'Save hazards' }) };
  }

  it('needs four or five hazards and uses probability 3 by default', async () => {
    const { user, save, onSave } = setup();
    for (const name of ['Wildfire', 'Extreme heat', 'Long drought']) {
      await user.click(screen.getByRole('checkbox', { name }));
    }
    expect(save).toBeDisabled();

    await user.click(screen.getByRole('checkbox', { name: 'Heat stress' }));
    await user.selectOptions(screen.getByLabelText('Probability for Extreme heat'), '5');
    await user.click(save);

    expect(onSave).toHaveBeenCalledWith([
      { name: 'Extreme heat', probability: 5 },
      { name: 'Heat stress', probability: 3 },
      { name: 'Long drought', probability: 3 },
      { name: 'Wildfire', probability: 3 },
    ]);
  });

  it('locks the other hazards once five are chosen', async () => {
    const { user } = setup([
      { name: 'Extreme heat', probability: 4 },
      { name: 'Heat stress', probability: 3 },
      { name: 'Long drought', probability: 2 },
      { name: 'Wildfire', probability: 2 },
    ]);

    await user.click(screen.getByRole('checkbox', { name: 'Cold' }));

    expect(screen.getByText(/5 of 5 selected/)).toHaveTextContent('Deselect one to activate a custom hazard');
    expect(screen.getByRole('checkbox', { name: 'Short drought' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '+ Add custom hazard' })).toBeDisabled();
  });
});

describe('VulnerabilitiesStep', () => {
  const game = makeSetupGame({ hazards: makeSetupGame().hazards.slice(0, 2) });

  function setup() {
    const onSave = vi.fn();
    render(<VulnerabilitiesStep game={game} min={0} max={3} busy={false} onBack={vi.fn()} onSave={onSave} />);
    return { onSave, user: userEvent.setup(), save: screen.getByRole('button', { name: 'Save vulnerabilities' }) };
  }

  it('only accepts values from 0 to 3', async () => {
    const { user } = setup();
    const cell = screen.getByLabelText('Tourism businesses \u00d7 Extreme heat');
    expect(screen.getByText(/0 of 4 cells set/)).toBeInTheDocument();

    await user.type(cell, '9');
    expect(cell).toHaveValue('');
    await user.type(cell, '2');
    expect(cell).toHaveValue('2');
    expect(screen.getByText(/1 of 4 cells set/)).toBeInTheDocument();
  });

  it('saves empty cells as 0 once the moderator confirms', async () => {
    const { user, save, onSave } = setup();
    await user.type(screen.getByLabelText('Tourism businesses \u00d7 Extreme heat'), '2');
    expect(screen.getByText('3 cells still empty; they will be saved as 0.')).toBeInTheDocument();

    await user.click(save);
    const dialog = screen.getByRole('dialog', { name: 'Some cells are not set' });
    expect(dialog).toHaveTextContent('3 cells have no value. They will be saved as 0 (no vulnerability).');
    await user.click(within(dialog).getByRole('button', { name: 'Go back and fill them' }));
    expect(onSave).not.toHaveBeenCalled();

    await user.click(save);
    await user.click(screen.getByRole('button', { name: 'Save with 0' }));
    expect(onSave).toHaveBeenCalledWith([
      { element_id: 1, hazard_id: 11, value: 2 },
      { element_id: 1, hazard_id: 12, value: 0 },
      { element_id: 2, hazard_id: 11, value: 0 },
      { element_id: 2, hazard_id: 12, value: 0 },
    ]);
  });

  it('fills the remaining cells with one value and saves the whole matrix', async () => {
    const { user, save, onSave } = setup();
    await user.type(screen.getByLabelText('Tourism businesses \u00d7 Extreme heat'), '3');

    await user.selectOptions(screen.getByLabelText('Fill empty cells with'), '1');
    await user.click(screen.getByRole('button', { name: 'Fill' }));
    await user.click(save);

    expect(onSave).toHaveBeenCalledWith([
      { element_id: 1, hazard_id: 11, value: 3 },
      { element_id: 1, hazard_id: 12, value: 1 },
      { element_id: 2, hazard_id: 11, value: 1 },
      { element_id: 2, hazard_id: 12, value: 1 },
    ]);
  });
});

describe('EventsStep', () => {
  const game = makeSetupGame();

  function setup() {
    const onFinish = vi.fn();
    render(<EventsStep game={game} catalogue={catalogue} busy={false} onBack={vi.fn()} onFinish={onFinish} />);
    return { onFinish, user: userEvent.setup(), finish: screen.getByRole('button', { name: 'Finish setup' }) };
  }

  it('starts with the suggested events and the mandatory transition pressure', async () => {
    const { user, finish, onFinish } = setup();

    expect(screen.getByRole('heading', { name: 'Rising temperatures' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Longer dry seasons' })).toBeInTheDocument();
    expect(screen.getByText('Tourism businesses \u22122 if action not completed')).toBeInTheDocument();
    expect(screen.getAllByRole('checkbox', { name: 'Enabled', checked: true })).toHaveLength(3);

    await user.click(finish);
    expect(onFinish).toHaveBeenCalledTimes(1);
    const events = onFinish.mock.calls[0]?.[0] as { round: number; type: string }[];
    expect(events.map((e) => `${e.round}:${e.type}`)).toEqual(['1:standard', '2:standard', '3:transition_pressure']);
  });

  it('allows at most two events in a round', async () => {
    const { user } = setup();
    const addToRoundOne = screen.getByLabelText('Add an event to Round 1');

    await user.selectOptions(addToRoundOne, 'pressure_on_water_supplies');

    expect(addToRoundOne).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Maximum events reached' })).toBeInTheDocument();
  });

  it('blocks finishing until a custom event has a name', async () => {
    const { user, finish, onFinish } = setup();

    await user.selectOptions(screen.getByLabelText('Add an event to Round 4'), '__custom');
    expect(finish).toBeDisabled();
    expect(screen.getByText('Give the event in Round 4 a name.')).toBeInTheDocument();

    await user.type(screen.getByLabelText('Event name'), 'Storm season');
    expect(finish).toBeEnabled();
    await user.click(finish);

    const events = onFinish.mock.calls[0]?.[0] as { name: string; round: number }[];
    expect(events.at(-1)).toMatchObject({ name: 'Storm season', round: 4 });
  });

  it('lets the moderator disable an event but not the mandatory one', async () => {
    const { user, onFinish, finish } = setup();
    const toggles = screen.getAllByRole('checkbox', { name: 'Enabled' });
    expect(toggles[2]).toBeDisabled();

    await user.click(toggles[0] as HTMLElement);
    await user.click(finish);

    const events = onFinish.mock.calls[0]?.[0] as { name: string }[];
    expect(events.map((e) => e.name)).toEqual(['Longer dry seasons', 'Transition pressure']);
  });
});

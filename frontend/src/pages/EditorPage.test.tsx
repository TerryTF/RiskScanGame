import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeCatalogue } from '../test/fixtures';
import { fakeClient, renderWithApp } from '../test/render';
import { EditorPage } from './EditorPage';

function openEditor(saved: Record<string, string> = {}, undoAvailable = false, previous: Record<string, string> = {}) {
  const client = fakeClient({
    catalogue: vi.fn().mockResolvedValue(makeCatalogue()),
    getTexts: vi.fn().mockResolvedValue({ texts: saved, undo_available: undoAvailable }),
    undoTexts: vi.fn().mockResolvedValue({ texts: previous, undo_available: false }),
    sampleGame: vi.fn().mockResolvedValue({ states: [] }),
    saveTexts: vi.fn().mockImplementation((texts: Record<string, string | null>) => Promise.resolve({ texts })),
  });
  return renderWithApp(<EditorPage />, { client });
}

const preview = () => document.querySelector('.editor-preview') as HTMLElement;

describe('EditorPage', () => {
  it('previews an edit straight away and saves only the changes', async () => {
    const user = userEvent.setup();
    const { client } = openEditor({ 'start.subtitle': 'Saved before' });

    const field = await screen.findByLabelText('start.title');
    await waitFor(() => expect(preview()).toHaveTextContent('Saved before'));
    await user.clear(field);
    await user.type(field, 'Hello editors');

    await waitFor(() => expect(preview().querySelector('h1')).toHaveTextContent('Hello editors'));
    expect(screen.getByText('1 unsaved change')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(client.saveTexts).toHaveBeenCalledWith({ 'start.title': 'Hello editors' });
    expect(await screen.findByText('All changes saved')).toBeInTheDocument();
  });

  it('restoring the default of a saved text saves a reset', async () => {
    const user = userEvent.setup();
    const { client } = openEditor({ 'start.title': 'Old title' });

    await user.click(await screen.findByRole('button', { name: 'Restore default' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(client.saveTexts).toHaveBeenCalledWith({ 'start.title': null });
  });

  it('undoes the last save once, after asking', async () => {
    const user = userEvent.setup();
    const { client } = openEditor({ 'start.title': 'Newest title' }, true, { 'start.title': 'Older title' });
    await waitFor(() => expect(preview().querySelector('h1')).toHaveTextContent('Newest title'));

    await user.click(screen.getByRole('button', { name: /Undo last save/ }));
    const confirm = screen.getByRole('alertdialog', { name: 'Undo the last save' });
    expect(confirm).toHaveTextContent('This works only once');
    await user.click(within(confirm).getByRole('button', { name: 'Undo last save' }));

    expect(client.undoTexts).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(preview().querySelector('h1')).toHaveTextContent('Older title'));
    expect(screen.getByText('Last save undone')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Undo last save/ })).toBeDisabled();
  });

  it('cannot undo when there is no earlier save', async () => {
    openEditor();
    expect(await screen.findByRole('button', { name: /Undo last save/ })).toBeDisabled();
  });

  it('asks before quitting with unsaved changes', async () => {
    const user = userEvent.setup();
    openEditor();

    await user.type(await screen.findByLabelText('start.title'), '!');
    await user.click(screen.getByRole('button', { name: 'Quit' }));

    expect(screen.getByRole('alertdialog', { name: 'Unsaved changes' })).toHaveTextContent('1 unsaved change');
    await user.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('moves between the pages of the game', async () => {
    const user = userEvent.setup();
    openEditor();
    await screen.findByLabelText('start.title');
    await act(async () => {
      await user.click(screen.getByRole('button', { name: 'Next ›' }));
    });
    expect(screen.getByRole('combobox', { name: 'Page' })).toHaveValue('setup-start');
  });
});

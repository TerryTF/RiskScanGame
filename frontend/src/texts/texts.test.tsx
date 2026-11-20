import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StartPage } from '../pages/StartPage';
import { fakeClient, renderWithApp } from '../test/render';
import { T, TextProvider, TEXT_MODULES } from '.';
import { SavedTextsProvider } from './SavedTexts';

describe('text keys', () => {
  it('are unique across modules and accepted by the API', () => {
    const keys = Object.values(TEXT_MODULES).flatMap((module) => Object.keys(module));
    expect(keys.length).toBe(new Set(keys).size);
    for (const key of keys) expect(key).toMatch(/^[A-Za-z0-9_.-]{1,160}$/);
  });
});

describe('T', () => {
  it('uses the edited wording and fills placeholders, keeping unknown ones visible', () => {
    const source = { lookup: (key: string) => (key === 'round.scores.kicker' ? 'Score {round} {oops}' : undefined) };
    render(
      <TextProvider source={source}>
        <T k="round.scores.kicker" vars={{ round: 2 }} />|<T k="round.scores.finish" />
      </TextProvider>,
    );
    expect(document.body.textContent).toBe('Score 2 {oops}|FINISH GAME');
  });

  it('marks texts for picking in editor mode', () => {
    render(
      <TextProvider source={{ lookup: () => undefined, editing: true }}>
        <T k="round.scores.finish" />
      </TextProvider>,
    );
    expect(screen.getByText('FINISH GAME')).toHaveAttribute('data-text-key', 'round.scores.finish');
  });
});

describe('SavedTextsProvider', () => {
  it('shows the wording saved in editor mode', async () => {
    const client = fakeClient({ getTexts: vi.fn().mockResolvedValue({ texts: { 'start.title': 'Hello teams' } }) });
    renderWithApp(
      <SavedTextsProvider>
        <StartPage />
      </SavedTextsProvider>,
      { client },
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Hello teams' })).toBeInTheDocument();
  });

  it('falls back to the default wording when the texts cannot be loaded', async () => {
    const client = fakeClient({ getTexts: vi.fn().mockRejectedValue(new Error('down')) });
    renderWithApp(
      <SavedTextsProvider>
        <StartPage />
      </SavedTextsProvider>,
      { client },
    );
    expect(await screen.findByRole('heading', { level: 1, name: 'Welcome to RiskScan' }, { timeout: 4000 })).toBeInTheDocument();
  });
});

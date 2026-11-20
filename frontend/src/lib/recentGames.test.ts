import { describe, expect, it } from 'vitest';
import { readRecentGames, rememberGame } from './recentGames';

describe('recent games', () => {
  it('keeps only the 5 most recently opened games, newest first', () => {
    for (let index = 1; index <= 7; index += 1) rememberGame({ id: `game-${index}`, destination_name: `Game ${index}` });

    const recent = readRecentGames();
    expect(recent.map((game) => game.id)).toEqual(['game-7', 'game-6', 'game-5', 'game-4', 'game-3']);
  });

  it('shows at most 5 even when more were saved under an earlier limit', () => {
    const saved = Array.from({ length: 10 }, (_, index) => ({ id: `old-${index}`, name: `Old ${index}`, savedAt: index }));
    localStorage.setItem('riskscan.recentGames', JSON.stringify(saved));

    expect(readRecentGames().map((game) => game.id)).toEqual(['old-0', 'old-1', 'old-2', 'old-3', 'old-4']);
  });
});

import { useState } from 'react';
import type { GameState } from '../api/types';

// Enough for a whole game: setup, teams, Round 0 and five rounds of six screens.
const MAX_SCREENS = 60;

interface History {
  current?: GameState;
  earlier: GameState[];
}

const screenOf = (game: GameState) => `${game.phase}:${game.current_round ?? ''}`;

/**
 * The game as it looked on each earlier screen, oldest first, so Back can show those screens again.
 * Kept in state rather than an effect, like useChanges, so it is up to date on the render that shows the new game.
 */
export function useScreenHistory(game: GameState | undefined): GameState[] {
  const [history, setHistory] = useState<History>({ current: game, earlier: [] });
  if (game !== history.current) setHistory(advance(history, game));
  return history.earlier;
}

function advance({ current, earlier }: History, game: GameState | undefined): History {
  if (!game || !current || screenOf(game) === screenOf(current)) return { current: game, earlier };
  return { current: game, earlier: [...earlier, current].slice(-MAX_SCREENS) };
}

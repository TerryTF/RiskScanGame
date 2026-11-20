import { useMemo, useState } from 'react';
import type { GameState } from '../api/types';
import { NO_CHANGES, diffStates, type Changes } from './derive';

/**
 * What changed between the previous and the current snapshot of a game, so the board can highlight it.
 * The previous snapshot is kept in state (not an effect) so a highlight is visible on the very render that
 * shows the new data, and stays until the next change arrives.
 */
export function useChanges(game: GameState | undefined): Changes {
  const [snapshot, setSnapshot] = useState<{ previous?: GameState; current?: GameState }>({ current: game });
  if (game !== snapshot.current) setSnapshot({ previous: snapshot.current, current: game });
  const { previous, current } = snapshot;
  return useMemo(() => (previous && current ? diffStates(previous, current) : NO_CHANGES), [previous, current]);
}

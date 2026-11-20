import { ApiError, createClient, type RiskScanClient } from '../../api/client';
import type { Catalogue, GameState, SavedTexts } from '../../api/types';

export const PREVIEW_ONLY = 'Editor preview: the sample game cannot be changed here.';

/**
 * The API seen by the screens inside the editor preview. Reads return the sample game; every change is refused, so
 * nothing in the preview can create games, change state or touch this browser's list of recent games.
 */
export function previewClient(catalogue: Catalogue, game: GameState | null, texts: SavedTexts): RiskScanClient {
  const refuse = () => Promise.reject(new ApiError(0, PREVIEW_ONLY));
  const refused = Object.fromEntries(Object.keys(createClient()).map((name) => [name, refuse])) as unknown as RiskScanClient;
  return {
    ...refused,
    catalogue: () => Promise.resolve(catalogue),
    getGame: () => (game ? Promise.resolve(game) : Promise.reject(new ApiError(404, 'Not found'))),
    getTexts: () => Promise.resolve(texts),
  };
}

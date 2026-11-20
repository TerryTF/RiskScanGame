const STORAGE_KEY = 'riskscan.recentGames';
const MAX_RECENT = 5;

export interface RecentGame {
  id: string;
  name: string;
  savedAt: number;
}

/** Games this browser created or opened, so a moderator can find them again. Never throws. */
export function readRecentGames(): RecentGame[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    // Lists saved under an earlier, higher limit are cut down here too.
    return parsed
      .filter(
        (item): item is RecentGame =>
          typeof item?.id === 'string' && typeof item?.name === 'string' && typeof item?.savedAt === 'number',
      )
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

export function rememberGame(game: { id: string; destination_name: string }): void {
  const others = readRecentGames().filter((recent) => recent.id !== game.id);
  const next = [{ id: game.id, name: game.destination_name, savedAt: Date.now() }, ...others].slice(0, MAX_RECENT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage can be unavailable (private mode, quota); remembering games is only a convenience.
  }
}

export function forgetGame(id: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(readRecentGames().filter((recent) => recent.id !== id)));
  } catch {
    // See rememberGame.
  }
}

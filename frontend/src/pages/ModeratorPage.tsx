import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { useCatalogue, useGame, useGameCommands, type GameCommands } from '../api/queries';
import type { GameState } from '../api/types';
import { FullPageMessage } from '../components/GameLayout';
import {
  IGNORED_CONTROLS,
  ModeratorBarContext,
  ScreenControlsContext,
  type Handler,
  type ModeratorBarState,
} from '../components/ModeratorBar';
import { ModeratorConsole } from '../features/round/ModeratorConsole';
import { SetupWizard } from '../features/setup/SetupWizard';
import { rememberGame } from '../lib/recentGames';
import { useScreenHistory } from '../lib/useScreenHistory';
import { T } from '../texts';

const CLEARED_MESSAGE_MS = 4000;

/** The moderator's page for one game: the setup wizard until setup is complete, then the play console. */
export function ModeratorPage() {
  const { gameId = '' } = useParams();
  const game = useGame(gameId);
  const catalogue = useCatalogue();
  const commands = useGameCommands(gameId);
  const earlier = useScreenHistory(game.data);
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const [localBack, setLocalBack] = useState<Handler>(null);
  const [clearPage, setClearPage] = useState<Handler>(null);
  const [cleared, setCleared] = useState(false);
  const registerBack = useCallback((handler: Handler) => setLocalBack(() => handler), []);
  const registerUndo = useCallback((handler: Handler) => setClearPage(() => handler), []);
  const controls = useMemo(() => ({ registerBack, registerUndo }), [registerBack, registerUndo]);

  const knownId = game.data?.id;
  const knownName = game.data?.destination_name;
  useEffect(() => {
    if (knownId && knownName) rememberGame({ id: knownId, destination_name: knownName });
  }, [knownId, knownName]);

  useEffect(() => {
    if (!cleared) return;
    const timer = window.setTimeout(() => setCleared(false), CLEARED_MESSAGE_MS);
    return () => window.clearTimeout(timer);
  }, [cleared]);

  if (game.isError) {
    const missing = (game.error as { status?: number }).status === 404;
    return (
      <FullPageMessage title={<T k={missing ? 'page.not_found.title' : 'page.moderator.load_error'} />}>
        <p>{missing ? <T k="page.not_found.text" vars={{ id: gameId }} /> : game.error.message}</p>
        <p>
          <Link to="/">
            <T k="page.back_home" />
          </Link>
        </p>
      </FullPageMessage>
    );
  }
  if (catalogue.isError) {
    return (
      <FullPageMessage title={<T k="page.moderator.catalogue_error" />}>
        <p>{catalogue.error.message}</p>
        <button type="button" className="btn btn--primary" onClick={() => catalogue.refetch()}>
          <T k="page.moderator.retry" />
        </button>
      </FullPageMessage>
    );
  }
  if (!game.data || !catalogue.data) return <FullPageMessage title={<T k="page.moderator.loading" />} />;

  const current = game.data;
  const cards = catalogue.data;
  const reviewed = reviewIndex !== null ? earlier[reviewIndex] : undefined;

  const liveBar: ModeratorBarState = {
    onBack: localBack ?? (earlier.length > 0 ? () => setReviewIndex(earlier.length - 1) : null),
    onUndo: clearPage
      ? () => {
          clearPage();
          setCleared(true);
        }
      : null,
    status: cleared ? <T k="page.moderator.undo_done" /> : null,
    busy: commands.pending,
    onReturn: null,
  };
  const reviewBar: ModeratorBarState = {
    onBack: reviewIndex ? () => setReviewIndex(reviewIndex - 1) : null,
    onUndo: null,
    status: null,
    busy: false,
    onReturn: () => setReviewIndex(null),
  };

  const screen = (state: GameState, screenCommands: GameCommands) =>
    state.phase === 'SETUP' ? (
      <SetupWizard key={state.id} game={state} catalogue={cards} commands={screenCommands} />
    ) : (
      <ModeratorConsole game={state} catalogue={cards} commands={screenCommands} />
    );

  // The current screen stays mounted while an earlier one is reviewed, so half-filled forms survive the visit.
  return (
    <ScreenControlsContext value={controls}>
      <ModeratorBarContext value={liveBar}>
        <div hidden={reviewed !== undefined}>{screen(current, commands)}</div>
      </ModeratorBarContext>
      {reviewed && (
        <ScreenControlsContext value={IGNORED_CONTROLS}>
          <ModeratorBarContext value={reviewBar}>
            {screen(reviewed, { ...commands, error: null, pending: false })}
          </ModeratorBarContext>
        </ScreenControlsContext>
      )}
    </ScreenControlsContext>
  );
}

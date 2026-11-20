import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { gameKey, useCatalogue } from '../api/queries';
import { useApi } from '../api/provider';
import { Notice } from '../components/GameLayout';
import { SetupFrame } from '../features/setup/SetupFrame';
import { StartStep } from '../features/setup/StartStep';
import { forgetGame, readRecentGames, rememberGame } from '../lib/recentGames';
import { T, useT } from '../texts';

/** Step 1 of moderator setup, plus a way back into games this browser already knows about. */
export function HomePage() {
  const t = useT();
  const api = useApi();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const catalogue = useCatalogue();
  const [recent, setRecent] = useState(readRecentGames);
  const [openId, setOpenId] = useState('');

  const create = useMutation({
    mutationFn: api.createGame,
    onSuccess: (state) => {
      queryClient.setQueryData(gameKey(state.id), state);
      rememberGame(state);
      navigate(`/games/${state.id}`);
    },
  });

  return (
    <SetupFrame
      step={1}
      title={<T k="setup.start.title" />}
      subtitle={<T k="setup.start.subtitle" />}
      error={create.error?.message}
    >
      {catalogue.isPending && <p className="muted">
          <T k="home.loading" />
        </p>}
      {catalogue.isError && (
        <Notice tone="error">
          {catalogue.error.message}{' '}
          <button type="button" className="btn btn--tiny" onClick={() => catalogue.refetch()}>
            <T k="home.retry" />
          </button>
        </Notice>
      )}
      {catalogue.data && (
        <StartStep catalogue={catalogue.data} busy={create.isPending} onCreate={(request) => create.mutate(request)} />
      )}

      <section className="setup-card resume" aria-labelledby="resume-title">
        <h2 id="resume-title" className="kicker">
          <T k="home.resume.title" />
        </h2>
        {recent.length > 0 && (
          <ul className="recent">
            {recent.map((game) => (
              <li key={game.id}>
                <strong>{game.name}</strong>
                <span className="recent__links">
                  <Link to={`/games/${game.id}`}>
                    <T k="home.resume.moderate" />
                  </Link>
                  <Link to={`/board/${game.id}`}>
                    <T k="home.resume.board" />
                  </Link>
                  <button
                    type="button"
                    className="btn btn--tiny"
                    onClick={() => {
                      forgetGame(game.id);
                      setRecent(readRecentGames());
                    }}
                    aria-label={t('home.resume.forget_label', { name: game.name })}
                  >
                    <T k="home.resume.forget" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <form
          className="inline-add"
          onSubmit={(event) => {
            event.preventDefault();
            if (openId.trim()) navigate(`/games/${openId.trim()}`);
          }}
        >
          <label>
            <span className="sr-only">
              <T k="home.resume.game_id_label" />
            </span>
            <input value={openId} placeholder={t('home.resume.game_id_placeholder')} onChange={(event) => setOpenId(event.target.value)} />
          </label>
          <button type="submit" className="btn btn--soft btn--small" disabled={!openId.trim()}>
            <T k="home.resume.open_moderator" />
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--small"
            disabled={!openId.trim()}
            onClick={() => navigate(`/board/${openId.trim()}`)}
          >
            <T k="home.resume.open_board" />
          </button>
        </form>
      </section>
    </SetupFrame>
  );
}

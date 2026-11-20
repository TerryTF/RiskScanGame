import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { GameLayout } from '../components/GameLayout';
import { readRecentGames } from '../lib/recentGames';
import { T, useT } from '../texts';

/** The first page: moderators run games, players follow a board, editors reword the game's texts. */
export function StartPage() {
  const navigate = useNavigate();
  const t = useT();
  const [gameId, setGameId] = useState('');
  const [recent] = useState(readRecentGames);
  const id = gameId.trim();

  return (
    <GameLayout
      crumb={<T k="start.crumb" />}
      pill={<T k="start.pill" />}
      title={<T k="start.title" />}
      subtitle={<T k="start.subtitle" />}
      info={<T k="start.info" />}
    >
      <div className="mode-grid">
        <section className="mode-card" aria-labelledby="mode-moderator">
          <h2 id="mode-moderator" className="mode-card__title">
            <T k="start.moderator.title" />
          </h2>
          <p className="muted">
            <T k="start.moderator.text" />
          </p>
          <Link to="/moderator" className="btn btn--primary">
            <T k="start.moderator.button" />
          </Link>
        </section>

        <section className="mode-card" aria-labelledby="mode-player">
          <h2 id="mode-player" className="mode-card__title">
            <T k="start.player.title" />
          </h2>
          <p className="muted">
            <T k="start.player.text" />
          </p>
          <form
            className="mode-card__form"
            onSubmit={(event) => {
              event.preventDefault();
              if (id) navigate(`/board/${encodeURIComponent(id)}`);
            }}
          >
            <label>
              <span className="sr-only">
                <T k="start.player.game_id" />
              </span>
              <input value={gameId} placeholder={t('start.player.game_id')} onChange={(e) => setGameId(e.target.value)} />
            </label>
            <button type="submit" className="btn btn--primary" disabled={!id}>
              <T k="start.player.button" />
            </button>
          </form>
          {recent.length > 0 && (
            <>
              <p className="kicker">
                <T k="start.player.recent" />
              </p>
              <ul className="plain-list">
                {recent.map((game) => (
                  <li key={game.id}>
                    <Link to={`/board/${game.id}`}>{game.name}</Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="mode-card mode-card--editor" aria-labelledby="mode-editor">
          <h2 id="mode-editor" className="mode-card__title">
            <span aria-hidden="true">✎ </span>
            <T k="start.editor.title" />
          </h2>
          <p className="muted">
            <T k="start.editor.text" />
          </p>
          <Link to="/editor" className="btn btn--soft">
            <T k="start.editor.button" />
          </Link>
        </section>
      </div>
    </GameLayout>
  );
}

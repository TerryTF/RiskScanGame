import { Link, useParams } from 'react-router';
import type { Catalogue, GameState, Phase } from '../api/types';
import { useCatalogue, useGame } from '../api/queries';
import { ActionCardView } from '../components/ActionCardView';
import { Board } from '../components/Board';
import { EventCardView, ScoreTable } from '../components/Cards';
import { BoardLayout, FullPageMessage, GameLayout, Notice, Panel } from '../components/GameLayout';
import { FinalSide, HazardOutcomePanel, TokensPanel } from '../features/round/StepScreens';
import { TeamSummaryPanel, allowanceText } from '../features/round/TeamsStage';
import { stepCopy } from '../lib/copy';
import { visibleEvents } from '../lib/derive';
import { roleKey } from '../lib/format';
import { TEAM_ICON } from '../assets/icons';
import { useChanges } from '../lib/useChanges';
import { CardText, T, cardKeys, interestsText, useT } from '../texts';

const POLL_MS = 2500;

const REGULAR_ORDER: Phase[] = ['RESOURCE_ALLOCATION', 'ACTION_PHASE', 'HAZARD_PHASE', 'EVENT_PHASE', 'SCORING', 'ROUND_COMPLETE'];

/** True once the current regular round has reached `phase` (the game being over counts as reached). */
function reached(game: GameState, phase: Phase): boolean {
  if (game.phase === 'GAME_COMPLETE') return true;
  return REGULAR_ORDER.indexOf(game.phase) >= REGULAR_ORDER.indexOf(phase);
}

const PRACTICE_CARD: Partial<Record<Phase, string>> = {
  ROUND0_PREDICTION: 'hazard_prediction',
  ROUND0_ADAPTATION: 'risk_adaptation',
  ROUND0_INVESTMENT: 'local_investment',
};

/** The shared, read-only board. It follows the game by polling, shows nothing until setup is done, and hides future events. */
export function BoardPage() {
  const { gameId = '' } = useParams();
  const game = useGame(gameId, POLL_MS);
  const catalogue = useCatalogue();

  if (game.isError && !game.data) {
    const missing = (game.error as { status?: number }).status === 404;
    return (
      <FullPageMessage title={<T k={missing ? 'page.not_found.title' : 'page.board.load_error'} />}>
        <p>{missing ? <T k="page.not_found.text" vars={{ id: gameId }} /> : game.error.message}</p>
        <p>
          <Link to="/">
            <T k="page.back_home" />
          </Link>
        </p>
      </FullPageMessage>
    );
  }
  if (!game.data || !catalogue.data) return <FullPageMessage title={<T k="page.board.loading" />} />;
  if (game.data.phase === 'SETUP') {
    return (
      <FullPageMessage title={<T k="page.board.preparing_title" />}>
        <p>
          <T k="page.board.preparing_text" />
        </p>
      </FullPageMessage>
    );
  }
  return <ParticipantBoard game={game.data} catalogue={catalogue.data} offline={game.isError} />;
}

/** The participants' view of a game in play. Editor mode also uses it to preview the board with a sample game. */
export function ParticipantBoard({ game, catalogue, offline }: { game: GameState; catalogue: Catalogue; offline: boolean }) {
  const changes = useChanges(game);
  const t = useT();
  const copy = stepCopy(game, t);
  return (
    <GameLayout
      crumb={<T k="board.crumb.live" vars={{ destination: game.destination_name.toUpperCase() }} />}
      pill={<T {...copy.pill} />}
      title={<T {...copy.title} />}
      subtitle={<T {...copy.subtitle} />}
      info={<T k="board.info.live" vars={{ destination: game.destination_name, scope: game.geographic_scope }} />}
    >
      {offline && (
        <Notice tone="warning">
          <T k="board.participant.offline" />
        </Notice>
      )}
      <BoardLayout
        board={<Board game={game} changes={changes} showPriorities={game.teams.some((team) => team.priorities.length > 0)} />}
        side={<ParticipantSide game={game} catalogue={catalogue} />}
      />
    </GameLayout>
  );
}

function ParticipantSide({ game, catalogue }: { game: GameState; catalogue: Catalogue }) {
  const t = useT();
  const round = game.current_round ?? 0;

  if (game.phase === 'PRIORITIES') {
    return (
      <>
        <Panel kicker={<T k="board.participant.role_cards_kicker" />}>
          {catalogue.teams.map((card) => {
            const Icon = TEAM_ICON[card.role];
            return (
              <article key={card.role} className={`role-card team--${card.role}`}>
                <Icon size={48} />
                <div>
                  <h3>
                    <T k={roleKey(card.role)} />
                  </h3>
                  <p className="role-card__allowance">{allowanceText(card.allowance, t)}</p>
                  <p className="muted">
                    <T k="board.participant.interests_label" />{' '}
                    <CardText k={cardKeys.teamInterests(card.role)} fallback={interestsText(card.interests)} />
                  </p>
                </div>
              </article>
            );
          })}
          <p className="muted">
            <T k="board.participant.allocations_note" />
          </p>
        </Panel>
        <TeamSummaryPanel game={game} limits={catalogue.limits} />
      </>
    );
  }

  if (game.phase === 'GAME_COMPLETE') {
    return <FinalSide game={game} />;
  }

  const practiceKey = PRACTICE_CARD[game.phase];
  const practiceCard = practiceKey ? catalogue.actions.find((card) => card.key === practiceKey) : undefined;
  const events = visibleEvents(game, 'participant').filter((event) => event.round === round);
  const rolled = game.hazard_rolls.some((roll) => roll.round === round && roll.resolved);

  return (
    <>
      {practiceCard && (
        <Panel kicker={<T k="board.participant.action_card_kicker" />}>
          <ActionCardView
            card={practiceCard}
            note={
              <>
                <CardText k={cardKeys.actionDescription(practiceCard.key)} fallback={practiceCard.description} />{' '}
                <strong>
                  <T k="board.participant.practice_free" />
                </strong>
              </>
            }
          />
        </Panel>
      )}
      {round >= 1 && <TokensPanel game={game} />}
      {rolled && <HazardOutcomePanel game={game} round={round} />}
      {round >= 1 && reached(game, 'SCORING') && events.length > 0 && (
        <Panel kicker={<T k="board.participant.event_kicker" />}>
          {events.map((event) => (
            <EventCardView key={event.id} event={event} game={game} mode="result" />
          ))}
        </Panel>
      )}
      {reached(game, 'ROUND_COMPLETE') && (
        <Panel kicker={<T k="board.participant.score_kicker" vars={{ round }} />}>
          <ScoreTable game={game} upTo={round} />
        </Panel>
      )}
    </>
  );
}

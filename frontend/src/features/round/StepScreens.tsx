import { useState, type ReactNode } from 'react';
import type { Catalogue, GameState } from '../../api/types';
import type { GameCommands } from '../../api/queries';
import { DiceFace } from '../../assets/icons';
import { BoardScreen } from '../../components/BoardScreen';
import { EventCardView, HazardDiceList, HistoryList, ScoreTable, StatusChangeList } from '../../components/Cards';
import { Celebration } from '../../components/Celebration';
import { Panel } from '../../components/GameLayout';
import { ResourceTokens } from '../../components/Tokens';
import {
  buildHistory,
  hazardDice,
  hazardName,
  hazardStatusChanges,
  latestScoredRound,
  orderedTeams,
  type Changes,
} from '../../lib/derive';
import { roleKey } from '../../lib/format';
import { T, useT, useTexts } from '../../texts';
import { allowanceText, EventQueue } from './TeamsStage';

interface ScreenProps {
  game: GameState;
  catalogue: Catalogue;
  commands: GameCommands;
  changes: Changes;
}

const roundOf = (game: GameState) => game.current_round ?? 0;

function NextButton({ commands, label, onClick }: { commands: GameCommands; label: ReactNode; onClick: () => void }) {
  return (
    <Panel>
      <button type="button" className="btn btn--primary btn--wide" disabled={commands.pending} onClick={onClick}>
        {label}
      </button>
    </Panel>
  );
}

/** Start of a regular round: show what each team will receive, then hand the tokens out. */
export function AllocationScreen({ game, catalogue, commands, changes }: ScreenProps) {
  const round = roundOf(game);
  const t = useT();
  return (
    <BoardScreen
      game={game}
      changes={changes}
      error={commands.error}
      side={
        <>
          <Panel kicker={<T k="round.allocation.kicker" />} title={<T k="round.allocation.title" />}>
            <ResourceTokens
              caption={<T k="round.allocation.caption" />}
              rows={catalogue.teams.map((card) => ({ role: card.role, resources: card.allowance }))}
            />
            <ul className="plain-list muted">
              {catalogue.teams.map((card) => (
                <li key={card.role}>
                  <T k={roleKey(card.role)} />: {allowanceText(card.allowance, t)}
                </li>
              ))}
            </ul>
          </Panel>
          <NextButton
            commands={commands}
            label={<T k="round.allocation.button" />}
            onClick={() => commands.runStep(round, 'allocate-resources')}
          />
        </>
      }
    />
  );
}

/** Before the dice are rolled: which hazards already hold a predicted die and which will roll now. */
export function RollHazardsScreen({ game, commands, changes }: Omit<ScreenProps, 'catalogue'>) {
  const round = roundOf(game);
  const dice = hazardDice(game);
  return (
    <BoardScreen
      game={game}
      changes={changes}
      error={commands.error}
      side={
        <>
          <Panel
            kicker={<T k="round.roll.kicker" />}
            title={<T k={round === 0 ? 'round.roll.title_practice' : 'round.roll.title'} />}
          >
            <ul className="dice-list">
              {game.hazards.map((hazard) => {
                const stored = dice.get(hazard.id)?.current;
                return (
                  <li key={hazard.id} className="dice-list__row">
                    {stored ? <DiceFace value={stored.die} size={30} /> : <span className="dice-list__blank" aria-hidden="true" />}
                    <span className="dice-list__name">{hazard.name}</span>
                    <span className="muted">
                      <T k={stored ? 'round.roll.predicted' : 'round.roll.rolls_now'} />
                    </span>
                  </li>
                );
              })}
            </ul>
            {round === 0 && (
              <p className="muted">
                <T k="round.roll.round0_limit" />
              </p>
            )}
          </Panel>
          <EventQueue game={game} />
          <NextButton
            commands={commands}
            label={<T k="round.roll.button" />}
            onClick={() => commands.runStep(round, 'resolve-hazards')}
          />
        </>
      }
    />
  );
}

/** After the dice: every hazard's outcome and the damage it caused. */
export function HazardResultsScreen({ game, commands, changes }: Omit<ScreenProps, 'catalogue'>) {
  const round = roundOf(game);
  return (
    <BoardScreen
      game={game}
      changes={changes}
      error={commands.error}
      side={
        <>
          <HazardOutcomePanel game={game} round={round} />
          <EventQueue game={game} />
          <NextButton
            commands={commands}
            label={<T k="round.hazard_results.button" />}
            onClick={() => commands.runStep(round, 'apply-event')}
          />
        </>
      }
    />
  );
}

export function HazardOutcomePanel({ game, round }: { game: GameState; round: number }) {
  const rolls = game.hazard_rolls.filter((roll) => roll.round === round && roll.resolved);
  const applied = rolls.filter((roll) => roll.applied).length;
  return (
    <Panel
      kicker={<T k="round.hazard_outcome.kicker" vars={{ round }} />}
      title={<T k={applied === 1 ? 'round.hazard_outcome.title_one' : 'round.hazard_outcome.title'} vars={{ count: applied }} />}
    >
      <HazardDiceList game={game} rolls={rolls} />
      <StatusChangeList game={game} changes={hazardStatusChanges(game, round)} />
    </Panel>
  );
}

/** After the event is applied: the card, with what it changed. */
export function EventResultScreen({ game, commands, changes }: Omit<ScreenProps, 'catalogue'>) {
  const round = roundOf(game);
  const events = game.events.filter((event) => event.round === round && event.status !== 'pending');
  return (
    <BoardScreen
      game={game}
      changes={changes}
      error={commands.error}
      side={
        <>
          <Panel kicker={<T k="round.event_result.kicker" />}>
            {events.length === 0 ? (
              <p>
                <T k="round.event_result.none" />
              </p>
            ) : (
              events.map((event) => <EventCardView key={event.id} event={event} game={game} mode="result" />)
            )}
          </Panel>
          <NextButton
            commands={commands}
            label={<T k="round.event_result.button" />}
            onClick={() => commands.runStep(round, 'score')}
          />
        </>
      }
    />
  );
}

/** End of Round 0: the damage and the predicted dice for Round 1, then the revealed scores before moving on. */
export function RoundZeroResultScreen({ game, commands, changes }: Omit<ScreenProps, 'catalogue'>) {
  const next = [...hazardDice(game).entries()].flatMap(([hazardId, dice]) => (dice.next ? [{ hazardId, die: dice.next.die }] : []));
  const scored = game.phase === 'ROUND_COMPLETE';
  return (
    <BoardScreen
      game={game}
      changes={changes}
      error={commands.error}
      side={
        <>
          {scored && (
            <Panel kicker={<T k="round.scores.kicker" vars={{ round: 0 }} />}>
              <ScoreTable game={game} upTo={0} />
            </Panel>
          )}
          <HazardOutcomePanel game={game} round={0} />
          {next.map((item) => (
            <Panel key={item.hazardId} className="next-die">
              <p className="next-die__label">
                <T k="round.round0_result.next_die_label" vars={{ hazard: hazardName(game, item.hazardId) }} />
              </p>
              <p className="next-die__value">
                <T k="round.round0_result.next_die_value" vars={{ die: item.die }} />
              </p>
              <p className="muted">
                <T k="round.round0_result.next_die_note" />
              </p>
            </Panel>
          ))}
          <NextButton
            commands={commands}
            label={<T k={scored ? 'round.round0_result.button' : 'round.round0_result.score_button'} />}
            onClick={() => commands.runStep(0, scored ? 'complete' : 'score')}
          />
        </>
      }
    />
  );
}

/** After scoring: the round's scores and the choice to continue or finish. */
export function ScoresScreen({ game, commands, changes }: Omit<ScreenProps, 'catalogue'>) {
  const round = roundOf(game);
  const last = round >= game.total_rounds;
  const [confirming, setConfirming] = useState(false);
  const { t } = useTexts();
  return (
    <BoardScreen
      game={game}
      changes={changes}
      error={commands.error}
      side={
        <>
          <Panel kicker={<T k="round.scores.kicker" vars={{ round }} />}>
            <ScoreTable game={game} upTo={round} />
          </Panel>
          <Panel kicker={<T k="round.scores.choice_kicker" />} title={<T k="round.scores.choice_title" />}>
            {!last && (
              <button
                type="button"
                className="btn btn--primary btn--wide"
                disabled={commands.pending}
                onClick={() => commands.runStep(round, 'complete')}
              >
                <T k="round.scores.continue" vars={{ next: round + 1 }} />
              </button>
            )}
            {confirming ? (
              <div className="confirm" role="alertdialog" aria-label={t('round.scores.confirm_label')}>
                <p>
                  <T k="round.scores.confirm_text" vars={{ round }} />
                </p>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={commands.pending}
                  onClick={() => commands.finishGame()}
                >
                  <T k="round.scores.confirm_yes" />
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
                  <T k="round.scores.confirm_cancel" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                className={`btn btn--wide ${last ? 'btn--primary' : 'btn--soft'}`}
                disabled={commands.pending}
                onClick={() => setConfirming(true)}
              >
                <T k="round.scores.finish" />
              </button>
            )}
            <p className="muted">
              <T k="round.scores.keep_note" />
            </p>
            <p className="muted">
              <T k="round.scores.expire_note" />
            </p>
          </Panel>
        </>
      }
    />
  );
}

/** The game is over: final board, final scores (the last round played) and the game history. */
export function FinalScreen({ game, changes }: Pick<ScreenProps, 'game' | 'changes'>) {
  return (
    <BoardScreen
      game={game}
      changes={changes}
      side={
        <>
          {game.winners.length > 0 && <Celebration />}
          <FinalScores game={game} />
        </>
      }
      below={<FinalHistory game={game} />}
    />
  );
}

export function FinalSide({ game }: { game: GameState }) {
  return (
    <>
      {game.winners.length > 0 && <Celebration />}
      <FinalScores game={game} />
      <FinalHistory game={game} />
    </>
  );
}

function FinalScores({ game }: { game: GameState }) {
  const last = latestScoredRound(game);
  return (
    <Panel
      kicker={
        last === null ? <T k="round.final.scores_kicker" /> : <T k="round.final.scores_kicker_round" vars={{ round: last }} />
      }
    >
      {last === null ? (
        <p className="muted">
          <T k="board.scores.none" />
        </p>
      ) : (
        <ScoreTable game={game} upTo={last} winners={game.winners} />
      )}
    </Panel>
  );
}

function FinalHistory({ game }: { game: GameState }) {
  const texts = useTexts();
  return (
    <Panel kicker={<T k="round.final.history_kicker" />}>
      <HistoryList rounds={buildHistory(game, texts)} />
    </Panel>
  );
}

export function TokensPanel({ game }: { game: GameState }) {
  return (
    <Panel kicker={<T k="round.tokens.kicker" />}>
      <ResourceTokens
        caption={<T k="round.tokens.caption" />}
        rows={orderedTeams(game).map((team) => ({ role: team.role, resources: team.resources }))}
      />
    </Panel>
  );
}

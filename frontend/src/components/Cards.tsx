import type { GameEvent, GameState, HazardRoll } from '../api/types';
import { DiceFace } from '../assets/icons';
import {
  describeChange,
  describeEffect,
  elementName,
  hazardName,
  rollOutcome,
  scoreHistory,
  type HistoryRound,
  type RollOutcome,
  type ScoreCell,
} from '../lib/derive';
import { roleKey, signed } from '../lib/format';
import { TEAM_ICON } from '../assets/icons';
import { T, useT, type TextKey } from '../texts';

interface EventCardViewProps {
  event: GameEvent;
  game: GameState;
  /** "preview" lists what the event will do (moderator only); "result" lists what it did. */
  mode: 'preview' | 'result';
}

export function EventCardView({ event, game, mode }: EventCardViewProps) {
  const t = useT();
  const lines =
    mode === 'result' && event.status === 'applied'
      ? event.applied_changes.map((change) => describeChange(game, change, t))
      : event.effects.map((effect) => describeEffect(game, effect, t));

  return (
    <article className={`event-card event-card--${event.status}`}>
      <div className="event-card__band">
        <T k={event.type === 'transition_pressure' ? 'board.event_card.band_transition' : 'board.event_card.band_event'} />
      </div>
      <h3 className="event-card__title">{event.name}</h3>
      {event.description && <p className="event-card__text">{event.description}</p>}
      {mode === 'result' && event.status === 'avoided' ? (
        <p className="event-card__changes event-card__changes--ok">
          <T k="board.event_card.avoided" />
        </p>
      ) : (
        lines.length > 0 && (
          <ul className="event-card__changes">
            {lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )
      )}
    </article>
  );
}

const OUTCOME_LABEL: Record<RollOutcome, TextKey> = {
  trigger: 'board.dice_list.trigger',
  no_event: 'board.dice_list.no_event',
  skip: 'board.dice_list.skip',
};

/** Every hazard's die with its outcome, in board order. */
export function HazardDiceList({ game, rolls }: { game: GameState; rolls: HazardRoll[] }) {
  return (
    <ul className="dice-list">
      {rolls.map((roll) => {
        const outcome = rollOutcome(roll);
        return (
          <li key={roll.id} className="dice-list__row">
            <DiceFace value={roll.die} size={30} />
            <span className="dice-list__name">{hazardName(game, roll.hazard_id)}</span>
            <span className={`outcome outcome--${outcome}`}>
              <T k={OUTCOME_LABEL[outcome]} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function StatusChangeList({
  game,
  changes,
}: {
  game: GameState;
  changes: { elementId: number; before: number; after: number }[];
}) {
  if (changes.length === 0)
    return (
      <p className="muted">
        <T k="board.status_changes.none" />
      </p>
    );
  return (
    <ul className="change-list">
      {changes.map((change) => (
        <li key={change.elementId}>
          {elementName(game, change.elementId)}: {change.before} &rarr; {change.after}
        </li>
      ))}
    </ul>
  );
}

/** Scores of every round up to `upTo`: one column per round, one row per team. */
export function ScoreTable({ game, upTo, winners = [] }: { game: GameState; upTo: number; winners?: number[] }) {
  const t = useT();
  const { rounds, rows } = scoreHistory(game, upTo);
  if (rounds.length === 0)
    return (
      <p className="muted">
        <T k="board.scores.none" />
      </p>
    );
  return (
    <>
      <table className="score-table">
        <thead>
          <tr>
            <th scope="col">
              <T k="board.scores.team_head" />
            </th>
            {rounds.map((round) => (
              <th key={round} scope="col">
                <T k="board.scores.round_head" vars={{ round }} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const Icon = TEAM_ICON[row.team.role];
            const winner = winners.includes(row.team.id);
            return (
              <tr key={row.team.id} className={`team--${row.team.role}${winner ? ' score-row--winner' : ''}`}>
                <th scope="row">
                  <span className="score-table__team">
                    <Icon size={22} />
                    <span>
                      <T k={roleKey(row.team.role)} />
                      {winner && (
                        <span className="badge badge--winner">
                          <T k="board.scores.winner" />
                        </span>
                      )}
                    </span>
                  </span>
                </th>
                {row.cells.map((cell, index) =>
                  cell === null ? (
                    <td key={rounds[index]} className="score-table__empty">
                      &ndash;
                    </td>
                  ) : (
                    <ScoreTableCell
                      key={rounds[index]}
                      cell={cell}
                      round={rounds[index] ?? 0}
                      team={t(roleKey(row.team.role))}
                      tipId={`score-tip-${row.team.id}-${rounds[index]}`}
                      alignEnd={index >= rounds.length / 2}
                    />
                  ),
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">
        <T k="board.scores.large_rule" />
        <br />
        <T k="board.scores.small_rule" />
      </p>
    </>
  );
}

function TrendArrow({ direction }: { direction: 'up' | 'down' }) {
  return (
    <svg className={`score-trend score-trend--${direction}`} width="7" height="10" viewBox="0 0 7 10" aria-hidden="true">
      <path
        d={direction === 'up' ? 'M3.5 9V1M1 3.5l2.5-2.5 2.5 2.5' : 'M3.5 1v8M1 6.5l2.5 2.5 2.5-2.5'}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface ScoreTableCellProps {
  cell: ScoreCell;
  round: number;
  team: string;
  tipId: string;
  /** Open the tooltip leftwards so it stays inside the card on the right-hand columns. */
  alignEnd: boolean;
}

function ScoreTableCell({ cell, round, team, tipId, alignEnd }: ScoreTableCellProps) {
  const trend = cell.change === null || cell.change === 0 ? null : cell.change > 0 ? 'up' : 'down';
  const className = ['score-cell', cell.best && 'score--best', trend && `score--${trend}`].filter(Boolean).join(' ');
  return (
    <td className={className}>
      <span className="score-cell__value" tabIndex={0} aria-describedby={tipId}>
        {cell.score}
        {trend && <TrendArrow direction={trend} />}
      </span>
      <span id={tipId} role="tooltip" className={`score-tip ${alignEnd ? 'score-tip--end' : 'score-tip--start'}`}>
        <span className="score-tip__title">
          <T k="board.scores.tip_title" vars={{ team, round }} />
        </span>
        <span className="score-tip__line">
          <span>
            <T k="board.scores.tip_large" />
          </span>
          <span>
            2 &times; {cell.large / 2} = {cell.large}
          </span>
        </span>
        <span className="score-tip__line">
          <span>
            <T k="board.scores.tip_small" />
          </span>
          <span>
            1 &times; {cell.small} = {cell.small}
          </span>
        </span>
        <span className="score-tip__line score-tip__line--total">
          <span>
            <T k="board.scores.tip_total" />
          </span>
          <span>
            {cell.large} + {cell.small} = {cell.score}
          </span>
        </span>
        {cell.change !== null && (
          <span className={`score-tip__line score-tip__line--${trend ?? 'same'}`}>
            <span>
              <T k="board.scores.tip_since" vars={{ round: cell.previousRound ?? '' }} />
            </span>
            <span>{cell.change === 0 ? <T k="board.scores.tip_no_change" /> : signed(cell.change)}</span>
          </span>
        )}
        {cell.best && (
          <span className="score-tip__best">
            <T k="board.scores.tip_best" vars={{ round }} />
          </span>
        )}
      </span>
    </td>
  );
}

export function HistoryList({ rounds }: { rounds: HistoryRound[] }) {
  return (
    <ol className="history">
      {rounds.map((entry) => (
        <li key={entry.round} className="history__round">
          <h3>
            <T k="board.history.round" vars={{ round: entry.round }} />
          </h3>
          {entry.lines.length > 0 ? (
            <ul>
              {entry.lines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              <T k="board.history.empty" />
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}

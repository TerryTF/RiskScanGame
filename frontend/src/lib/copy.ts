import type { GameState, Phase } from '../api/types';
import type { TextKey, TextVars, Translate } from '../texts';
import { roundScores } from './derive';
import { roleKey } from './format';

/** A text and the values for its placeholders; render it with `<T {...ref} />`. */
export interface TextRef {
  k: TextKey;
  vars?: TextVars;
}

export interface StepCopy {
  /** Text of the phase pill in the header, for example "ROUND 1 · ACTION". */
  pill: TextRef;
  title: TextRef;
  subtitle: TextRef;
  /** The mint bar at the bottom: a bold lead-in followed by one sentence. */
  info: TextRef;
}

type StepId = Lowercase<Exclude<Phase, 'ROUND_COMPLETE'>> | 'round_complete' | 'round0_scoring' | 'round0_complete';

function scoreLine(game: GameState, round: number, t: Translate): string {
  return roundScores(game, round)
    .map((row) => `${t(roleKey(row.team.role))} ${row.score}`)
    .join(' / ');
}

function copyFor(id: StepId, vars?: TextVars): StepCopy {
  return {
    pill: { k: `step.${id}.pill`, vars },
    title: { k: `step.${id}.title`, vars },
    subtitle: { k: `step.${id}.subtitle`, vars },
    info: { k: `step.${id}.info`, vars },
  };
}

/** The heading, hint and status text for every phase of play, following the storyboard's wording. */
export function stepCopy(game: GameState, t: Translate): StepCopy {
  const round = game.current_round ?? 0;
  switch (game.phase) {
    case 'SCORING':
      return round === 0 ? copyFor('round0_scoring') : copyFor('scoring', { round });
    case 'ROUND_COMPLETE':
      return round === 0
        ? copyFor('round0_complete', { scores: scoreLine(game, 0, t) })
        : copyFor('round_complete', { round, scores: scoreLine(game, round, t) });
    case 'GAME_COMPLETE': {
      const last = Math.max(0, ...game.scores.map((score) => score.round));
      return copyFor('game_complete', { last, total: game.total_rounds, scores: scoreLine(game, last, t) });
    }
    default:
      return copyFor(game.phase.toLowerCase() as StepId, { round });
  }
}

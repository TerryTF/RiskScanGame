import type { ReactNode } from 'react';
import type { GameState } from '../api/types';
import type { Changes } from '../lib/derive';
import { stepCopy, type StepCopy } from '../lib/copy';
import { T, useT } from '../texts';
import { Board, type BoardPreview, type MarkerPlacement } from './Board';
import { BoardLayout, GameLayout, Notice } from './GameLayout';

interface BoardScreenProps {
  game: GameState;
  /** Heading and status texts; by default the ones for the game's phase. */
  copy?: StepCopy;
  /** The column of panels beside the board. */
  side: ReactNode;
  /** Wider content under the board, such as an editor. */
  below?: ReactNode;
  /** Content under the board but still inside the board column, such as the action cards row. */
  belowBoard?: ReactNode;
  changes?: Changes;
  preview?: BoardPreview;
  showPriorities?: boolean;
  placement?: MarkerPlacement;
  error?: string | null;
}

/** The storyboard's standard play screen: header, heading, the board with side panels, and the status bar. */
export function BoardScreen({ game, copy, side, below, belowBoard, changes, preview, showPriorities = true, placement, error }: BoardScreenProps) {
  const t = useT();
  const text = copy ?? stepCopy(game, t);
  return (
    <GameLayout
      crumb={<T k="board.crumb.moderator" />}
      pill={<T {...text.pill} />}
      title={<T {...text.title} />}
      subtitle={<T {...text.subtitle} />}
      info={<T {...text.info} />}
    >
      {error && <Notice tone="error">{error}</Notice>}
      <BoardLayout
        board={<Board game={game} changes={changes} preview={preview} showPriorities={showPriorities} placement={placement} />}
        side={side}
        belowBoard={belowBoard}
      />
      {below}
    </GameLayout>
  );
}

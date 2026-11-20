import { useCallback, useState } from 'react';
import type { Catalogue, GameState } from '../../api/types';
import type { GameCommands } from '../../api/queries';
import { useLocalBack, UndoArea } from '../../components/ModeratorBar';
import { useChanges } from '../../lib/useChanges';
import { ActionPhaseScreen, PracticeScreen } from './ActionScreens';
import { Round0Intro } from './Round0Intro';
import {
  AllocationScreen,
  EventResultScreen,
  FinalScreen,
  HazardResultsScreen,
  RollHazardsScreen,
  RoundZeroResultScreen,
  ScoresScreen,
} from './StepScreens';
import { TeamsStage } from './TeamsStage';

interface ModeratorConsoleProps {
  game: GameState;
  catalogue: Catalogue;
  commands: GameCommands;
}

/** Everything after setup: shows the screen for the game's current phase and the controls to advance it. */
export function ModeratorConsole({ game, catalogue, commands }: ModeratorConsoleProps) {
  const changes = useChanges(game);
  const [introSeen, setIntroSeen] = useState(false);
  const showIntro = useCallback(() => setIntroSeen(false), []);
  useLocalBack(introSeen && game.phase === 'ROUND0_PREDICTION' ? showIntro : null);
  const screen = { game, catalogue, commands, changes };
  const plain = { game, commands, changes };

  // The action screens keep their choices (and the board preview of them) at screen level, so Undo resets the screen.
  switch (game.phase) {
    case 'PRIORITIES':
      return <TeamsStage {...screen} />;
    case 'ROUND0_PREDICTION':
      return introSeen ? (
        <UndoArea key={game.phase}>
          <PracticeScreen {...screen} />
        </UndoArea>
      ) : (
        <Round0Intro
          catalogue={catalogue}
          busy={commands.pending}
          onStart={() => setIntroSeen(true)}
          onSkip={() => commands.skipRoundZero()}
        />
      );
    case 'ROUND0_ADAPTATION':
    case 'ROUND0_INVESTMENT':
      return (
        <UndoArea key={game.phase}>
          <PracticeScreen {...screen} />
        </UndoArea>
      );
    case 'ROUND0_HAZARDS':
    case 'HAZARD_PHASE':
      return <RollHazardsScreen {...plain} />;
    case 'RESOURCE_ALLOCATION':
      return <AllocationScreen {...screen} />;
    case 'ACTION_PHASE':
      return (
        <UndoArea key={game.current_round}>
          <ActionPhaseScreen {...screen} />
        </UndoArea>
      );
    case 'EVENT_PHASE':
      return <HazardResultsScreen {...plain} />;
    case 'SCORING':
      return game.current_round === 0 ? <RoundZeroResultScreen {...plain} /> : <EventResultScreen {...plain} />;
    case 'ROUND_COMPLETE':
      return game.current_round === 0 ? <RoundZeroResultScreen {...plain} /> : <ScoresScreen {...plain} />;
    case 'GAME_COMPLETE':
      return <FinalScreen game={game} changes={changes} />;
    case 'SETUP':
      return null;
  }
}

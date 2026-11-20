import type { ReactNode } from 'react';
import type { Catalogue, GameState } from '../../api/types';
import { useGameCommands, type GameCommands } from '../../api/queries';
import { NO_CHANGES, type Changes } from '../../lib/derive';
import { BoardPage } from '../../pages/BoardPage';
import { HomePage } from '../../pages/HomePage';
import { StartPage } from '../../pages/StartPage';
import { ActionPhaseScreen, PracticeScreen } from '../round/ActionScreens';
import { Round0Intro } from '../round/Round0Intro';
import {
  AllocationScreen,
  EventResultScreen,
  FinalScreen,
  HazardResultsScreen,
  RollHazardsScreen,
  RoundZeroResultScreen,
  ScoresScreen,
} from '../round/StepScreens';
import { TeamsStage } from '../round/TeamsStage';
import { SetupWizard } from '../setup/SetupWizard';

/** Snapshots served by `GET /api/v1/editor/sample-game`, one per moment of the scripted sample game. */
export type SampleKey =
  | 'setup'
  | 'priorities'
  | 'priorities_set'
  | 'round0_prediction'
  | 'round0_adaptation'
  | 'round0_investment'
  | 'round0_hazards'
  | 'round0_result'
  | 'round0_scores'
  | 'allocation'
  | 'actions'
  | 'actions_taken'
  | 'hazards'
  | 'hazard_results'
  | 'event'
  | 'scores'
  | 'final';

interface ScreenProps {
  game: GameState;
  catalogue: Catalogue;
  commands: GameCommands;
  changes: Changes;
}

export interface TourPage {
  id: string;
  group: string;
  label: string;
  /** The sample game state the page shows; also what the preview API returns for the game. */
  sample?: SampleKey;
  /** Route pattern and URL for pages that read the game id from the URL. */
  path?: string;
  url?: string;
  render: (catalogue: Catalogue, game: GameState | null) => ReactNode;
}

function Play({ game, catalogue, children }: { game: GameState; catalogue: Catalogue; children: (props: ScreenProps) => ReactNode }) {
  const commands = useGameCommands(game.id);
  return <>{children({ game, catalogue, commands, changes: NO_CHANGES })}</>;
}

function screen(
  id: string,
  group: string,
  label: string,
  sample: SampleKey,
  view: (props: ScreenProps) => ReactNode,
): TourPage {
  return {
    id,
    group,
    label,
    sample,
    render: (catalogue, game) =>
      game && (
        <Play game={game} catalogue={catalogue}>
          {view}
        </Play>
      ),
  };
}

function board(id: string, label: string, sample: SampleKey): TourPage {
  return { id, group: 'Player board', label, sample, path: '/board/:gameId', url: '/board/sample', render: () => <BoardPage /> };
}

const SETUP = 'Moderator setup';
const TEAMS = 'Teams';
const ROUND0 = 'Round 0 (practice)';
const ROUND = 'Regular round';

/** Every page of the game, in playing order, each with the sample state it is shown with. */
export const TOUR: TourPage[] = [
  { id: 'start', group: 'Start', label: 'Choose a mode', render: () => <StartPage /> },
  { id: 'setup-start', group: SETUP, label: '1 · Start a game', render: () => <HomePage /> },
  ...[1, 2, 3, 4, 5].map((step) =>
    screen(
      `setup-${step}`,
      SETUP,
      ['1 · Game summary', '2 · Elements', '3 · Hazards', '4 · Vulnerabilities', '5 · Event cards'][step - 1],
      'setup',
      ({ game, catalogue, commands }) => (
        <SetupWizard game={game} catalogue={catalogue} commands={commands} initialStep={step} />
      ),
    ),
  ),
  screen('teams', TEAMS, 'Introduce the teams', 'priorities', (props) => <TeamsStage {...props} />),
  screen('priorities', TEAMS, 'Team priorities', 'priorities_set', (props) => <TeamsStage {...props} />),
  {
    id: 'round0-intro',
    group: ROUND0,
    label: 'How action cards work',
    sample: 'round0_prediction',
    render: (catalogue) => (
      <Round0Intro catalogue={catalogue} busy={false} onStart={() => undefined} onSkip={() => undefined} />
    ),
  },
  screen('round0-prediction', ROUND0, 'Practice 1 · Hazard Prediction', 'round0_prediction', (props) => (
    <PracticeScreen {...props} />
  )),
  screen('round0-adaptation', ROUND0, 'Practice 2 · Risk Adaptation', 'round0_adaptation', (props) => (
    <PracticeScreen {...props} />
  )),
  screen('round0-investment', ROUND0, 'Practice 3 · Local Investment', 'round0_investment', (props) => (
    <PracticeScreen {...props} />
  )),
  screen('round0-roll', ROUND0, 'Roll the hazard dice', 'round0_hazards', (props) => <RollHazardsScreen {...props} />),
  screen('round0-result', ROUND0, 'Round 0 result', 'round0_result', (props) => <RoundZeroResultScreen {...props} />),
  screen('round0-scores', ROUND0, 'Round 0 scores', 'round0_scores', (props) => <RoundZeroResultScreen {...props} />),
  screen('allocation', ROUND, 'Resource allocation', 'allocation', (props) => <AllocationScreen {...props} />),
  screen('actions', ROUND, 'Action phase', 'actions_taken', (props) => <ActionPhaseScreen {...props} />),
  screen('actions-funding', ROUND, 'Funding an action', 'actions_taken', (props) => (
    <ActionPhaseScreen {...props} initialCard="risk_adaptation" />
  )),
  screen('actions-diversification', ROUND, 'Diversification', 'actions_taken', (props) => (
    <ActionPhaseScreen {...props} initialCard="diversification" />
  )),
  screen('hazards', ROUND, 'Roll the hazard dice', 'hazards', (props) => <RollHazardsScreen {...props} />),
  screen('hazard-results', ROUND, 'Hazard results', 'hazard_results', (props) => <HazardResultsScreen {...props} />),
  screen('event', ROUND, 'Event revealed', 'event', (props) => <EventResultScreen {...props} />),
  screen('scores', ROUND, 'Scores and continue', 'scores', (props) => <ScoresScreen {...props} />),
  screen('final', 'End of the game', 'Final review', 'final', (props) => <FinalScreen {...props} />),
  board('board-waiting', 'Waiting for setup', 'setup'),
  board('board-teams', 'Teams and priorities', 'priorities_set'),
  board('board-practice', 'Round 0 practice', 'round0_prediction'),
  board('board-round', 'Round in progress', 'scores'),
  board('board-final', 'Final board', 'final'),
];

import { useCallback, useState } from 'react';
import type { Catalogue, GameState } from '../../api/types';
import type { GameCommands } from '../../api/queries';
import { useLocalBack, UndoArea } from '../../components/ModeratorBar';
import { cellKey } from '../../lib/derive';
import { Modal } from '../../components/GameLayout';
import { T, useT } from '../../texts';
import { ElementsStep } from './ElementsStep';
import { EventsStep } from './EventsStep';
import { HazardsStep } from './HazardsStep';
import { SETUP_STEPS, SetupFrame } from './SetupFrame';
import { ShareBoard } from './ShareBoard';
import { VulnerabilitiesStep } from './VulnerabilitiesStep';

interface SetupWizardProps {
  game: GameState;
  catalogue: Catalogue;
  commands: GameCommands;
  /** Opens this step (1 to 5) instead of the furthest reachable one; editor mode uses it to preview each step. */
  initialStep?: number;
}

function matrixComplete(game: GameState): boolean {
  const cells = new Set(game.vulnerabilities.map((v) => cellKey(v.element_id, v.hazard_id)));
  return (
    game.elements.length > 0 &&
    game.hazards.length > 0 &&
    game.elements.every((element) => game.hazards.every((hazard) => cells.has(cellKey(element.id, hazard.id))))
  );
}

/** Steps 2 to 5 of moderator setup. Step 1 (creating the game) happens on the home page. */
export function SetupWizard({ game, catalogue, commands, initialStep }: SetupWizardProps) {
  const { limits } = catalogue;
  const elementsDone = game.elements.length >= limits.elements_min;
  const hazardsDone = elementsDone && game.hazards.length > 0;
  const matrixDone = hazardsDone && matrixComplete(game);
  const furthest = !elementsDone ? 2 : !hazardsDone ? 3 : !matrixDone ? 4 : 5;

  const [step, setStep] = useState(() =>
    initialStep === undefined ? furthest : Math.min(SETUP_STEPS.length, Math.max(1, initialStep)),
  );
  const t = useT();
  // The step on screen reports changes it has not saved; leaving it then asks first.
  const [dirty, setDirty] = useState(false);
  const [leaveTo, setLeaveTo] = useState<number | null>(null);
  const { clearError } = commands;
  const go = useCallback(
    (next: number) => {
      clearError();
      setLeaveTo(null);
      setStep(next);
    },
    [clearError],
  );
  const request = useCallback(
    (next: number) => {
      if (next === step) return;
      if (dirty) setLeaveTo(next);
      else go(next);
    },
    [dirty, go, step],
  );
  const back = useCallback(() => request(Math.max(1, step - 1)), [request, step]);
  useLocalBack(step > 1 ? back : null);

  const frame = {
    step,
    error: commands.error,
    onStep: request,
    maxStep: furthest,
  };

  const content = (() => {
    switch (step) {
      case 1:
        return (
          <SetupFrame
            {...frame}
            title={<T k="setup.start.title" />}
            subtitle={<T k="setup.start.subtitle" />}
          >
            <div className="setup-card">
              <dl className="summary">
                <dt>
                  <T k="setup.summary.destination" />
                </dt>
                <dd>{game.destination_name}</dd>
                <dt>
                  <T k="setup.summary.scope" />
                </dt>
                <dd>{game.geographic_scope}</dd>
                <dt>
                  <T k="setup.summary.rounds" />
                </dt>
                <dd>{game.total_rounds}</dd>
              </dl>
              <p className="muted">
                <T k="setup.summary.locked" />
              </p>
              <ShareBoard gameId={game.id} />
              <div className="step-actions">
                <button type="button" className="btn btn--primary" onClick={() => go(2)}>
                  <T k="setup.summary.continue" />
                </button>
              </div>
            </div>
          </SetupFrame>
        );
      case 2:
        return (
          <SetupFrame
            {...frame}
            title={<T k="setup.elements.title" />}
            subtitle={
              <T
                k="setup.elements.subtitle"
                vars={{
                  count: catalogue.element_groups.reduce((sum, g) => sum + g.elements.length, 0),
                  status: limits.starting_status,
                }}
              />
            }
          >
            <UndoArea key={step}>
              <ElementsStep
                key={game.elements.map((e) => e.name).join('|')}
                catalogue={catalogue}
                saved={game.elements.map((element) => element.name)}
                busy={commands.pending}
                onBack={() => request(1)}
                onDirtyChange={setDirty}
                onSave={async (names) => {
                  if (await commands.setElements(names)) setStep(3);
                }}
              />
            </UndoArea>
          </SetupFrame>
        );
      case 3:
        return (
          <SetupFrame
            {...frame}
            title={<T k="setup.hazards.title" />}
            subtitle={
              <T
                k="setup.hazards.subtitle"
                vars={{
                  min: limits.hazards_min,
                  max: limits.hazards_max,
                  lowest: limits.probability_min,
                  highest: limits.probability_max,
                }}
              />
            }
            info={<T k="setup.hazards.info" />}
          >
            <UndoArea key={step}>
              <HazardsStep
                catalogue={catalogue}
                saved={game.hazards.map(({ name, probability }) => ({ name, probability }))}
                busy={commands.pending}
                onBack={() => request(2)}
                onDirtyChange={setDirty}
                onSave={async (hazards) => {
                  if (await commands.setHazards(hazards)) setStep(4);
                }}
              />
            </UndoArea>
          </SetupFrame>
        );
      case 4:
        return (
          <SetupFrame
            {...frame}
            title={<T k="setup.vulnerabilities.title" />}
            subtitle={
              <T
                k="setup.vulnerabilities.subtitle"
                vars={{ min: limits.vulnerability_min, max: limits.vulnerability_max }}
              />
            }
          >
            <UndoArea key={step}>
              <VulnerabilitiesStep
                key={`${game.elements.length}x${game.hazards.length}`}
                game={game}
                min={limits.vulnerability_min}
                max={limits.vulnerability_max}
                busy={commands.pending}
                onBack={() => request(3)}
                onDirtyChange={setDirty}
                onSave={async (cells) => {
                  if (await commands.setVulnerabilities(cells)) setStep(5);
                }}
              />
            </UndoArea>
          </SetupFrame>
        );
      default:
        return (
          <SetupFrame
            {...frame}
            title={<T k="setup.events.title" />}
            subtitle={<T k="setup.events.subtitle" />}
          >
            <UndoArea key={step}>
              <EventsStep
                game={game}
                catalogue={catalogue}
                busy={commands.pending}
                onBack={() => request(4)}
                onDirtyChange={setDirty}
                onFinish={async (events) => {
                  if (await commands.setEvents(events)) await commands.completeSetup();
                }}
              />
            </UndoArea>
          </SetupFrame>
        );
    }
  })();

  return (
    <>
      {content}
      {leaveTo !== null && (
        <Modal title={t('setup.leave.title')} onClose={() => setLeaveTo(null)}>
          <h2 className="panel-title">
            <T k="setup.leave.title" />
          </h2>
          <p>
            <T k="setup.leave.text" />
          </p>
          <div className="step-actions">
            <button type="button" className="btn btn--primary" onClick={() => setLeaveTo(null)}>
              <T k="setup.leave.stay" />
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => go(leaveTo)}>
              <T k="setup.leave.discard" />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

import { useEffect, type ReactNode } from 'react';
import { GameLayout, Notice } from '../../components/GameLayout';
import { T, useT, type TextKey } from '../../texts';

export const SETUP_STEPS = [
  'setup.frame.step_start',
  'setup.frame.step_elements',
  'setup.frame.step_hazards',
  'setup.frame.step_vulnerabilities',
  'setup.frame.step_events',
] as const satisfies readonly TextKey[];

interface SetupFrameProps {
  /** 1 to 5. */
  step: number;
  title: ReactNode;
  subtitle: ReactNode;
  info?: ReactNode;
  error?: string | null;
  /** Called when a step in the stepper is chosen. Steps after `maxStep` are not reachable yet. */
  onStep?: (step: number) => void;
  maxStep?: number;
  children: ReactNode;
}

export function SetupFrame({ step, title, subtitle, info, error, onStep, maxStep = step, children }: SetupFrameProps) {
  const t = useT();
  return (
    <GameLayout
      crumb={<T k="setup.frame.crumb" />}
      pill={<T k="setup.frame.pill" vars={{ step, total: SETUP_STEPS.length }} />}
      title={
        <>
          {`${String(step).padStart(2, '0')}  `}
          {title}
        </>
      }
      subtitle={subtitle}
      info={info ?? <T k="setup.frame.info" />}
    >
      {onStep && (
        <nav aria-label={t('setup.frame.steps_label')}>
          <ol className="stepper">
            {SETUP_STEPS.map((label, index) => {
              const number = index + 1;
              const reachable = number <= maxStep;
              return (
                <li key={label}>
                  <button
                    type="button"
                    className="stepper__step"
                    aria-current={number === step ? 'step' : undefined}
                    disabled={!reachable}
                    onClick={() => onStep(number)}
                  >
                    <span className="stepper__number">{number}</span> <T k={label} />
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {children}
    </GameLayout>
  );
}

export function StepActions({
  onBack,
  onNext,
  nextLabel,
  nextDisabled,
  busy,
  hint,
}: {
  onBack?: () => void;
  onNext: () => void;
  nextLabel: ReactNode;
  nextDisabled?: boolean;
  busy?: boolean;
  hint?: ReactNode;
}) {
  return (
    <div className="step-actions">
      {onBack && (
        <button type="button" className="btn btn--ghost" onClick={onBack} disabled={busy}>
          <T k="setup.frame.back" />
        </button>
      )}
      <button type="button" className="btn btn--primary" onClick={onNext} disabled={nextDisabled || busy}>
        {busy ? <T k="setup.frame.saving" /> : nextLabel}
      </button>
      {hint && <span className="step-actions__hint">{hint}</span>}
    </div>
  );
}

/** Tells the wizard whether the step on screen has changes that are not saved yet, and clears it when the step closes. */
export function useReportDirty(dirty: boolean, onDirtyChange?: (dirty: boolean) => void) {
  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);
}

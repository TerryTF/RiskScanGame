import type { GameState, Limits } from '../../api/types';
import type { TextRef } from '../../lib/copy';
import { activeElements, cellKey, elementName, hazardDice, hazardName, vulnerabilityMap } from '../../lib/derive';
import { T, useT } from '../../texts';

export type TargetKind = 'predict' | 'adapt' | 'invest';

export interface Target {
  hazardId: number | null;
  elementId: number | null;
}

export const EMPTY_TARGET: Target = { hazardId: null, elementId: null };

export function isTargetComplete(kind: TargetKind, target: Target): boolean {
  if (kind === 'predict') return target.hazardId !== null;
  if (kind === 'invest') return target.elementId !== null;
  return target.hazardId !== null && target.elementId !== null;
}

interface TargetPickerProps {
  game: GameState;
  limits: Limits;
  kind: TargetKind;
  target: Target;
  onChange: (target: Target) => void;
}

const toId = (value: string): number | null => (value === '' ? null : Number(value));

/** Chooses the hazard and/or element an action applies to, and previews what the action will do. */
export function TargetPicker({ game, limits, kind, target, onChange }: TargetPickerProps) {
  const elements = activeElements(game);
  const t = useT();
  const preview = previewText(game, limits, kind, target);
  return (
    <div className="target-picker">
      {kind !== 'invest' && (
        <label>
          <T k="round.target.hazard_label" />
          <select value={target.hazardId ?? ''} onChange={(event) => onChange({ ...target, hazardId: toId(event.target.value) })}>
            <option value="">{t('round.target.choose_hazard')}</option>
            {game.hazards.map((hazard) => (
              <option key={hazard.id} value={hazard.id}>
                {t('round.target.hazard_option', { hazard: hazard.name, probability: hazard.probability })}
              </option>
            ))}
          </select>
        </label>
      )}
      {kind !== 'predict' && (
        <label>
          <T k="round.target.element_label" />
          <select value={target.elementId ?? ''} onChange={(event) => onChange({ ...target, elementId: toId(event.target.value) })}>
            <option value="">{t('round.target.choose_element')}</option>
            {elements.map((element) => (
              <option key={element.id} value={element.id}>
                {t('round.target.element_option', { element: element.name, status: element.status })}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="target-picker__preview" aria-live="polite">
        {preview && <T {...preview} />}
      </p>
    </div>
  );
}

/** What the chosen action will do, or null when there is nothing to preview. */
export function previewText(game: GameState, limits: Limits, kind: TargetKind, target: Target): TextRef | null {
  if (!isTargetComplete(kind, target)) return { k: 'round.target.preview_empty' };

  if (kind === 'predict') {
    const stored = hazardDice(game).get(target.hazardId ?? -1);
    const name = hazardName(game, target.hazardId);
    return { k: stored?.current ? 'round.target.preview_predicted' : 'round.target.preview_predict', vars: { hazard: name } };
  }
  if (kind === 'invest') {
    const element = game.elements.find((item) => item.id === target.elementId);
    if (!element) return null;
    const vars = { element: element.name, before: element.status, after: element.status + limits.local_investment_gain };
    return { k: 'round.target.preview_invest', vars };
  }
  const current = vulnerabilityMap(game).get(cellKey(target.elementId ?? -1, target.hazardId ?? -1)) ?? 0;
  const next = Math.max(0, current - limits.adaptation_reduction);
  const vars = { element: elementName(game, target.elementId), hazard: hazardName(game, target.hazardId), before: current, after: next };
  return { k: 'round.target.preview_adapt', vars };
}

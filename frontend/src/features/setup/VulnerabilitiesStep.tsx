import { useState } from 'react';
import type { GameState, VulnerabilityInput } from '../../api/types';
import { Modal } from '../../components/GameLayout';
import { VulnerabilityLegend } from '../../components/VulnerabilityLegend';
import { cellKey, vulnerabilityMap } from '../../lib/derive';
import { vulnerabilityClass, vulnerabilityLevelKey } from '../../lib/vulnerability';
import { T, useT } from '../../texts';
import { StepActions, useReportDirty } from './SetupFrame';

interface VulnerabilitiesStepProps {
  game: GameState;
  min: number;
  max: number;
  busy: boolean;
  onBack: () => void;
  onSave: (cells: VulnerabilityInput[]) => void;
  /** Called with true while the matrix has changes that are not saved. */
  onDirtyChange?: (dirty: boolean) => void;
}

/** Empty cells are allowed: they are saved as 0 (no vulnerability) after the moderator confirms. */
export function VulnerabilitiesStep({ game, min, max, busy, onBack, onSave, onDirtyChange }: VulnerabilitiesStepProps) {
  const t = useT();
  const [saved] = useState<Map<string, number>>(() => vulnerabilityMap(game));
  const [values, setValues] = useState<Map<string, number>>(saved);
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [focused, setFocused] = useState<{ elementId: number; hazardId: number } | null>(null);
  const [fillWith, setFillWith] = useState(0);

  const { elements, hazards } = game;
  const total = elements.length * hazards.length;
  const filled = elements.reduce(
    (sum, element) => sum + hazards.filter((hazard) => values.has(cellKey(element.id, hazard.id))).length,
    0,
  );
  const complete = total > 0 && filled === total;
  const empty = total - filled;
  useReportDirty(
    values.size !== saved.size || [...values].some(([key, value]) => saved.get(key) !== value),
    onDirtyChange,
  );

  const setCell = (key: string, raw: string) =>
    setValues((current) => {
      const next = new Map(current);
      const digit = raw.slice(-1);
      if (digit === '') next.delete(key);
      else if (/^[0-9]$/.test(digit) && Number(digit) >= min && Number(digit) <= max) next.set(key, Number(digit));
      return next;
    });

  const fillEmpty = () =>
    setValues((current) => {
      const next = new Map(current);
      for (const element of elements) {
        for (const hazard of hazards) {
          const key = cellKey(element.id, hazard.id);
          if (!next.has(key)) next.set(key, fillWith);
        }
      }
      return next;
    });

  const saveAll = () =>
    onSave(
      elements.flatMap((element) =>
        hazards.map((hazard) => ({
          element_id: element.id,
          hazard_id: hazard.id,
          value: values.get(cellKey(element.id, hazard.id)) ?? 0,
        })),
      ),
    );

  const save = () => (empty > 0 ? setConfirmEmpty(true) : saveAll());

  const levelText = (value: number) => {
    const level = vulnerabilityLevelKey(value);
    return level ? t(level).toLowerCase() : '';
  };
  const focusedValue = focused ? values.get(cellKey(focused.elementId, focused.hazardId)) : undefined;
  const focusedElement = focused && elements.find((element) => element.id === focused.elementId);
  const focusedHazard = focused && hazards.find((hazard) => hazard.id === focused.hazardId);

  return (
    <>
      <VulnerabilityLegend />
      <div className="matrix-wrap">
        <table className="matrix">
          <thead>
            <tr>
              <th scope="col" className="matrix__corner">
                <T k="setup.vulnerabilities.corner" />
              </th>
              {hazards.map((hazard) => (
                <th key={hazard.id} scope="col" className="matrix__hazard">
                  {hazard.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {elements.map((element) => (
              <tr key={element.id}>
                <th scope="row">{element.name}</th>
                {hazards.map((hazard) => {
                  const key = cellKey(element.id, hazard.id);
                  const value = values.get(key);
                  const isFocused = focused?.elementId === element.id && focused.hazardId === hazard.id;
                  return (
                    <td
                      key={hazard.id}
                      className={
                        [vulnerabilityClass(value), isFocused && 'is-target', value === undefined && 'is-empty']
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                    >
                      <input
                        className="matrix__input"
                        inputMode="numeric"
                        autoComplete="off"
                        maxLength={1}
                        value={value ?? ''}
                        placeholder={'\u2013'}
                        aria-label={`${element.name} \u00d7 ${hazard.name}`}
                        onChange={(event) => setCell(key, event.target.value)}
                        onFocus={() => setFocused({ elementId: element.id, hazardId: hazard.id })}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="matrix-tools">
        <p className={`counter${complete ? ' counter--ok' : ''}`}>
          <T k="setup.vulnerabilities.cells_set" vars={{ filled, total }} />{' '}
          {focusedElement && focusedHazard && focusedValue !== undefined && (
            <>
              <T
                k="setup.vulnerabilities.selected_cell"
                vars={{
                  element: focusedElement.name,
                  hazard: focusedHazard.name,
                  value: focusedValue,
                  level: levelText(focusedValue),
                }}
              />{' '}
            </>
          )}
          <T k="setup.vulnerabilities.values" vars={{ min, max }} />
        </p>
        <div className="fill-tool">
          <label>
            <T k="setup.vulnerabilities.fill_label" />{' '}
            <select value={fillWith} onChange={(event) => setFillWith(Number(event.target.value))}>
              {Array.from({ length: max - min + 1 }, (_, index) => min + index).map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn btn--soft btn--small" onClick={fillEmpty} disabled={complete}>
            <T k="setup.vulnerabilities.fill" />
          </button>
        </div>
      </div>

      <StepActions
        onBack={onBack}
        onNext={save}
        nextLabel={<T k="setup.vulnerabilities.save" />}
        nextDisabled={total === 0}
        busy={busy}
        hint={
          complete ? undefined : (
            <T k={empty === 1 ? 'setup.vulnerabilities.hint_one' : 'setup.vulnerabilities.hint'} vars={{ count: empty }} />
          )
        }
      />
      {confirmEmpty && (
        <Modal title={t('setup.vulnerabilities.empty_title')} onClose={() => setConfirmEmpty(false)}>
          <h2 className="panel-title">
            <T k="setup.vulnerabilities.empty_title" />
          </h2>
          <p>
            <T k={empty === 1 ? 'setup.vulnerabilities.empty_text_one' : 'setup.vulnerabilities.empty_text'} vars={{ count: empty }} />
          </p>
          <div className="step-actions">
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy}
              onClick={() => {
                setConfirmEmpty(false);
                saveAll();
              }}
            >
              <T k="setup.vulnerabilities.empty_confirm" />
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setConfirmEmpty(false)}>
              <T k="setup.vulnerabilities.empty_cancel" />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

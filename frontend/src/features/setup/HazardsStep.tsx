import { useState, type FormEvent } from 'react';
import type { Catalogue, HazardInput } from '../../api/types';
import { CardText, T, cardKeys, editHazardNames, useCardText, useT } from '../../texts';
import { Choice } from './Choice';
import { StepActions, useReportDirty } from './SetupFrame';

const DEFAULT_PROBABILITY = 3;
const NAME_MAX = 120;

interface HazardsStepProps {
  catalogue: Catalogue;
  saved: HazardInput[];
  busy: boolean;
  onBack: () => void;
  onSave: (hazards: HazardInput[]) => void;
  /** Called with true while the step has changes that are not saved. */
  onDirtyChange?: (dirty: boolean) => void;
}

/** Selected hazards in board order: catalogue order first, then custom hazards in the order they were added. */
export function orderHazards(catalogue: Catalogue, selected: ReadonlyMap<string, number>, custom: string[]): HazardInput[] {
  return [...catalogue.hazards, ...custom]
    .filter((name) => selected.has(name))
    .map((name) => ({ name, probability: selected.get(name) ?? DEFAULT_PROBABILITY }));
}

export function HazardsStep({ catalogue, saved, busy, onBack, onSave, onDirtyChange }: HazardsStepProps) {
  const t = useT();
  const card = useCardText();
  // Selection and saving use the names as edited in editor mode; `catalogue` keeps the originals for the text keys.
  const named = { ...catalogue, hazards: editHazardNames(catalogue.hazards, card) };
  const [selected, setSelected] = useState<Map<string, number>>(
    () => new Map(saved.map((hazard) => [hazard.name, hazard.probability])),
  );
  const [custom, setCustom] = useState<string[]>(() =>
    saved.map((hazard) => hazard.name).filter((name) => !named.hazards.includes(name)),
  );
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  const { hazards_min: min, hazards_max: max, probability_min: lowest, probability_max: highest } = catalogue.limits;
  const count = selected.size;
  const full = count >= max;
  const valid = count >= min && count <= max;
  useReportDirty(
    count !== saved.length || saved.some((hazard) => selected.get(hazard.name) !== hazard.probability),
    onDirtyChange,
  );
  const names = [...named.hazards, ...custom];
  const probabilities = Array.from({ length: highest - lowest + 1 }, (_, index) => lowest + index);

  const toggle = (name: string) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(name)) next.delete(name);
      else if (next.size < max) next.set(name, DEFAULT_PROBABILITY);
      return next;
    });

  const setProbability = (name: string, probability: number) =>
    setSelected((current) => new Map(current).set(name, probability));

  const addCustom = (event: FormEvent) => {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return setDraftError(t('setup.hazards.error_empty'));
    if (names.some((known) => known.toLowerCase() === name.toLowerCase())) {
      return setDraftError(t('setup.hazards.error_duplicate', { name }));
    }
    if (full) return setDraftError(t('setup.hazards.error_max', { max }));
    setCustom((current) => [...current, name]);
    setSelected((current) => new Map(current).set(name, DEFAULT_PROBABILITY));
    setDraft('');
    setDraftError(null);
    setAdding(false);
  };

  return (
    <>
      <section className="setup-card" aria-labelledby="hazard-catalogue">
        <header className="setup-card__head">
          <h2 id="hazard-catalogue" className="kicker">
            <T k="setup.hazards.catalogue" vars={{ count: names.length }} />
          </h2>
          <span className="legend">
            <span aria-hidden="true">&#10003;</span> <T k="setup.legend.selected" />{' '}
            <span aria-hidden="true">&#9744;</span> <T k="setup.legend.not_selected" />
          </span>
        </header>

        <div className="choices choices--two-columns choices--hazards">
          {names.map((name, index) => {
            const checked = selected.has(name);
            const original = catalogue.hazards[index];
            return (
              <Choice
                key={original ?? name}
                label={original === undefined ? name : <CardText k={cardKeys.hazardName(original)} fallback={original} />}
                tone="red"
                checked={checked}
                disabled={!checked && full}
                onChange={() => toggle(name)}
              >
                {checked ? (
                  <label className="probability-pill">
                    <span className="sr-only">
                      <T k="setup.hazards.probability_label" vars={{ name }} />
                    </span>
                    <select
                      value={selected.get(name)}
                      onChange={(event) => setProbability(name, Number(event.target.value))}
                    >
                      {probabilities.map((value) => (
                        <option key={value} value={value}>
                          {t('setup.hazards.probability_option', { value, max: highest })}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <span className="choice__hint">
                    <T k="setup.hazards.not_selected" />
                  </span>
                )}
              </Choice>
            );
          })}
        </div>

        <footer className="setup-card__foot">
          <p className={`counter${valid ? ' counter--ok' : ''}`}>
            <T k={full ? 'setup.hazards.counter_full' : 'setup.hazards.counter'} vars={{ count, max, min }} />
          </p>
          {adding ? (
            <form className="inline-add" onSubmit={addCustom}>
              <label>
                <span className="sr-only">
                  <T k="setup.hazards.custom_name_label" />
                </span>
                <input
                  value={draft}
                  maxLength={NAME_MAX}
                  placeholder={t('setup.hazards.custom_name_placeholder')}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </label>
              <button type="submit" className="btn btn--primary btn--small">
                <T k="setup.hazards.add" />
              </button>
              <button
                type="button"
                className="btn btn--ghost btn--small"
                onClick={() => {
                  setAdding(false);
                  setDraft('');
                  setDraftError(null);
                }}
              >
                <T k="setup.hazards.cancel" />
              </button>
              {draftError && (
                <span className="field-error" role="alert">
                  {draftError}
                </span>
              )}
            </form>
          ) : (
            <button type="button" className="btn btn--soft" onClick={() => setAdding(true)} disabled={full}>
              <T k="setup.hazards.add_custom" />
            </button>
          )}
        </footer>
      </section>
      <p className="muted">
        <T k="setup.hazards.note" />
      </p>

      <StepActions
        onBack={onBack}
        onNext={() => onSave(orderHazards(named, selected, custom))}
        nextLabel={<T k="setup.hazards.save" />}
        nextDisabled={!valid}
        busy={busy}
        hint={
          valid ? undefined : min === max ? (
            <T k="setup.hazards.hint_exact" vars={{ count: max }} />
          ) : (
            <T k="setup.hazards.hint" vars={{ min, max }} />
          )
        }
      />
    </>
  );
}

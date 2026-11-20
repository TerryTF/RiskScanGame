import { useState, type FormEvent } from 'react';
import type { Catalogue } from '../../api/types';
import { CardText, T, cardKeys, editElementGroups, useCardText, useT } from '../../texts';
import { Choice } from './Choice';
import { StepActions, useReportDirty } from './SetupFrame';

const NAME_MAX = 120;

interface ElementsStepProps {
  catalogue: Catalogue;
  /** Names already saved for this game, so the step can be revisited. */
  saved: string[];
  busy: boolean;
  onBack: () => void;
  onSave: (names: string[]) => void;
  /** Called with true while the step has changes that are not saved. */
  onDirtyChange?: (dirty: boolean) => void;
}

/** Selected names in board order: catalogue order first, then custom elements in the order they were added. */
export function orderElementNames(catalogue: Catalogue, selected: ReadonlySet<string>, custom: string[]): string[] {
  const fromCatalogue = catalogue.element_groups.flatMap((group) => group.elements).filter((name) => selected.has(name));
  return [...fromCatalogue, ...custom.filter((name) => selected.has(name))];
}

export function ElementsStep({ catalogue, saved, busy, onBack, onSave, onDirtyChange }: ElementsStepProps) {
  const t = useT();
  const card = useCardText();
  // Selection and saving use the names as edited in editor mode; `catalogue` keeps the originals for the text keys.
  const named = { ...catalogue, element_groups: editElementGroups(catalogue.element_groups, card) };
  const catalogueNames = new Set(named.element_groups.flatMap((group) => group.elements));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(saved));
  const [custom, setCustom] = useState<string[]>(() => saved.filter((name) => !catalogueNames.has(name)));
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);

  const { elements_min: min, elements_max: max } = catalogue.limits;
  const count = selected.size;
  const valid = count >= min && count <= max;
  useReportDirty(count !== saved.length || saved.some((name) => !selected.has(name)), onDirtyChange);

  const toggle = (name: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(name)) next.delete(name);
      else if (next.size < max) next.add(name);
      return next;
    });

  const addCustom = (event: FormEvent) => {
    event.preventDefault();
    const name = draft.trim();
    if (!name) return setDraftError(t('setup.elements.error_empty'));
    const reset = () => {
      setDraft('');
      setDraftError(null);
    };
    const known = [...catalogueNames, ...custom].find((item) => item.toLowerCase() === name.toLowerCase());
    if (known && selected.has(known)) return setDraftError(t('setup.elements.error_duplicate', { name: known }));
    if (count >= max) return setDraftError(t('setup.elements.error_max', { max }));
    if (known) {
      toggle(known);
    } else {
      setCustom((current) => [...current, name]);
      setSelected((current) => new Set(current).add(name));
    }
    reset();
  };

  const removeCustom = (name: string) => {
    setCustom((current) => current.filter((item) => item !== name));
    setSelected((current) => {
      const next = new Set(current);
      next.delete(name);
      return next;
    });
  };

  /** Short groups stack in the narrow left column; the long group fills the wide column in two columns. */
  const isShortGroup = (group: { elements: string[] }) => group.elements.length <= 5;
  const renderGroup = (group: { name: string; elements: string[] }) => {
    const index = catalogue.element_groups.indexOf(group);
    const names = named.element_groups[index].elements;
    return (
      <fieldset key={group.name} className="element-group">
        <legend>
          <CardText k={cardKeys.elementGroup(group.name)} fallback={group.name} />{' '}
          <span className="count">{String(group.elements.length).padStart(2, '0')}</span>
        </legend>
        <div className={`choices${isShortGroup(group) ? '' : ' choices--two-columns'}`}>
          {group.elements.map((original, position) => {
            const name = names[position];
            return (
              <Choice
                key={original}
                label={<CardText k={cardKeys.elementName(original)} fallback={original} />}
                checked={selected.has(name)}
                disabled={!selected.has(name) && count >= max}
                onChange={() => toggle(name)}
              />
            );
          })}
        </div>
      </fieldset>
    );
  };

  return (
    <>
      <section className="setup-card" aria-labelledby="element-catalogue">
        <header className="setup-card__head">
          <h2 id="element-catalogue" className="kicker">
            <T k="setup.elements.catalogue" vars={{ count: catalogueNames.size }} />
          </h2>
          <span className="legend">
            <span aria-hidden="true">&#10003;</span> <T k="setup.legend.selected" />{' '}
            <span aria-hidden="true">&#9744;</span> <T k="setup.legend.not_selected" />
          </span>
        </header>

        <div className="element-groups">
          <div className="element-column">{catalogue.element_groups.filter(isShortGroup).map(renderGroup)}</div>
          <div className="element-column">
            {catalogue.element_groups.filter((group) => !isShortGroup(group)).map(renderGroup)}
            {custom.length > 0 && (
              <fieldset className="element-group">
                <legend>
                  <T k="setup.elements.custom" /> <span className="count">{String(custom.length).padStart(2, '0')}</span>
                </legend>
                <div className="choices">
                  {custom.map((name) => (
                    <div key={name} className="choice-with-action">
                      <Choice label={name} checked={selected.has(name)} onChange={() => toggle(name)} />
                      <button
                        type="button"
                        className="btn btn--tiny"
                        onClick={() => removeCustom(name)}
                        aria-label={t('setup.elements.remove_label', { name })}
                      >
                        <T k="setup.elements.remove" />
                      </button>
                    </div>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        </div>

        <footer className="setup-card__foot">
          <p className={`counter${valid ? ' counter--ok' : ''}`}>
            <T
              k="setup.elements.counter"
              vars={{ count, max, min, status: catalogue.limits.starting_status }}
            />
          </p>
          {adding ? (
            <form className="inline-add" onSubmit={addCustom}>
              <label>
                <span className="sr-only">
                  <T k="setup.elements.custom_name_label" />
                </span>
                <input
                  value={draft}
                  maxLength={NAME_MAX}
                  placeholder={t('setup.elements.custom_name_placeholder')}
                  onChange={(event) => setDraft(event.target.value)}
                />
              </label>
              <button type="submit" className="btn btn--primary btn--small">
                <T k="setup.elements.add" />
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
                <T k="setup.elements.cancel" />
              </button>
              {draftError && (
                <span className="field-error" role="alert">
                  {draftError}
                </span>
              )}
            </form>
          ) : (
            <button type="button" className="btn btn--soft" onClick={() => setAdding(true)} disabled={count >= max}>
              <T k="setup.elements.add_custom" />
            </button>
          )}
        </footer>
      </section>

      <StepActions
        onBack={onBack}
        onNext={() => onSave(orderElementNames(named, selected, custom))}
        nextLabel={<T k="setup.elements.save" />}
        nextDisabled={!valid}
        busy={busy}
        hint={valid ? undefined : <T k="setup.elements.hint" vars={{ min, max }} />}
      />
    </>
  );
}

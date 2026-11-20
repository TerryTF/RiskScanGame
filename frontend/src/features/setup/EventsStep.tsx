import { useState } from 'react';
import type { Catalogue, EffectKind, EventInput, GameState } from '../../api/types';
import { Notice } from '../../components/GameLayout';
import { signed } from '../../lib/format';
import { cardKeys, T, useT, useTexts, type TextKey } from '../../texts';
import {
  blankEvent,
  describeDraftEffect,
  initialDrafts,
  instantiateTemplate,
  newDraftId,
  toEventInputs,
  validateDrafts,
  type DraftEffect,
  type DraftEvent,
} from './events';
import { StepActions, useReportDirty } from './SetupFrame';

const EFFECT_KINDS: { value: EffectKind; label: TextKey }[] = [
  { value: 'hazard_probability', label: 'setup.events.kind_hazard_probability' },
  { value: 'vulnerability', label: 'setup.events.kind_vulnerability' },
  { value: 'element_status', label: 'setup.events.kind_element_status' },
];
const DELTAS = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5];
const PENALTIES = [-1, -2, -3, -4, -5, -6];

/** The cards as the moderator sees them, ignoring the ids drafts get when they are created. */
function draftSignature(drafts: DraftEvent[]): string {
  return JSON.stringify(
    drafts.map((draft) => ({
      ...draft,
      id: undefined,
      effects: draft.effects.map((effect) => ({ ...effect, id: undefined })),
    })),
  );
}

interface EventsStepProps {
  game: GameState;
  catalogue: Catalogue;
  busy: boolean;
  onBack: () => void;
  onFinish: (events: EventInput[]) => void;
  /** Called with true while the step has changes that are not saved. */
  onDirtyChange?: (dirty: boolean) => void;
}

export function EventsStep({ game, catalogue, busy, onBack, onFinish, onDirtyChange }: EventsStepProps) {
  const { t, card } = useTexts();
  const [drafts, setDrafts] = useState<DraftEvent[]>(() => initialDrafts(game, catalogue, card));
  const [editingId, setEditingId] = useState<string | null>(null);
  const [opened] = useState(() => draftSignature(drafts));
  useReportDirty(draftSignature(drafts) !== opened, onDirtyChange);
  const { limits } = catalogue;

  const update = (id: string, patch: Partial<DraftEvent>) =>
    setDrafts((current) => current.map((draft) => (draft.id === id ? { ...draft, ...patch } : draft)));
  const remove = (id: string) => setDrafts((current) => current.filter((draft) => draft.id !== id));
  const add = (draft: DraftEvent, edit = false) => {
    setDrafts((current) => [...current, draft]);
    if (edit) setEditingId(draft.id);
  };

  const problems = validateDrafts(drafts, limits, t);
  const rounds = Array.from({ length: game.total_rounds }, (_, index) => index + 1);

  return (
    <>
      <div className="round-cards">
        {rounds.map((round) => {
          const inRound = drafts.filter((draft) => draft.round === round);
          const enabledCount = inRound.filter((draft) => draft.enabled).length;
          return (
            <section key={round} className="round-card" aria-label={t('setup.events.round_label', { round })}>
              <h2 className="round-card__band">
                <T k="setup.events.round_band" vars={{ round }} />
              </h2>
              <div className="round-card__body">
                {inRound.length === 0 && (
                  <p className="muted">
                    <T k="setup.events.none" />
                  </p>
                )}
                {inRound.map((draft) => (
                  <EventDraftCard
                    key={draft.id}
                    game={game}
                    draft={draft}
                    editing={editingId === draft.id}
                    onEdit={() => setEditingId(editingId === draft.id ? null : draft.id)}
                    onChange={(patch) => update(draft.id, patch)}
                    onRemove={() => remove(draft.id)}
                  />
                ))}
                <AddEvent
                  game={game}
                  catalogue={catalogue}
                  round={round}
                  full={enabledCount >= limits.events_per_round_max}
                  onAdd={add}
                />
              </div>
            </section>
          );
        })}
      </div>

      <p className="muted">
        <T
          k="setup.events.special_action"
          vars={{
            rounds: limits.reduce_emissions_rounds.join(` ${t('setup.events.and')} `),
            round: limits.transition_pressure_round,
          }}
        />
      </p>

      {problems.length > 0 && (
        <Notice tone="warning">
          <ul className="plain-list">
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </Notice>
      )}

      <StepActions
        onBack={onBack}
        onNext={() => onFinish(toEventInputs(game, drafts))}
        nextLabel={<T k="setup.events.finish" />}
        nextDisabled={problems.length > 0}
        busy={busy}
      />
    </>
  );
}

function AddEvent({
  game,
  catalogue,
  round,
  full,
  onAdd,
}: {
  game: GameState;
  catalogue: Catalogue;
  round: number;
  full: boolean;
  onAdd: (draft: DraftEvent, edit?: boolean) => void;
}) {
  const { t, card } = useTexts();
  const templates = catalogue.event_templates
    .filter((template) => template.type === 'standard')
    .filter((template) => instantiateTemplate(template, game, round, card) !== null);

  return (
    <label className="add-event">
      <span className="sr-only">
        <T k="setup.events.add_label" vars={{ round }} />
      </span>
      <select
        value=""
        disabled={full}
        onChange={(event) => {
          const value = event.target.value;
          if (value === '__custom') return onAdd(blankEvent(game, round), true);
          const template = templates.find((item) => item.key === value);
          const draft = template && instantiateTemplate(template, game, round, card);
          if (draft) onAdd(draft);
        }}
      >
        <option value="">{t(full ? 'setup.events.full' : 'setup.events.add')}</option>
        {templates.map((template) => (
          <option key={template.key} value={template.key}>
            {card(cardKeys.eventName(template.key), template.name)}
          </option>
        ))}
        <option value="__custom">{t('setup.events.custom')}</option>
      </select>
    </label>
  );
}

function EventDraftCard({
  game,
  draft,
  editing,
  onEdit,
  onChange,
  onRemove,
}: {
  game: GameState;
  draft: DraftEvent;
  editing: boolean;
  onEdit: () => void;
  onChange: (patch: Partial<DraftEvent>) => void;
  onRemove: () => void;
}) {
  const t = useT();
  const mandatory = draft.type === 'transition_pressure';
  return (
    <article className={`draft-card${draft.enabled ? '' : ' is-disabled'}`}>
      <h3 className="draft-card__title">
        {draft.name || <T k="setup.events.untitled" />}
        {mandatory && (
          <span className="badge badge--pink">
            <T k="setup.events.mandatory" />
          </span>
        )}
      </h3>
      <ul className="draft-card__effects">
        {draft.effects.map((effect) => (
          <li key={effect.id}>{describeDraftEffect(effect, draft.type, t)}</li>
        ))}
      </ul>
      <div className="draft-card__actions">
        <label className="toggle">
          <input
            type="checkbox"
            checked={draft.enabled}
            disabled={mandatory}
            onChange={(event) => onChange({ enabled: event.target.checked })}
          />
          <T k="setup.events.enabled" />
        </label>
        <button type="button" className="btn btn--tiny" onClick={onEdit} aria-expanded={editing}>
          <T k={editing ? 'setup.events.done' : 'setup.events.edit'} />
        </button>
        {!mandatory && (
          <button type="button" className="btn btn--tiny" onClick={onRemove}>
            <T k="setup.events.remove" />
          </button>
        )}
      </div>
      {editing && <EventEditor game={game} draft={draft} onChange={onChange} />}
      <p className="draft-card__note">
        <T k={mandatory ? 'setup.events.note_mandatory' : 'setup.events.note'} />
      </p>
    </article>
  );
}

function EventEditor({
  game,
  draft,
  onChange,
}: {
  game: GameState;
  draft: DraftEvent;
  onChange: (patch: Partial<DraftEvent>) => void;
}) {
  const t = useT();
  const mandatory = draft.type === 'transition_pressure';
  const setEffect = (id: string, patch: Partial<DraftEffect>) =>
    onChange({ effects: draft.effects.map((effect) => (effect.id === id ? { ...effect, ...patch } : effect)) });

  const changeKind = (effect: DraftEffect, kind: EffectKind) =>
    setEffect(effect.id, {
      kind,
      hazard: kind === 'element_status' ? null : (effect.hazard ?? game.hazards[0]?.name ?? null),
      element:
        kind === 'hazard_probability' ? null : kind === 'vulnerability' ? (effect.element ?? game.elements[0]?.name ?? null) : effect.element,
    });

  return (
    <div className="event-editor">
      <label>
        <T k="setup.events.name_label" />
        <input value={draft.name} maxLength={120} onChange={(event) => onChange({ name: event.target.value })} />
      </label>
      <label>
        <T k="setup.events.description_label" />
        <textarea
          value={draft.description}
          rows={2}
          maxLength={1000}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </label>

      {draft.effects.map((effect, index) => (
        <fieldset key={effect.id} className="effect-row">
          <legend>
            <T k="setup.events.effect_legend" vars={{ number: index + 1 }} />
          </legend>
          {!mandatory && (
            <label>
              <T k="setup.events.kind_label" />
              <select value={effect.kind} onChange={(event) => changeKind(effect, event.target.value as EffectKind)}>
                {EFFECT_KINDS.map((kind) => (
                  <option key={kind.value} value={kind.value}>
                    {t(kind.label)}
                  </option>
                ))}
              </select>
            </label>
          )}
          {effect.kind !== 'element_status' && (
            <label>
              <T k="setup.events.hazard_label" />
              <select value={effect.hazard ?? ''} onChange={(event) => setEffect(effect.id, { hazard: event.target.value || null })}>
                {game.hazards.map((hazard) => (
                  <option key={hazard.id} value={hazard.name}>
                    {hazard.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          {effect.kind !== 'hazard_probability' && (
            <label>
              <T k="setup.events.element_label" />
              <select value={effect.element ?? ''} onChange={(event) => setEffect(effect.id, { element: event.target.value || null })}>
                {effect.kind === 'element_status' && <option value="">{t('setup.events.all_elements')}</option>}
                {game.elements.map((element) => (
                  <option key={element.id} value={element.name}>
                    {element.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            <T k={mandatory ? 'setup.events.penalty_label' : 'setup.events.change_label'} />
            <select value={effect.delta} onChange={(event) => setEffect(effect.id, { delta: Number(event.target.value) })}>
              {(mandatory ? PENALTIES : DELTAS).map((delta) => (
                <option key={delta} value={delta}>
                  {signed(delta)}
                </option>
              ))}
            </select>
          </label>
          {!mandatory && draft.effects.length > 1 && (
            <button
              type="button"
              className="btn btn--tiny"
              onClick={() => onChange({ effects: draft.effects.filter((item) => item.id !== effect.id) })}
            >
              <T k="setup.events.remove_effect" />
            </button>
          )}
        </fieldset>
      ))}

      {!mandatory && draft.effects.length < 20 && (
        <button
          type="button"
          className="btn btn--soft btn--small"
          onClick={() =>
            onChange({
              effects: [
                ...draft.effects,
                { id: newDraftId(), kind: 'hazard_probability', hazard: game.hazards[0]?.name ?? null, element: null, delta: 1 },
              ],
            })
          }
        >
          <T k="setup.events.add_effect" />
        </button>
      )}
    </div>
  );
}

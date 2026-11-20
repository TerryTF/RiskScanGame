import { useId, useState } from 'react';
import type { Catalogue, CreateGameRequest } from '../../api/types';
import { T, useT } from '../../texts';
import { ScopeField } from './ScopeField';
import { StepActions } from './SetupFrame';

const SCOPE_OPTIONS = [
  'setup.start.scope_region',
  'setup.start.scope_city',
  'setup.start.scope_island',
  'setup.start.scope_coastline',
  'setup.start.scope_mountain_area',
  'setup.start.scope_national_park',
] as const;

interface StartStepProps {
  catalogue: Catalogue;
  busy: boolean;
  onCreate: (request: CreateGameRequest) => void;
}

/** Step 1: the destination, its geographic scope and the number of regular rounds. */
export function StartStep({ catalogue, busy, onCreate }: StartStepProps) {
  const { regular_rounds: roundOptions, default_regular_rounds: defaultRounds } = catalogue.limits;
  const t = useT();
  const scopeId = useId();
  const suggestions = SCOPE_OPTIONS.map((key) => t(key));
  const defaultScope = t('setup.start.scope_region');
  const [destination, setDestination] = useState('');
  const [scope, setScope] = useState(() => t('setup.start.scope_region'));
  const [rounds, setRounds] = useState(defaultRounds);

  const ready = destination.trim().length > 0 && scope.trim().length > 0;
  const submit = () =>
    onCreate({ destination_name: destination.trim(), geographic_scope: scope.trim(), total_rounds: rounds });

  return (
    <div className="start-grid">
      <form
        className="setup-card start-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (ready && !busy) submit();
        }}
      >
        <label>
          <span className="kicker">
            <T k="setup.start.destination_label" />
          </span>
          <input
            value={destination}
            maxLength={120}
            placeholder={t('setup.start.destination_placeholder')}
            autoFocus
            onChange={(event) => setDestination(event.target.value)}
          />
        </label>
        <div className="start-form__row">
          <div>
            <label className="kicker" htmlFor={scopeId}>
              <T k="setup.start.scope_label" />
            </label>
            <ScopeField
              id={scopeId}
              value={scope}
              suggestions={suggestions}
              defaultValue={defaultScope}
              onChange={setScope}
            />
          </div>
          <label>
            <span className="kicker">
              <T k="setup.start.rounds_label" />
            </span>
            <select value={rounds} onChange={(event) => setRounds(Number(event.target.value))}>
              {roundOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <StepActions onNext={submit} nextLabel={<T k="setup.start.save" />} nextDisabled={!ready} busy={busy} />
      </form>

      <aside className="mint-panel" aria-label={t('setup.start.about_label')}>
        <p className="mint-panel__title">
          <T k="setup.start.about_title" />
        </p>
        <p>
          <T k="setup.start.about_text" />
        </p>
        <p className="muted">
          <T k="setup.start.practice_note" />
        </p>
      </aside>
    </div>
  );
}

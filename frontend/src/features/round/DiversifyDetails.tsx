import { useId } from 'react';
import type { Catalogue, GameState } from '../../api/types';
import { TeamBadge } from '../../components/Tokens';
import { elementName, orderedTeams } from '../../lib/derive';
import { T, useT, type Translate } from '../../texts';
import {
  describeMarkerChoices,
  draftProblem,
  markerOptions,
  markerValue,
  nameProblem,
  parseMarkerValue,
  unusedCatalogueElements,
  type DiversifyDraft,
  type MarkerOption,
} from './diversify';

interface DiversifyDetailsProps {
  game: GameState;
  catalogue: Catalogue;
  draft: DiversifyDraft;
  onChange: (draft: DiversifyDraft) => void;
}

function optionLabel(game: GameState, option: MarkerOption, t: Translate): string {
  const element = elementName(game, option.elementId);
  return option.change === 'split'
    ? t('round.diversify.option_split', { element })
    : t('round.diversify.option_move', { size: option.size, element });
}

/** The moderator names the new element, fills its vulnerability row and records each team's marker choice. */
export function DiversifyDetails({ game, catalogue, draft, onChange }: DiversifyDetailsProps) {
  const t = useT();
  const { limits } = catalogue;
  const { vulnerability_min: min, vulnerability_max: max } = limits;
  const suggestions = useId();
  const problem = draftProblem(game, draft, limits, t);
  const clash = draft.name.trim() !== '' ? nameProblem(game, draft, t) : null;
  const choices = describeMarkerChoices(game, draft, t);

  const setVulnerability = (hazardId: number, raw: string) => {
    const digit = raw.slice(-1);
    const next = new Map(draft.vulnerabilities);
    if (digit === '') next.delete(hazardId);
    else if (/^[0-9]$/.test(digit) && Number(digit) >= min && Number(digit) <= max) next.set(hazardId, Number(digit));
    else return;
    onChange({ ...draft, vulnerabilities: next });
  };

  return (
    <div className="diversify">
      <div className="diversify__head">
        <label>
          <T k="round.diversify.name_label" />
          <input
            type="text"
            list={suggestions}
            maxLength={120}
            autoComplete="off"
            placeholder={t('round.diversify.name_placeholder')}
            value={draft.name}
            onChange={(event) => onChange({ ...draft, name: event.target.value })}
          />
          <datalist id={suggestions}>
            {unusedCatalogueElements(game, catalogue).map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </label>
        <label>
          <T k="round.diversify.status_label" />
          <input
            type="number"
            min={0}
            max={limits.starting_status}
            step={1}
            inputMode="numeric"
            value={draft.status ?? ''}
            onChange={(event) =>
              onChange({ ...draft, status: event.target.value === '' ? null : Number(event.target.value) })
            }
          />
        </label>
      </div>
      {clash && <p className="field-error">{clash}</p>}
      <p className="muted">
        <T
          k="round.diversify.status_note"
          vars={{ start: limits.diversification_status, usual: limits.starting_status }}
        />
      </p>

      <fieldset>
        <legend>
          <T k="round.diversify.vulnerability_legend" />
        </legend>
        <div className="diversify__hazards">
          {game.hazards.map((hazard) => (
            <label key={hazard.id}>
              {hazard.name}
              <input
                inputMode="numeric"
                autoComplete="off"
                maxLength={1}
                placeholder={'\u2013'}
                aria-label={t('round.diversify.vulnerability_label', { hazard: hazard.name })}
                value={draft.vulnerabilities.get(hazard.id) ?? ''}
                onChange={(event) => setVulnerability(hazard.id, event.target.value)}
              />
            </label>
          ))}
        </div>
        <p className="muted">
          <T k="round.diversify.vulnerability_scale" vars={{ min, max }} />
        </p>
      </fieldset>

      <fieldset>
        <legend>
          <T k="round.diversify.markers_legend" />
        </legend>
        <p className="muted">
          <T k="round.diversify.markers_help" />
        </p>
        {orderedTeams(game).map((team) => {
          const choice = draft.markers[team.role];
          return (
            <label key={team.id} className="diversify__team">
              <TeamBadge role={team.role} size={22} />
              <select
                aria-label={t('round.diversify.marker_choice', { team: team.name })}
                value={choice ? markerValue(choice) : ''}
                onChange={(event) =>
                  onChange({ ...draft, markers: { ...draft.markers, [team.role]: parseMarkerValue(event.target.value) } })
                }
              >
                <option value="">{t('round.diversify.keep_markers')}</option>
                {markerOptions(team).map((option) => (
                  <option key={option.value} value={option.value}>
                    {optionLabel(game, option, t)}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </fieldset>

      {choices.length > 0 && <p className="target-picker__preview">{choices.join('. ')}.</p>}
      <p className={`funding__status${problem ? '' : ' is-ready'}`} aria-live="polite">
        {problem ?? t('round.diversify.ready')}
      </p>
    </div>
  );
}

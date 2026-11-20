import { useState, type ReactNode } from 'react';
import type { PaymentInput, ResourceType, Team } from '../../api/types';
import { RESOURCE_TYPES } from '../../api/types';
import { RESOURCE_ICON } from '../../assets/icons';
import { TeamBadge } from '../../components/Tokens';
import { costSummary, type Cost } from '../../components/Tokens';
import { resourceKey } from '../../lib/format';
import { T, useT } from '../../texts';
import { checkPayment, toPayments, type Amounts } from './payment';

interface FundingFormProps {
  cost: Cost;
  teams: Team[];
  disabled?: boolean;
  submitLabel: ReactNode;
  onSubmit: (payments: PaymentInput[]) => void;
}

/** The moderator records which teams pay and with what. Each team can only pay what it holds. */
export function FundingForm({ cost, teams, disabled, submitLabel, onSubmit }: FundingFormProps) {
  const [amounts, setAmounts] = useState<Amounts>({});
  const t = useT();
  const check = checkPayment(cost, amounts, t);

  const set = (team: Team, resource: ResourceType, raw: string) => {
    const balance = team.resources[resource];
    const value = Math.min(balance, Math.max(0, Math.trunc(Number(raw) || 0)));
    setAmounts((current) => ({ ...current, [team.role]: { ...current[team.role], [resource]: value } }));
  };

  return (
    <form
      className="funding"
      onSubmit={(event) => {
        event.preventDefault();
        if (check.valid && !disabled) onSubmit(toPayments(amounts));
      }}
    >
      <p className="funding__cost">
        <T k="round.funding.cost" vars={{ cost: costSummary(cost, t) }} />
      </p>
      <table className="funding__table">
        <caption className="sr-only">
          <T k="round.funding.caption" />
        </caption>
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">
                <T k="round.funding.team_header" />
              </span>
            </th>
            {RESOURCE_TYPES.map((resource) => {
              const Icon = RESOURCE_ICON[resource];
              return (
                <th key={resource} scope="col" title={t(resourceKey(resource))}>
                  <Icon size={24} title={t(resourceKey(resource))} />
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {teams.map((team) => (
            <tr key={team.id}>
              <th scope="row">
                <TeamBadge role={team.role} size={22} />
              </th>
              {RESOURCE_TYPES.map((resource) => {
                const balance = team.resources[resource];
                const name = t(resourceKey(resource)).toLowerCase();
                return (
                  <td key={resource}>
                    {balance === 0 ? (
                      <span className="funding__none" aria-label={t('round.funding.no_resource', { team: team.name, resource: name })}>
                        &ndash;
                      </span>
                    ) : (
                      <label className="funding__cell">
                        <span className="sr-only">
                          <T k="round.funding.pays" vars={{ team: team.name, resource: name, balance }} />
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={balance}
                          inputMode="numeric"
                          value={amounts[team.role]?.[resource] ?? 0}
                          onChange={(event) => set(team, resource, event.target.value)}
                        />
                        <span className="funding__balance" aria-hidden="true">
                          /{balance}
                        </span>
                      </label>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className={`funding__status${check.valid ? ' is-ready' : ''}`} role="status">
        {check.message}
      </p>
      <button type="submit" className="btn btn--primary" disabled={!check.valid || disabled}>
        {submitLabel}
      </button>
    </form>
  );
}

import type { ReactNode } from 'react';
import type { Resources, TeamRole } from '../api/types';
import { RESOURCE_TYPES } from '../api/types';
import { RESOURCE_ICON, TEAM_ICON, WildIcon } from '../assets/icons';
import { resourceKey, roleKey } from '../lib/format';
import { T, useT, type Translate } from '../texts';

export function TeamBadge({ role, size = 28 }: { role: TeamRole; size?: number }) {
  const Icon = TEAM_ICON[role];
  return (
    <span className={`team-badge team--${role}`}>
      <Icon size={size} />
      <span className="team-badge__name">
        <T k={roleKey(role)} />
      </span>
    </span>
  );
}

export interface TokenRow {
  role: TeamRole;
  resources: Resources;
}

/** Each team's money, knowledge and authority tokens, as in the storyboard's resource panel. */
export function ResourceTokens({ rows, caption }: { rows: TokenRow[]; caption?: ReactNode }) {
  return (
    <div className="tokens-wrap">
      <table className="tokens">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            <th scope="col">
              <span className="sr-only">
                <T k="board.tokens.team" />
              </span>
            </th>
            {rows.map((row) => (
              <th key={row.role} scope="col" className="tokens__team">
                <TeamBadge role={row.role} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row">
              <span className="sr-only">
                <T k="board.tokens.resources" />
              </span>
            </th>
            {rows.map((row) => (
              <td key={row.role} className="tokens__value">
                <span className="tokens__count-grid">
                  {RESOURCE_TYPES.filter((resource) => row.resources[resource] > 0).map((resource) => {
                    const Icon = RESOURCE_ICON[resource];
                    const amount = row.resources[resource];
                    return (
                      <span key={resource} className="tokens__count">
                        {amount}
                        <span aria-hidden="true">×</span>
                        <Icon size={22} />
                      </span>
                    );
                  })}
                </span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <ul className="tokens__legend">
        {RESOURCE_TYPES.map((resource) => {
          const Icon = RESOURCE_ICON[resource];
          return (
            <li key={resource} className="tokens__legend-item">
              <Icon size={20} />
              <span>
                <T k={resourceKey(resource)} />
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export interface Cost {
  money: number;
  knowledge: number;
  authority: number;
  wild: number;
}

/** For example "2 money + 1 wild". Pass `t` from `useT()` so edited wording is used. */
export function costSummary(cost: Cost, t: Translate): string {
  const parts = RESOURCE_TYPES.filter((resource) => cost[resource] > 0).map((resource) =>
    t(`board.cost.${resource}`, { count: cost[resource] }),
  );
  if (cost.wild > 0) parts.push(t('board.cost.wild', { count: cost.wild }));
  return parts.join(' + ');
}

export function costTotal(cost: Cost): number {
  return cost.money + cost.knowledge + cost.authority + cost.wild;
}

/** Token icons with counts. "Wild" is the empty circle: any resource may pay it. */
export function CostRow({ cost }: { cost: Cost }) {
  const t = useT();
  return (
    <div className="cost-row" role="img" aria-label={t('board.cost.aria', { cost: costSummary(cost, t) })}>
      {RESOURCE_TYPES.filter((resource) => cost[resource] > 0).map((resource) => {
        const Icon = RESOURCE_ICON[resource];
        return (
          <span key={resource} className="cost-row__item" aria-hidden="true">
            <Icon size={26} />
            <span>&times;{cost[resource]}</span>
          </span>
        );
      })}
      {cost.wild > 0 && (
        <span className="cost-row__item" aria-hidden="true">
          <WildIcon size={26} />
          <span>&times;{cost.wild}</span>
        </span>
      )}
    </div>
  );
}

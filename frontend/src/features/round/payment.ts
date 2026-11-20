import type { PaymentInput, Resources, ResourceType, TeamRole } from '../../api/types';
import { RESOURCE_TYPES } from '../../api/types';
import { costTotal, type Cost } from '../../components/Tokens';
import { resourceKey } from '../../lib/format';
import type { Translate } from '../../texts';

/** How much each team contributes, by resource. Missing entries count as 0. */
export type Amounts = Partial<Record<TeamRole, Partial<Record<ResourceType, number>>>>;

export interface PaymentCheck {
  paid: Resources;
  total: number;
  required: number;
  valid: boolean;
  message: string;
}

export function paidResources(amounts: Amounts): Resources {
  const paid: Resources = { money: 0, knowledge: 0, authority: 0 };
  for (const byResource of Object.values(amounts)) {
    for (const resource of RESOURCE_TYPES) paid[resource] += byResource?.[resource] ?? 0;
  }
  return paid;
}

/**
 * Whether the contributions pay the action exactly. The API enforces the same rule (the named parts must be covered
 * and the total must match the cost); checking here keeps the Apply button honest and explains what is missing.
 */
export function checkPayment(cost: Cost, amounts: Amounts, t: Translate): PaymentCheck {
  const paid = paidResources(amounts);
  const total = paid.money + paid.knowledge + paid.authority;
  const required = costTotal(cost);
  const short = RESOURCE_TYPES.find((resource) => paid[resource] < cost[resource]);

  let message: string;
  if (total > required) message = t('round.funding.too_much', { required, excess: total - required });
  else if (short) {
    const resource = t(resourceKey(short)).toLowerCase();
    message = t('round.funding.needs_more', { amount: cost[short] - paid[short], resource });
  } else if (total < required) message = t('round.funding.pay_more', { amount: required - total });
  else message = t('round.funding.ready', { total, required });

  return { paid, total, required, valid: total === required && !short, message };
}

export function toPayments(amounts: Amounts): PaymentInput[] {
  return (Object.entries(amounts) as [TeamRole, Partial<Record<ResourceType, number>>][])
    .map(([team, byResource]) => ({
      team,
      money: byResource.money ?? 0,
      knowledge: byResource.knowledge ?? 0,
      authority: byResource.authority ?? 0,
    }))
    .filter((payment) => payment.money + payment.knowledge + payment.authority > 0);
}

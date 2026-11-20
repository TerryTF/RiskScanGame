import { describe, expect, it } from 'vitest';
import { defaultTexts } from '../../texts';
import { checkPayment, toPayments } from './payment';

const prediction = { money: 0, knowledge: 1, authority: 0, wild: 1 };
const adaptation = { money: 1, knowledge: 1, authority: 2, wild: 0 };

describe('checkPayment', () => {
  it('accepts a payment that covers the named part and the wild part exactly', () => {
    const check = checkPayment(
      prediction,
      { civil_society: { knowledge: 1 }, tourism_industry: { money: 1 } },
      defaultTexts.t,
    );
    expect(check).toMatchObject({ valid: true, total: 2, required: 2 });
  });

  it('accepts wild paid with the same resource as the named part', () => {
    expect(checkPayment(prediction, { civil_society: { knowledge: 2 } }, defaultTexts.t).valid).toBe(true);
  });

  it('asks for the missing named resource first', () => {
    const check = checkPayment(prediction, { tourism_industry: { money: 2 } }, defaultTexts.t);
    expect(check.valid).toBe(false);
    expect(check.message).toBe('Needs 1 more knowledge.');
  });

  it('asks for more when only the wild part is unpaid', () => {
    const check = checkPayment(prediction, { civil_society: { knowledge: 1 } }, defaultTexts.t);
    expect(check.message).toBe('Pay 1 more of any resource (wild).');
  });

  it('rejects an overpayment because the cost is exact', () => {
    const check = checkPayment(
      adaptation,
      { local_government: { money: 1, authority: 2 }, civil_society: { knowledge: 2 } },
      defaultTexts.t,
    );
    expect(check.valid).toBe(false);
    expect(check.message).toContain('Remove 1');
  });

  it('adds up the same resource across teams', () => {
    const check = checkPayment(
      adaptation,
      { local_government: { money: 1, authority: 1 }, tourism_industry: { authority: 1 }, civil_society: { knowledge: 1 } },
      defaultTexts.t,
    );
    expect(check.valid).toBe(true);
  });
});

describe('toPayments', () => {
  it('lists only the teams that pay, with every resource filled in', () => {
    expect(
      toPayments({ local_government: { money: 1 }, civil_society: { knowledge: 0 }, tourism_industry: { authority: 2 } }),
    ).toEqual([
      { team: 'local_government', money: 1, knowledge: 0, authority: 0 },
      { team: 'tourism_industry', money: 0, knowledge: 0, authority: 2 },
    ]);
  });
});

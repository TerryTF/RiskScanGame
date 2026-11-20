import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { makeGame } from '../../test/fixtures';
import { FundingForm } from './FundingForm';

const prediction = { money: 0, knowledge: 1, authority: 0, wild: 1 };

function setup(cost = prediction) {
  const onSubmit = vi.fn();
  render(
    <FundingForm cost={cost} teams={makeGame().teams} submitLabel="Apply action" onSubmit={onSubmit} />,
  );
  return { onSubmit, user: userEvent.setup(), apply: screen.getByRole('button', { name: 'Apply action' }) };
}

describe('FundingForm', () => {
  it('keeps the action disabled and says what is missing until the payment is exact', async () => {
    const { user, apply } = setup();
    expect(apply).toBeDisabled();
    expect(screen.getByRole('status')).toHaveTextContent('Needs 1 more knowledge.');

    await user.type(screen.getByLabelText(/Civil Society pays knowledge/), '1');
    expect(screen.getByRole('status')).toHaveTextContent('Pay 1 more of any resource (wild).');
    expect(apply).toBeDisabled();

    await user.type(screen.getByLabelText(/Tourism Industry pays money/), '1');
    expect(screen.getByRole('status')).toHaveTextContent('Ready: 2 of 2 paid.');
    expect(apply).toBeEnabled();
  });

  it('submits who pays what', async () => {
    const { user, apply, onSubmit } = setup();
    await user.type(screen.getByLabelText(/Civil Society pays knowledge/), '1');
    await user.type(screen.getByLabelText(/Tourism Industry pays money/), '1');

    await user.click(apply);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toEqual(
      expect.arrayContaining([
        { team: 'civil_society', money: 0, knowledge: 1, authority: 0 },
        { team: 'tourism_industry', money: 1, knowledge: 0, authority: 0 },
      ]),
    );
  });

  it('never lets a team pay more than it holds', async () => {
    const { user } = setup();
    const money = screen.getByLabelText(/Local Government pays money \(has 2\)/);

    await user.type(money, '5');

    expect(money).toHaveValue(2);
  });

  it('offers no input for a resource a team does not have', () => {
    setup();
    expect(screen.queryByLabelText(/Local Government pays knowledge/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Local Government has no knowledge')).toBeInTheDocument();
  });

  it('rejects paying more than the cost', async () => {
    const { user, apply } = setup();
    await user.type(screen.getByLabelText(/Civil Society pays knowledge/), '3');
    expect(screen.getByRole('status')).toHaveTextContent('Too much');
    expect(apply).toBeDisabled();
  });
});

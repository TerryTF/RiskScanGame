import { act, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CELEBRATION_SECONDS } from '../lib/confetti';
import { Celebration } from './Celebration';

describe('Celebration', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('shows confetti that assistive technology ignores, then removes it when the show is over', () => {
    render(<Celebration />);

    const overlay = document.querySelector('.celebration');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(overlay?.querySelectorAll('.confetti').length).toBeGreaterThan(50);

    act(() => {
      vi.advanceTimersByTime(CELEBRATION_SECONDS * 1000 - 1);
    });
    expect(document.querySelector('.celebration')).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(document.querySelector('.celebration')).not.toBeInTheDocument();
  });

  it('leaves nothing behind when it is removed early', () => {
    const { unmount } = render(<Celebration />);
    unmount();
    expect(document.querySelector('.celebration')).not.toBeInTheDocument();
    expect(vi.getTimerCount()).toBe(0);
  });
});

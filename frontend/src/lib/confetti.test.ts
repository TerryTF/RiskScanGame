import { describe, expect, it } from 'vitest';
import { CELEBRATION_SECONDS, confettiPieces } from './confetti';

describe('confettiPieces', () => {
  it('has every piece off the screen before the celebration ends, so nothing is cut off', () => {
    const latest = Math.max(...confettiPieces().map((piece) => piece.endsAt));
    expect(latest).toBeLessThanOrEqual(CELEBRATION_SECONDS);
  });

  it('shoots both poppers inwards from the bottom corners and rains from the top', () => {
    const pieces = confettiPieces();
    const dx = (kind: string) => pieces.filter((piece) => piece.kind === kind).map((piece) => parseFloat(piece.vars['--dx']));

    expect(dx('pop-left').length).toBeGreaterThan(0);
    expect(dx('pop-left').every((value) => value > 0)).toBe(true);
    expect(dx('pop-right').length).toBeGreaterThan(0);
    expect(dx('pop-right').every((value) => value < 0)).toBe(true);
    expect(pieces.some((piece) => piece.kind === 'rain')).toBe(true);
  });

  it('gives the same pieces every time, so rendering stays pure', () => {
    expect(confettiPieces()).toEqual(confettiPieces());
  });
});

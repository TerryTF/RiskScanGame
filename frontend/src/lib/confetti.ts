/** How long the celebration stays on screen. Every piece has left the screen by then. */
export const CELEBRATION_SECONDS = 6;

const POPS_PER_SIDE = 26;
const RAIN_PIECES = 44;

export type ConfettiKind = 'pop-left' | 'pop-right' | 'rain';

export interface ConfettiPiece {
  kind: ConfettiKind;
  /** A round dot instead of a strip. */
  dot: boolean;
  /** Seconds after the celebration starts at which the piece has left the screen. */
  endsAt: number;
  /** CSS custom properties read by the keyframes in styles/celebration.css. */
  vars: Record<string, string>;
}

/** A repeatable stand-in for Math.random(), so the confetti is the same on every render and nothing impure runs while rendering. */
function rand(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

const between = (seed: number, min: number, max: number) => min + rand(seed) * (max - min);
const tidy = (value: number) => String(Math.round(value * 100) / 100);

function makePiece(kind: ConfettiKind, n: number): ConfettiPiece {
  const r = (slot: number) => n * 9 + slot;
  const dot = rand(r(9)) < 0.3;
  const spin = (rand(r(8)) < 0.5 ? -1 : 1) * between(r(7), 360, 1080);
  const vars: Record<string, string> = {
    '--w': `${tidy(between(r(6), 7, 13))}px`,
    '--spin': `${tidy(spin)}deg`,
  };

  let delay: number;
  let duration: number;
  if (kind === 'rain') {
    delay = between(r(3), 0.2, 1.6);
    duration = between(r(4), 2.8, 4.2);
    vars['--left'] = `${tidy(between(r(1), 0, 100))}%`;
    // The rain sways from side to side by --dx, once every --sway seconds, while it falls.
    vars['--dx'] = `${tidy(between(r(2), 1.5, 4.5))}vw`;
    vars['--sway'] = `${tidy(between(r(5), 1.1, 2))}s`;
  } else {
    // Like a party popper: faster pieces fly higher and farther, and the right-hand popper shoots towards the left.
    const speed = between(r(1), 0.45, 1);
    const direction = kind === 'pop-left' ? 1 : -1;
    delay = between(r(3), 0, 0.35);
    duration = between(r(4), 2.6, 3.8);
    vars['--dx'] = `${tidy(direction * speed * between(r(2), 30, 62))}vw`;
    vars['--rise'] = `${tidy(speed * between(r(5), 55, 85))}vh`;
    // Below the corner where it was shot from, so the piece ends off screen.
    vars['--drop'] = '30vh';
  }
  vars['--delay'] = `${tidy(delay)}s`;
  vars['--dur'] = `${tidy(duration)}s`;
  return { kind, dot, endsAt: delay + duration, vars };
}

/** Party poppers in both bottom corners plus confetti raining from the top. The same pieces every time. */
export function confettiPieces(): ConfettiPiece[] {
  const pieces: ConfettiPiece[] = [];
  const add = (kind: ConfettiKind, count: number) => {
    for (let i = 0; i < count; i += 1) pieces.push(makePiece(kind, pieces.length));
  };
  add('pop-left', POPS_PER_SIDE);
  add('pop-right', POPS_PER_SIDE);
  add('rain', RAIN_PIECES);
  return pieces;
}

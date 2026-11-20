import { useEffect, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CELEBRATION_SECONDS, confettiPieces } from '../lib/confetti';

const PIECES = confettiPieces();

/**
 * A one-off confetti show: party poppers in both bottom corners and confetti raining from the top.
 * It is purely decorative (hidden from assistive technology, never blocks clicks), removes itself when it is over,
 * and styles/celebration.css switches it off for people who prefer reduced motion.
 */
export function Celebration() {
  const [over, setOver] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setOver(true), CELEBRATION_SECONDS * 1000);
    return () => window.clearTimeout(timer);
  }, []);

  if (over) return null;
  return createPortal(
    <div className="celebration" aria-hidden="true">
      {PIECES.map((piece, index) => (
        <span
          key={index}
          className={`confetti confetti--${piece.kind}${piece.dot ? ' confetti--dot' : ''}`}
          style={piece.vars as CSSProperties}
        />
      ))}
    </div>,
    document.body,
  );
}

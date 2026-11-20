import { useState } from 'react';
import { T, useT } from '../../texts';

interface SkipRoundZeroProps {
  disabled: boolean;
  onSkip: () => void;
}

/** Round 0 is optional practice. Skipping starts Round 1 straight away and cannot be undone, so it is confirmed first. */
export function SkipRoundZero({ disabled, onSkip }: SkipRoundZeroProps) {
  const [confirming, setConfirming] = useState(false);
  const t = useT();

  if (confirming) {
    return (
      <div className="confirm skip-round-zero" role="alertdialog" aria-label={t('round.skip.confirm_label')}>
        <p>
          <T k="round.skip.confirm_text" />
        </p>
        <button type="button" className="btn btn--primary" disabled={disabled} onClick={onSkip}>
          <T k="round.skip.confirm_yes" />
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setConfirming(false)}>
          <T k="round.skip.confirm_cancel" />
        </button>
      </div>
    );
  }

  return (
    <div className="skip-round-zero">
      <p className="muted">
        <T k="round.skip.note" />
      </p>
      <button type="button" className="btn btn--soft" disabled={disabled} onClick={() => setConfirming(true)}>
        <T k="round.skip.button" />
      </button>
    </div>
  );
}

import type { ReactNode } from 'react';
import { CheckIcon } from '../../assets/icons';

/** A checkbox drawn as a selectable row, as in the storyboard's catalogues. */
export function Choice({
  label,
  checked,
  disabled,
  onChange,
  tone = 'green',
  children,
}: {
  label: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  tone?: 'green' | 'red';
  /** Extra content on the right of the row, outside the label. */
  children?: ReactNode;
}) {
  return (
    <div className={`choice choice--${tone}${checked ? ' is-checked' : ''}${disabled ? ' is-disabled' : ''}`}>
      <label className="choice__main">
        <input type="checkbox" checked={checked} disabled={disabled} onChange={onChange} />
        <span className="choice__box" aria-hidden="true">
          {checked && <CheckIcon size={16} />}
        </span>
        <span className="choice__label">{label}</span>
      </label>
      {children}
    </div>
  );
}

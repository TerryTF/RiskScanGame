import { useEffect, useRef } from 'react';
import { placeholders } from '../../texts';

export type TextState = 'default' | 'saved' | 'draft';

export interface TextEntry {
  key: string;
  fallback: string;
  value: string;
  state: TextState;
}

interface TextPanelProps {
  entries: TextEntry[];
  selected: string | null;
  onSelect: (key: string) => void;
  onChange: (key: string, value: string, fallback: string) => void;
  empty: string;
}

const BADGE: Record<TextState, string | null> = { default: null, saved: 'Edited', draft: 'Unsaved' };

/** One field per text. Changes stay in the editor's draft until Save. */
export function TextPanel({ entries, selected, onSelect, onChange, empty }: TextPanelProps) {
  if (entries.length === 0) return <p className="muted editor-panel__empty">{empty}</p>;
  return (
    <ul className="text-fields">
      {entries.map((entry) => (
        <TextField
          key={entry.key}
          entry={entry}
          selected={entry.key === selected}
          onSelect={onSelect}
          onChange={onChange}
        />
      ))}
    </ul>
  );
}

function TextField({
  entry,
  selected,
  onSelect,
  onChange,
}: {
  entry: TextEntry;
  selected: boolean;
  onSelect: (key: string) => void;
  onChange: (key: string, value: string, fallback: string) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  const { key, fallback, value, state } = entry;
  const needed = placeholders(fallback);
  const missing = needed.filter((placeholder) => !value.includes(placeholder));
  const badge = BADGE[state];

  useEffect(() => {
    const element = field.current;
    if (!selected || !element || document.activeElement === element) return;
    element.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    element.focus({ preventScroll: true });
  }, [selected]);

  return (
    <li className={`text-field${selected ? ' text-field--selected' : ''}`}>
      <label className="text-field__label" htmlFor={`text-${key}`}>
        <code>{key}</code>
        {badge && <span className={`text-field__badge text-field__badge--${state}`}>{badge}</span>}
      </label>
      <textarea
        id={`text-${key}`}
        ref={field}
        value={value}
        rows={Math.min(6, Math.max(1, Math.ceil(value.length / 42)))}
        onFocus={() => onSelect(key)}
        onChange={(event) => onChange(key, event.target.value, fallback)}
      />
      {needed.length > 0 && (
        <p className="text-field__hint">
          The game fills in {needed.join(' ')}
          {missing.length > 0 && <strong> · missing: {missing.join(' ')}</strong>}
        </p>
      )}
      {value !== fallback && (
        <p className="text-field__default">
          <span>Default: {fallback || '(empty)'}</span>
          <button type="button" className="btn btn--tiny" onClick={() => onChange(key, fallback, fallback)}>
            Restore default
          </button>
        </p>
      )}
    </li>
  );
}

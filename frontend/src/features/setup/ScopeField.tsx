import { useState, type KeyboardEvent } from 'react';
import { T, useT } from '../../texts';

interface ScopeFieldProps {
  /** Id of the input, for its <label htmlFor>. */
  id: string;
  value: string;
  suggestions: string[];
  defaultValue: string;
  onChange: (value: string) => void;
}

/**
 * The geographic scope: pick a suggestion from the list that opens below the field, or type any other scope.
 * Replaces a <datalist>, whose popup browsers draw over the field and which never says that custom values are allowed.
 */
export function ScopeField({ id, value, suggestions, defaultValue, onChange }: ScopeFieldProps) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // Typing narrows the list; opening the list on an existing value shows every suggestion.
  const [filtering, setFiltering] = useState(false);

  const typed = value.trim();
  const query = filtering ? typed.toLowerCase() : '';
  const matches = suggestions.filter((suggestion) => suggestion.toLowerCase().includes(query));
  const custom = typed !== '' && !suggestions.some((suggestion) => suggestion.toLowerCase() === typed.toLowerCase());
  const options = custom && filtering ? [...matches, typed] : matches;
  const optionId = (index: number) => `${id}-option-${index}`;

  const show = () => {
    setOpen(true);
    setFiltering(false);
    setActive(-1);
  };
  const choose = (next: string) => {
    onChange(next);
    setOpen(false);
    setFiltering(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!open) return show();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((current) => (current + step + options.length) % Math.max(1, options.length));
    } else if (event.key === 'Enter' && open && active >= 0 && options[active] !== undefined) {
      event.preventDefault();
      choose(options[active]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="scope-field">
      <div className="scope-field__control">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-list`}
          aria-autocomplete="list"
          aria-describedby={`${id}-hint`}
          aria-activedescendant={open && active >= 0 ? optionId(active) : undefined}
          value={value}
          maxLength={120}
          autoComplete="off"
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
            setFiltering(true);
            setActive(-1);
          }}
          onFocus={show}
          onClick={() => !open && show()}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
        />
        <button
          type="button"
          className="scope-field__toggle"
          tabIndex={-1}
          aria-label={t(open ? 'setup.start.scope_hide' : 'setup.start.scope_show')}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (open ? setOpen(false) : show())}
        >
          <span aria-hidden="true">▾</span>
        </button>
        {open && (
          <div className="scope-field__popup">
            <ul id={`${id}-list`} role="listbox" aria-label={t('setup.start.scope_list_label')} className="scope-field__list">
              {options.map((option, index) => {
                const isCustom = custom && filtering && index === options.length - 1;
                const selected = option.toLowerCase() === typed.toLowerCase();
                return (
                  <li
                    key={isCustom ? `custom:${option}` : option}
                    id={optionId(index)}
                    role="option"
                    aria-selected={selected}
                    className={`scope-field__option${index === active ? ' is-active' : ''}`}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActive(index)}
                    onClick={() => choose(option)}
                  >
                    {isCustom ? (
                      <>
                        <T k="setup.start.scope_use_custom" vars={{ scope: option }} />{' '}
                        <span className="scope-field__tag">
                          <T k="setup.start.scope_custom_tag" />
                        </span>
                      </>
                    ) : (
                      <>
                        {option}
                        {option === defaultValue && (
                          <span className="scope-field__tag">
                            <T k="setup.start.scope_default_tag" />
                          </span>
                        )}
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="scope-field__note">
              <T k="setup.start.scope_note" />
            </p>
          </div>
        )}
      </div>
      <p id={`${id}-hint`} className="scope-field__hint">
        <T k="setup.start.scope_hint" vars={{ default: defaultValue }} />
      </p>
    </div>
  );
}

import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { DEFAULT_TEXTS, type TextKey } from './defaults';
import { fillTemplate, type TextVars } from './template';

/** Where the wording comes from: saved edits in a game, or the editor's unsaved draft in editor mode. */
export interface TextSource {
  /** The edited wording for a key, or undefined to use the default. */
  lookup: (key: string) => string | undefined;
  /** Editor mode: texts on the page are marked with a pen so they can be picked. */
  editing?: boolean;
  /** Editor mode: called for every text a screen uses, with its default wording. Must not update state synchronously. */
  onUse?: (key: string, fallback: string) => void;
  /** Editor mode: true when the text has an unsaved change. */
  isDraft?: (key: string) => boolean;
}

const DEFAULTS_ONLY: TextSource = { lookup: () => undefined };
const TextContext = createContext<TextSource>(DEFAULTS_ONLY);

export function TextProvider({ source, children }: { source: TextSource; children: ReactNode }) {
  return <TextContext.Provider value={source}>{children}</TextContext.Provider>;
}

function resolve(source: TextSource, key: string, fallback: string, vars?: TextVars): string {
  source.onUse?.(key, fallback);
  return fillTemplate(source.lookup(key) ?? fallback, vars);
}

export type Translate = (key: TextKey, vars?: TextVars) => string;
/** Texts whose default comes from game content, such as the catalogue's action card descriptions. */
export type CardTranslate = (key: string, fallback: string, vars?: TextVars) => string;

/** For text used as a plain string: attributes, `<option>` labels and helper functions. */
export function useT(): Translate {
  const source = useContext(TextContext);
  return useCallback((key, vars) => resolve(source, key, DEFAULT_TEXTS[key], vars), [source]);
}

export function useCardText(): CardTranslate {
  const source = useContext(TextContext);
  return useCallback((key, fallback, vars) => resolve(source, key, fallback, vars), [source]);
}

function Editable({ k, text }: { k: string; text: string }) {
  const source = useContext(TextContext);
  if (!source.editing) return <>{text}</>;
  return (
    <span className="text-edit" data-text-key={k} data-draft={source.isDraft?.(k) ? '' : undefined}>
      {text || '\u00a0'}
    </span>
  );
}

/** Editable screen text. In editor mode it can be picked on the page; otherwise it renders as plain text. */
export function T({ k, vars }: { k: TextKey; vars?: TextVars }) {
  const t = useT();
  return <Editable k={k} text={t(k, vars)} />;
}

/** Editable card text (see `cardKeys`); `fallback` is the catalogue's wording. */
export function CardText({ k, fallback, vars }: { k: string; fallback: string; vars?: TextVars }) {
  const text = useCardText();
  return <Editable k={k} text={text(k, fallback, vars)} />;
}

export interface Texts {
  t: Translate;
  card: CardTranslate;
}

/** Both translators, for helpers that build sentences from game data (see `lib/derive.ts`). */
export function useTexts(): Texts {
  const t = useT();
  const card = useCardText();
  return useMemo(() => ({ t, card }), [t, card]);
}

/** The shipped wording without any edits. Handy in tests and outside React. */
export const defaultTexts: Texts = {
  t: (key, vars) => fillTemplate(DEFAULT_TEXTS[key], vars),
  card: (_key, fallback, vars) => fillTemplate(fallback, vars),
};

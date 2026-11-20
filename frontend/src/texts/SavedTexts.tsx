import { useMemo, type ReactNode } from 'react';
import { useSavedTexts } from '../api/queries';
import { TextProvider, type TextSource } from './context';

/** Applies the wording saved in editor mode to every page. Waits for it so pages do not flash the default wording. */
export function SavedTextsProvider({ children }: { children: ReactNode }) {
  const texts = useSavedTexts();
  const saved = texts.data?.texts;
  const source = useMemo<TextSource>(() => ({ lookup: (key) => saved?.[key] }), [saved]);
  if (texts.isPending) return null;
  return <TextProvider source={source}>{children}</TextProvider>;
}

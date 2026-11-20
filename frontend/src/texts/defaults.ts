import { boardTexts } from './keys/board';
import { commonTexts } from './keys/common';
import { roundTexts } from './keys/round';
import { setupTexts } from './keys/setup';
import { startTexts } from './keys/start';

export const TEXT_MODULES = { commonTexts, startTexts, setupTexts, roundTexts, boardTexts };

/** The wording shipped with the app. Edited texts saved in editor mode replace these, key by key. */
export const DEFAULT_TEXTS = { ...commonTexts, ...startTexts, ...setupTexts, ...roundTexts, ...boardTexts };

export type TextKey = keyof typeof DEFAULT_TEXTS;

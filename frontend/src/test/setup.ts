import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  if (typeof localStorage !== 'undefined') localStorage.clear();
});

// jsdom does not lay pages out, so it has no scrollIntoView.
if (typeof Element !== 'undefined') Element.prototype.scrollIntoView ??= () => undefined;

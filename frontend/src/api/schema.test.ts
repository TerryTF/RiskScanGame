// @vitest-environment node
import { readFileSync } from 'node:fs';
import openapiTS, { astToString } from 'openapi-typescript';
import { describe, expect, it } from 'vitest';

describe('generated API types', () => {
  it('match backend/openapi.json (run `npm run api:types` after changing the API)', async () => {
    const spec = new URL('../../../backend/openapi.json', import.meta.url);
    const generated = astToString(await openapiTS(spec));
    const current = readFileSync(new URL('./schema.d.ts', import.meta.url), 'utf8');

    expect(current.trim().endsWith(generated.trim())).toBe(true);
  });
});

import { QueryClient } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { vi } from 'vitest';
import type { RiskScanClient } from '../api/client';
import { AppProviders } from '../providers';

const METHODS = [
  'catalogue',
  'getGame',
  'createGame',
  'setElements',
  'setHazards',
  'setVulnerabilities',
  'setTeams',
  'setEvents',
  'completeSetup',
  'setPriorities',
  'startRoundZero',
  'skipRoundZero',
  'runStep',
  'finishGame',
  'predict',
  'adapt',
  'invest',
  'diversify',
  'reduceEmissions',
  'getTexts',
  'saveTexts',
  'undoTexts',
  'sampleGame',
] as const;

/** An API client whose methods all fail loudly unless a test provides them, so unexpected calls never go unnoticed. */
export function fakeClient(overrides: Partial<RiskScanClient> = {}): RiskScanClient {
  const client = Object.fromEntries(
    METHODS.map((name) => [name, vi.fn(() => Promise.reject(new Error(`Unexpected API call: ${name}`)))]),
  ) as unknown as RiskScanClient;
  return Object.assign(client, overrides);
}

interface RenderOptions {
  client?: RiskScanClient;
  /** The URL to start at; `path` is the route pattern the element is mounted on. */
  route?: string;
  path?: string;
}

export function renderWithApp(ui: ReactElement, { client = fakeClient(), route = '/', path = '*' }: RenderOptions = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const result = render(
    <AppProviders client={client} queryClient={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route path={path} element={ui} />
        </Routes>
      </MemoryRouter>
    </AppProviders>,
  );
  return { client, queryClient, ...result };
}

import { createContext, useContext, type ReactNode } from 'react';
import type { RiskScanClient } from './client';

const ApiContext = createContext<RiskScanClient | null>(null);

export function ApiProvider({ client, children }: { client: RiskScanClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): RiskScanClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error('useApi must be used inside <ApiProvider>.');
  return client;
}

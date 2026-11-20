import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { createClient, type RiskScanClient } from './api/client';
import { ApiProvider } from './api/provider';

interface AppProvidersProps {
  /** Replace the API client, for example with a fake in tests. */
  client?: RiskScanClient;
  queryClient?: QueryClient;
  children: ReactNode;
}

export function AppProviders({ client, queryClient, children }: AppProvidersProps) {
  const [fallbackClient] = useState(() => createClient());
  const [fallbackQueryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient ?? fallbackQueryClient}>
      <ApiProvider client={client ?? fallbackClient}>{children}</ApiProvider>
    </QueryClientProvider>
  );
}

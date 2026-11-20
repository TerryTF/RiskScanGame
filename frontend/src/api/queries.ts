import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import type { RiskScanClient, RoundStep } from './client';
import { useApi } from './provider';
import type {
  AdaptRequest,
  DiversifyRequest,
  EventInput,
  GameState,
  HazardInput,
  InvestRequest,
  PaymentInput,
  PredictRequest,
  TeamInput,
  TeamPrioritiesInput,
  VulnerabilityInput,
} from './types';

export const catalogueKey = ['catalogue'] as const;
export const gameKey = (id: string) => ['game', id] as const;

export function useCatalogue() {
  const api = useApi();
  return useQuery({ queryKey: catalogueKey, queryFn: () => api.catalogue(), staleTime: Infinity });
}

/** The game state. Pass `pollMs` for views that must follow another screen, such as the participant board. */
export function useGame(id: string, pollMs: number | false = false) {
  const api = useApi();
  return useQuery({
    queryKey: gameKey(id),
    queryFn: () => api.getGame(id),
    refetchInterval: pollMs,
    retry: (count, error) => count < 2 && (error as { status?: number }).status !== 404,
  });
}

/**
 * Every moderator command. Each one stores the returned game state in the cache so all views update at once.
 * Commands never reject: they resolve to the new state, or to null after exposing the message as `error`.
 */
export function useGameCommands(id: string) {
  const api = useApi();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (run: (client: RiskScanClient) => Promise<GameState>) => run(api),
    onSuccess: (state) => queryClient.setQueryData(gameKey(id), state),
  });
  const { mutateAsync, reset } = mutation;

  const execute = useCallback(
    async (run: (client: RiskScanClient) => Promise<GameState>): Promise<GameState | null> => {
      try {
        return await mutateAsync(run);
      } catch {
        return null;
      }
    },
    [mutateAsync],
  );

  const commands = useMemo(
    () => ({
      setElements: (names: string[]) => execute((c) => c.setElements(id, names)),
      setHazards: (hazards: HazardInput[]) => execute((c) => c.setHazards(id, hazards)),
      setVulnerabilities: (cells: VulnerabilityInput[]) => execute((c) => c.setVulnerabilities(id, cells)),
      setTeams: (teams: TeamInput[]) => execute((c) => c.setTeams(id, teams)),
      setEvents: (events: EventInput[]) => execute((c) => c.setEvents(id, events)),
      completeSetup: () => execute((c) => c.completeSetup(id)),
      setPriorities: (teams: TeamPrioritiesInput[]) => execute((c) => c.setPriorities(id, teams)),
      startRoundZero: () => execute((c) => c.startRoundZero(id)),
      skipRoundZero: () => execute((c) => c.skipRoundZero(id)),
      runStep: (round: number, step: RoundStep) => execute((c) => c.runStep(id, round, step)),
      finishGame: () => execute((c) => c.finishGame(id)),
      predict: (body: PredictRequest) => execute((c) => c.predict(id, body)),
      adapt: (body: AdaptRequest) => execute((c) => c.adapt(id, body)),
      invest: (body: InvestRequest) => execute((c) => c.invest(id, body)),
      diversify: (body: DiversifyRequest) => execute((c) => c.diversify(id, body)),
      reduceEmissions: (payments: PaymentInput[]) => execute((c) => c.reduceEmissions(id, payments)),
    }),
    [execute, id],
  );

  return { ...commands, pending: mutation.isPending, error: mutation.error?.message ?? null, clearError: reset };
}

export type GameCommands = ReturnType<typeof useGameCommands>;

export const textsKey = ['texts'] as const;

/** Wording saved in editor mode. Errors fall back to the default wording rather than blocking the game. */
export function useSavedTexts() {
  const api = useApi();
  return useQuery({ queryKey: textsKey, queryFn: () => api.getTexts(), staleTime: 60_000, retry: 1 });
}

import type {
  AdaptRequest,
  Catalogue,
  CreateGameRequest,
  DiversifyRequest,
  EventInput,
  GameState,
  HazardInput,
  InvestRequest,
  PaymentInput,
  PredictRequest,
  SampleGame,
  SavedTexts,
  TeamInput,
  TeamPrioritiesInput,
  TextChanges,
  VulnerabilityInput,
} from './types';

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export type RoundStep =
  | 'allocate-resources'
  | 'close-actions'
  | 'resolve-hazards'
  | 'apply-event'
  | 'score'
  | 'complete';

export interface ClientOptions {
  /** Prefix for requests. Empty in the browser (the Vite dev server proxies /api); a full URL in scripts and tests. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

interface ValidationIssue {
  loc?: (string | number)[];
  msg?: string;
}

/** The API answers domain errors with a string `detail` and request validation errors with a list. */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    const detail = (body as { detail?: unknown } | null)?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return (detail as ValidationIssue[])
        .map((issue) => {
          const field = (issue.loc ?? []).filter((part) => part !== 'body').join('.');
          return field ? `${field}: ${issue.msg}` : String(issue.msg);
        })
        .join('; ');
    }
  } catch {
    // The body was not JSON; fall through to the generic message.
  }
  return `The request failed (${response.status}).`;
}

export function createClient(options: ClientOptions = {}) {
  const baseUrl = options.baseUrl ?? '';
  const send = options.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));

  async function request<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await send(`${baseUrl}/api/v1${path}`, {
        method,
        headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, 'Cannot reach the game server. Check that the backend is running.');
    }
    if (!response.ok) throw new ApiError(response.status, await readErrorMessage(response));
    return (await response.json()) as T;
  }

  const game = (id: string) => `/games/${encodeURIComponent(id)}`;

  return {
    catalogue: () => request<Catalogue>('GET', '/catalogue'),
    getGame: (id: string) => request<GameState>('GET', game(id)),
    createGame: (body: CreateGameRequest) => request<GameState>('POST', '/games', body),

    setElements: (id: string, names: string[]) =>
      request<GameState>('PUT', `${game(id)}/elements`, { elements: names.map((name) => ({ name })) }),
    setHazards: (id: string, hazards: HazardInput[]) =>
      request<GameState>('PUT', `${game(id)}/hazards`, { hazards }),
    setVulnerabilities: (id: string, vulnerabilities: VulnerabilityInput[]) =>
      request<GameState>('PUT', `${game(id)}/vulnerabilities`, { vulnerabilities }),
    setTeams: (id: string, teams: TeamInput[]) => request<GameState>('PUT', `${game(id)}/teams`, { teams }),
    setEvents: (id: string, events: EventInput[]) => request<GameState>('PUT', `${game(id)}/events`, { events }),
    completeSetup: (id: string) => request<GameState>('POST', `${game(id)}/setup/complete`),
    setPriorities: (id: string, teams: TeamPrioritiesInput[]) =>
      request<GameState>('PUT', `${game(id)}/priorities`, { teams }),

    startRoundZero: (id: string) => request<GameState>('POST', `${game(id)}/rounds/0/start`),
    skipRoundZero: (id: string) => request<GameState>('POST', `${game(id)}/rounds/0/skip`),
    runStep: (id: string, round: number, step: RoundStep) =>
      request<GameState>('POST', `${game(id)}/rounds/${round}/${step}`),
    finishGame: (id: string) => request<GameState>('POST', `${game(id)}/finish`),

    predict: (id: string, body: PredictRequest) => request<GameState>('POST', `${game(id)}/actions/predict`, body),
    adapt: (id: string, body: AdaptRequest) => request<GameState>('POST', `${game(id)}/actions/adapt`, body),
    invest: (id: string, body: InvestRequest) => request<GameState>('POST', `${game(id)}/actions/invest`, body),
    diversify: (id: string, body: DiversifyRequest) =>
      request<GameState>('POST', `${game(id)}/actions/diversify`, body),
    reduceEmissions: (id: string, payments: PaymentInput[]) =>
      request<GameState>('POST', `${game(id)}/actions/reduce-emissions`, { payments }),

    getTexts: () => request<SavedTexts>('GET', '/texts'),
    saveTexts: (texts: TextChanges) => request<SavedTexts>('PUT', '/texts', { texts }),
    undoTexts: () => request<SavedTexts>('POST', '/texts/undo'),
    sampleGame: () => request<SampleGame>('GET', '/editor/sample-game'),
  };
}

export type RiskScanClient = ReturnType<typeof createClient>;

import type {
  CommentState,
  CommentView,
  EventsResponse,
  CreateReviewRequest,
  CreateReviewResponse,
  DirectoryListing,
  HealthResponse,
  LatestFeedbackView,
  Page,
  RepoBranchesResponse,
  RepoCommitsResponse,
  RepositoriesResponse,
  RepositorySetting,
  ReviewSummary,
  ReviewView,
  ServiceSnapshotView,
  SubmitInput,
  SubmitResponse,
} from './types.js';
import type { DiffScope } from './types.js';

export type ApiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not-found'
  | 'validation'
  | 'conflict'
  | 'stale-review'
  | 'agent-busy'
  | 'daemon-unavailable'
  | 'rate-limited'
  | 'internal'
  | 'network'
  | 'invalid-response';

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;

  constructor(
    message: string,
    options: {
      status?: number;
      code?: ApiErrorCode;
      details?: Record<string, unknown>;
      requestId?: string;
    } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = options.status ?? 0;
    this.code = options.code ?? 'network';
    if (options.details !== undefined) this.details = options.details;
    if (options.requestId !== undefined) this.requestId = options.requestId;
  }
}

interface ErrorEnvelope {
  error?: {
    code?: string;
    message?: string;
    details?: Record<string, unknown>;
  };
}

export interface ApiClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  onUnauthorized?: (nextPath: string) => void;
  getCurrentPath?: () => string;
}

export interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: Record<string, string>;
  authenticated?: boolean;
}

export interface ListReviewsOptions {
  status?: 'open' | 'closed';
  limit?: number;
  offset?: number;
}

export interface EventsOptions {
  after?: number;
  signal?: AbortSignal;
}

function normalizeBase(baseUrl: string): string {
  return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function currentPath(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  return typeof value === 'object' && value !== null && 'error' in value;
}

export class ApiClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly onUnauthorized?: (nextPath: string) => void;
  private readonly getPath: () => string;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = normalizeBase(options.baseUrl ?? '');
    const injected = options.fetchImpl;
    this.fetchImpl = injected ?? ((input, init) => globalThis.fetch(input, init));
    this.onUnauthorized = options.onUnauthorized;
    this.getPath = options.getCurrentPath ?? currentPath;
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...options.headers,
    };
    let body: string | undefined;
    if (options.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        credentials: 'same-origin',
        ...(body === undefined ? {} : { body }),
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      if (error instanceof Error && error.name === 'AbortError') throw error;
      throw new ApiError('Cannot reach the review daemon', { code: 'network', status: 0 });
    }

    const requestId = response.headers.get('x-request-id') ?? undefined;
    if (response.status === 401) {
      const next = this.getPath();
      if (this.onUnauthorized !== undefined && !next.startsWith('/auth')) {
        this.onUnauthorized(next);
      }
      throw new ApiError('Authentication required', {
        status: 401,
        code: 'unauthorized',
        ...(requestId === undefined ? {} : { requestId }),
      });
    }

    const text = await response.text();
    let payload: unknown = null;
    if (text !== '') {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new ApiError('The daemon returned an invalid JSON response', {
          status: response.status,
          code: 'invalid-response',
          ...(requestId === undefined ? {} : { requestId }),
        });
      }
    }

    if (!response.ok) {
      const envelope = isErrorEnvelope(payload) ? payload : undefined;
      const error = envelope?.error;
      throw new ApiError(error?.message ?? `Request failed with ${response.status}`, {
        status: response.status,
        code: (error?.code as ApiErrorCode | undefined) ?? 'internal',
        ...(error?.details === undefined ? {} : { details: error.details }),
        ...(requestId === undefined ? {} : { requestId }),
      });
    }

    return payload as T;
  }

  async listReviews(options: ListReviewsOptions = {}): Promise<Page<ReviewSummary>> {
    const params = new URLSearchParams();
    if (options.status !== undefined) params.set('status', options.status);
    if (options.limit !== undefined) params.set('limit', String(options.limit));
    if (options.offset !== undefined) params.set('offset', String(options.offset));
    const query = params.toString();
    return this.request<Page<ReviewSummary>>(`/api/reviews${query === '' ? '' : `?${query}`}`);
  }

  async listRepositories(): Promise<RepositoriesResponse> {
    return this.request<RepositoriesResponse>('/api/settings/repositories');
  }

  async saveRepositories(repositories: RepositorySetting[]): Promise<RepositoriesResponse> {
    return this.request<RepositoriesResponse>('/api/settings/repositories', {
      method: 'PUT',
      body: { repositories },
    });
  }

  async listDirectories(path?: string, signal?: AbortSignal): Promise<DirectoryListing> {
    const params = new URLSearchParams();
    const trimmed = path?.trim();
    if (trimmed !== undefined && trimmed !== '') params.set('path', trimmed);
    const query = params.toString();
    return this.request<DirectoryListing>(`/api/fs/dirs${query === '' ? '' : `?${query}`}`, {
      ...(signal === undefined ? {} : { signal }),
    });
  }

  async listBranches(path: string, signal?: AbortSignal): Promise<RepoBranchesResponse> {
    const query = new URLSearchParams({ path });
    return this.request<RepoBranchesResponse>(`/api/repos/branches?${query.toString()}`, {
      ...(signal === undefined ? {} : { signal }),
    });
  }

  async listCommits(path: string, base: string, head: string): Promise<RepoCommitsResponse> {
    const query = new URLSearchParams({ path, base, head });
    return this.request<RepoCommitsResponse>(`/api/repos/commits?${query.toString()}`);
  }

  async createReview(input: CreateReviewRequest): Promise<CreateReviewResponse> {
    return this.request<CreateReviewResponse>('/api/reviews', { method: 'POST', body: input });
  }

  async getReview(id: string): Promise<ReviewView> {
    return this.request<ReviewView>(`/api/reviews/${encodeURIComponent(id)}`);
  }

  async getSnapshot(id: string, round: number, file?: string): Promise<ServiceSnapshotView> {
    const params = new URLSearchParams({ round: String(round) });
    if (file !== undefined) params.set('file', file);
    return this.request<ServiceSnapshotView>(
      `/api/reviews/${encodeURIComponent(id)}/snapshot?${params.toString()}`,
    );
  }

  async addComment(
    id: string,
    input: {
      body: string;
      path: string;
      side: 'old' | 'new';
      lineStart: number;
      lineEnd?: number;
      suggestion?: { original: string; replacement: string };
    },
  ): Promise<CommentView> {
    return this.request<CommentView>(`/api/reviews/${encodeURIComponent(id)}/comments`, {
      method: 'POST',
      body: input,
    });
  }

  async reply(id: string, commentId: string, body: string): Promise<CommentView> {
    return this.request<CommentView>(
      `/api/reviews/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}/replies`,
      { method: 'POST', body: { body } },
    );
  }

  async setCommentState(id: string, commentId: string, state: CommentState): Promise<CommentView> {
    return this.request<CommentView>(
      `/api/reviews/${encodeURIComponent(id)}/comments/${encodeURIComponent(commentId)}`,
      { method: 'PATCH', body: { state } },
    );
  }

  async submit(id: string, input: SubmitInput): Promise<SubmitResponse> {
    return this.request<SubmitResponse>(`/api/reviews/${encodeURIComponent(id)}/submit`, {
      method: 'POST',
      body: input,
    });
  }

  async refresh(id: string, scope?: DiffScope): Promise<ReviewView> {
    return this.request<ReviewView>(`/api/reviews/${encodeURIComponent(id)}/refresh`, {
      method: 'POST',
      body: scope === undefined ? {} : { scope },
    });
  }

  async latestFeedback(id: string): Promise<LatestFeedbackView> {
    return this.request<LatestFeedbackView>(`/api/reviews/${encodeURIComponent(id)}/feedback`);
  }

  async cancelAgent(id: string): Promise<void> {
    await this.request<{ ok: boolean }>(`/api/reviews/${encodeURIComponent(id)}/agent/cancel`, {
      method: 'POST',
    });
  }

  async events(id: string, options: EventsOptions = {}): Promise<EventsResponse> {
    const params = new URLSearchParams({
      wait: '25',
      ...(options.after === undefined ? {} : { after: String(options.after) }),
    });
    return this.request<EventsResponse>(
      `/api/reviews/${encodeURIComponent(id)}/events?${params.toString()}`,
      {
        headers: { accept: 'application/json' },
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );
  }

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/api/health');
  }

  async authenticate(token: string): Promise<void> {
    await this.request<{ ok: boolean }>('/api/auth', { method: 'POST', body: { token } });
  }

  async logout(): Promise<void> {
    await this.request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' });
  }
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  return new ApiClient(options);
}

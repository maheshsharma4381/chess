/** An API failure: status 0 means the request never reached a server. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, string>,
    /** No accounts server behind /api/v1 (not configured, or down). */
    readonly unavailable = false,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export type ApiInit = Omit<RequestInit, 'body'> & { json?: unknown };
export type Api = <T = unknown>(path: string, init?: ApiInit) => Promise<T>;
type FetchFn = (url: string, init?: RequestInit) => Promise<Response>;

export const API_PREFIX = '/api/v1';

/**
 * Calls apps/server through the web app's same-origin rewrite. A 401 triggers one shared
 * cookie refresh and a single retry; auth endpoints never refresh themselves.
 */
export function createApi(fetchFn: FetchFn = (url, init) => fetch(url, init)): Api {
  let refreshing: Promise<boolean> | null = null;

  const send = async (path: string, init: ApiInit): Promise<Response> => {
    const { json, headers, ...rest } = init;
    try {
      return await fetchFn(`${API_PREFIX}${path}`, {
        ...rest,
        credentials: 'same-origin',
        headers: {
          ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(headers as Record<string, string> | undefined),
        },
        ...(json === undefined ? {} : { body: JSON.stringify(json) }),
      });
    } catch {
      throw new ApiError(0, 'Could not reach the server', undefined, true);
    }
  };

  const refresh = () =>
    (refreshing ??= send('/auth/refresh', { method: 'POST' })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        refreshing = null;
      }));

  return async <T>(path: string, init: ApiInit = {}): Promise<T> => {
    let res = await send(path, init);
    if (res.status === 401 && !path.startsWith('/auth/') && (await refresh())) {
      res = await send(path, init);
    }
    if (res.status === 204) return undefined as T;
    const isJson = res.headers.get('Content-Type')?.includes('application/json');
    const body = isJson ? ((await res.json()) as Record<string, unknown>) : null;
    if (!res.ok) {
      // A 404 page instead of JSON means nothing answers at /api/v1.
      const unavailable = !isJson && (res.status === 404 || res.status >= 500);
      throw new ApiError(
        res.status,
        typeof body?.['error'] === 'string' ? body['error'] : `Request failed (${res.status})`,
        body?.['details'] as Record<string, string> | undefined,
        unavailable,
      );
    }
    return body as T;
  };
}

/** The app-wide client. */
export const api: Api = createApi();

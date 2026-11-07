import { API_BASE_URL } from '../config/env';
import { REQUEST_TIMEOUT_MS, SLOW_NOTICE_MS } from '../config/limits';
import type { ApiErrorBody } from './types';

/** Error devuelto por el API (formato uniforme del SAD §7.2). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields: Record<string, string> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Sin conexión o tiempo agotado (RNF-FIA-01). La pantalla ofrece 'Reintentar'. */
export class NetworkError extends Error {
  constructor(message = 'No hay conexión con el servidor. Revise su conexión e intente nuevamente.') {
    super(message);
    this.name = 'NetworkError';
  }
}

export const GENERIC_ERROR = 'No fue posible completar la operación. Intente nuevamente.';

export interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  /** Se invoca si la respuesta tarda más de SLOW_NOTICE_MS (arranque en frío). */
  onSlow?: () => void;
  timeoutMs?: number;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = Object.entries(query ?? {})
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `${API_BASE_URL}/api/v1${path}${params ? `?${params}` : ''}`;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);
  const slow = options.onSlow ? setTimeout(options.onSlow, SLOW_NOTICE_MS) : undefined;
  try {
    const response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    if (response.ok) return (await response.json()) as T;
    let body: ApiErrorBody | null = null;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      body = null;
    }
    // Nunca se muestran códigos ni trazas al usuario (RF-GEN-03).
    throw new ApiError(
      response.status,
      body?.error.code ?? 'INTERNAL_ERROR',
      body?.error.message ?? GENERIC_ERROR,
      body?.error.fields ?? {},
    );
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new NetworkError();
  } finally {
    clearTimeout(timeout);
    if (slow) clearTimeout(slow);
  }
}

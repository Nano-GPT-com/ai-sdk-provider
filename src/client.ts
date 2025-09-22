import { createNanoGPTRequestError, NanoGPTRequestError } from './errors';
import type { NanoGPTProviderOptions } from './types';

const DEFAULT_BASE_URL = 'https://nano-gpt.com/api/v1';
const DEFAULT_TIMEOUT = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export class NanoGPTClient {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly includeLegacyApiKeyHeader: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(options: NanoGPTProviderOptions) {
    if (!options.apiKey) {
      throw createNanoGPTRequestError({
        code: 'missing_api_key',
        message: 'An apiKey is required to use the NanoGPT provider.'
      });
    }

    this.apiKey = options.apiKey;
    this.baseURL = options.baseURL ?? DEFAULT_BASE_URL;
    this.defaultHeaders = {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...options.defaultHeaders
    };
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.includeLegacyApiKeyHeader = options.includeLegacyApiKeyHeader ?? true;
    this.fetchImpl = options.fetch ?? fetch;
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const url = this.resolveUrl(path);
    const headers = this.buildHeaders(init.headers);
    const externalSignal = init.signal as AbortSignal | undefined;
    const { signal: _ignoredSignal, ...restInit } = init;

    let lastError: unknown;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const unlink = linkExternalAbort(controller, externalSignal);
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await this.fetchImpl(url, {
          ...restInit,
          headers,
          signal: controller.signal
        });

        if (!response.ok) {
          const error = await this.buildError(response);
          if (this.shouldRetry(response.status, attempt)) {
            lastError = error;
            continue;
          }

          throw error;
        }

        if (response.status === 204) {
          return undefined as T;
        }

        const contentType = response.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          return (await response.json()) as T;
        }

        return (await response.text()) as unknown as T;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          const abortError = createNanoGPTRequestError({
            code: 'request_timeout',
            message: `Request to ${url} timed out after ${this.timeoutMs}ms.`
          });
          if (this.shouldRetry('abort', attempt)) {
            lastError = abortError;
            continue;
          }

          throw abortError;
        }

        if (error instanceof NanoGPTRequestError) {
          if (this.shouldRetry(error.status, attempt)) {
            lastError = error;
            continue;
          }

          throw error;
        }

        lastError = error;
      } finally {
        clearTimeout(timeoutId);
        unlink();
      }
    }

    if (lastError instanceof Error) {
      throw lastError;
    }

    throw createNanoGPTRequestError({
      code: 'request_failed',
      message: 'NanoGPT request failed after exhausting retries.',
      details: lastError
    });
  }

  async stream(path: string, init: RequestInit = {}): Promise<Response> {
    const url = this.resolveUrl(path);
    const headers = this.buildHeaders(init.headers);
    const externalSignal = init.signal as AbortSignal | undefined;
    const { signal: _ignoredSignal, ...restInit } = init;

    const controller = new AbortController();
    const unlink = linkExternalAbort(controller, externalSignal);
    const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        ...restInit,
        headers,
        signal: controller.signal
      });

      if (!response.ok) {
        throw await this.buildError(response);
      }

      return response;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw createNanoGPTRequestError({
          code: 'request_timeout',
          message: `Streaming request to ${url} timed out after ${this.timeoutMs}ms.`
        });
      }

      throw error;
    } finally {
      clearTimeout(timeoutId);
      unlink();
    }
  }

  private buildHeaders(overrides: RequestInit['headers']): HeadersInit {
    const headers = new Headers({ ...this.defaultHeaders });
    headers.set('Authorization', `Bearer ${this.apiKey}`);

    if (this.includeLegacyApiKeyHeader) {
      headers.set('x-api-key', this.apiKey);
    }

    if (overrides) {
      const entries = new Headers(overrides);
      entries.forEach((value, key) => {
        headers.set(key, value);
      });
    }

    return headers;
  }

  private resolveUrl(path: string): string {
    if (path.startsWith('http://') || path.startsWith('https://')) {
      return path;
    }

    return `${this.baseURL.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;
  }

  private shouldRetry(status: number | string | undefined, attempt: number): boolean {
    if (attempt >= this.maxRetries) {
      return false;
    }

    if (typeof status === 'number') {
      return RETRYABLE_STATUS.has(status);
    }

    return status === 'abort';
  }

  private async buildError(response: Response): Promise<NanoGPTRequestError> {
    const status = response.status;
    const contentType = response.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      try {
        const data = (await response.json()) as unknown;

            if (isRecord(data)) {
          const nested = (data as { error?: unknown }).error;
          if (isRecord(nested)) {
            const code = typeof nested.code === 'string' ? nested.code : typeof nested.type === 'string' ? nested.type : 'unknown_error';
            const message = typeof nested.message === 'string' ? nested.message : `Request failed with status ${status}.`;

            return createNanoGPTRequestError({
              code,
              message,
              details: { param: nested.param },
              status,
            });
          }

          const record = data as { code?: unknown; message?: unknown; details?: unknown };
          const code = typeof record.code === 'string' ? record.code : 'unknown_error';
          const message = typeof record.message === 'string' ? record.message : `Request failed with status ${status}.`;

          return createNanoGPTRequestError({
            code,
            message,
            details: record.details,
            status,
          });
        }
      } catch (error) {
        return createNanoGPTRequestError({
          code: 'invalid_error_payload',
          message: `Failed to parse error payload for status ${status}.`,
          details: error,
          status,
        });
      }
    }

    const message = await response.text();
    return createNanoGPTRequestError({
      code: 'http_error',
      message: message || `Request failed with status ${status}.`,
      details: { statusText: response.statusText },
      status
    });
  }
}

function linkExternalAbort(controller: AbortController, external?: AbortSignal) {
  if (!external) {
    return () => {};
  }

  if (external.aborted) {
    controller.abort(getAbortReason(external) ?? new DOMException('Aborted', 'AbortError'));
    return () => {};
  }

  const onAbort = () => {
    controller.abort(getAbortReason(external) ?? new DOMException('Aborted', 'AbortError'));
  };

  external.addEventListener('abort', onAbort, { once: true });

  return () => {
    external.removeEventListener('abort', onAbort);
  };
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getAbortReason(signal: AbortSignal): unknown {
  if ('reason' in signal) {
    return (signal as AbortSignal & { reason?: unknown }).reason;
  }

  return undefined;
}


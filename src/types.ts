export interface NanoGPTProviderOptions {
  /** API key issued by NanoGPT. */
  apiKey: string;
  /** Optional base URL override for private deployments. */
  baseURL?: string;
  /** Headers that should be sent with every request. */
  defaultHeaders?: Record<string, string>;
  /** Abort request after this many milliseconds. */
  timeoutMs?: number;
  /** Maximum number of automatic retries for retriable errors. */
  maxRetries?: number;
  /** Include the legacy `x-api-key` header alongside Authorization. Defaults to true. */
  includeLegacyApiKeyHeader?: boolean;
  /** Custom fetch implementation (e.g. edge runtime, testing). */
  fetch?: typeof fetch;
}

export type NanoGPTModelId = string;

export interface NanoGPTErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

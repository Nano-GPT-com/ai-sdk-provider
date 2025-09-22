import type { NanoGPTErrorPayload } from './types';

export class NanoGPTRequestError extends Error {
  readonly code: string;
  readonly details?: unknown;
  readonly status?: number;

  constructor(payload: NanoGPTErrorPayload & { status?: number }) {
    super(payload.message);
    this.name = 'NanoGPTRequestError';
    this.code = payload.code;
    this.details = payload.details;
    this.status = payload.status;
  }

  toJSON(): NanoGPTErrorPayload & { status?: number } {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
      status: this.status
    };
  }
}

export function createNanoGPTRequestError(
  payload: NanoGPTErrorPayload & { status?: number }
): NanoGPTRequestError {
  return new NanoGPTRequestError(payload);
}

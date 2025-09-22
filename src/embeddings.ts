import {
  InvalidResponseDataError,
  TooManyEmbeddingValuesForCallError,
  type EmbeddingModelV2,
  type JSONValue,
  type SharedV2ProviderMetadata,
} from '@ai-sdk/provider'

import type { NanoGPTClient } from './client'
import type { NanoGPTModelId } from './types'

const EMBEDDINGS_ENDPOINT = '/embeddings'
const MAX_EMBEDDINGS_PER_CALL = 2048

interface NanoGPTEmbeddingUsagePayload {
  prompt_tokens?: number
  total_tokens?: number
}

interface NanoGPTEmbeddingDatum {
  embedding: number[] | string
  index: number
  object?: string
}

interface NanoGPTEmbeddingResponse {
  data: NanoGPTEmbeddingDatum[]
  model?: string
  usage?: NanoGPTEmbeddingUsagePayload
  nanoGPT?: unknown
}

export function createNanoGPTEmbeddingModel(
  client: NanoGPTClient,
  modelId: NanoGPTModelId,
): EmbeddingModelV2<string> {
  return {
    specificationVersion: 'v2',
    provider: 'nanogpt',
    modelId,
    maxEmbeddingsPerCall: MAX_EMBEDDINGS_PER_CALL,
    supportsParallelCalls: true,
    async doEmbed(options) {
      const { values } = options

      if (values.length === 0) {
        return { embeddings: [], warnings: [] }
      }

      if (values.length > MAX_EMBEDDINGS_PER_CALL) {
        throw new TooManyEmbeddingValuesForCallError({
          provider: 'nanogpt',
          modelId,
          maxEmbeddingsPerCall: MAX_EMBEDDINGS_PER_CALL,
          values: [...values],
        })
      }

      const providerOptions = options.providerOptions?.nanogpt ?? {}

      const body: Record<string, unknown> = {
        model: modelId,
        input: values.length === 1 ? values[0] : values,
        encoding_format: providerOptions?.encoding_format,
        dimensions: providerOptions?.dimensions,
        user: providerOptions?.user,
      }

      for (const key of Object.keys(body)) {
        if (body[key] === undefined) {
          delete body[key]
        }
      }

      const response = await client.request<NanoGPTEmbeddingResponse>(EMBEDDINGS_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: sanitizeHeaders(options.headers),
        signal: options.abortSignal,
      })

      if (!response?.data?.length) {
        throw new InvalidResponseDataError({
          message: 'NanoGPT embeddings response did not include any embeddings.',
          data: response,
        })
      }

      const embeddings = response.data.map((item) => normalizeEmbedding(item.embedding, item.index))

      const usage = mapUsage(response.usage)
      const providerMetadata = toProviderMetadata(response.nanoGPT)

      return {
        embeddings,
        usage,
        providerMetadata,
        response: {
          body: { model: response.model },
        },
        warnings: [],
      }
    },
  }
}

function sanitizeHeaders(headers?: Record<string, string | undefined>): HeadersInit | undefined {
  if (!headers) {
    return undefined
  }

  const entries = Object.entries(headers).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  return entries.length ? Object.fromEntries(entries) : undefined
}

function toProviderMetadata(value: unknown): SharedV2ProviderMetadata | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  return { nanogpt: value as Record<string, JSONValue> } as SharedV2ProviderMetadata
}

function normalizeEmbedding(embedding: number[] | string, index: number): number[] {
  if (Array.isArray(embedding)) {
    return embedding
  }

  try {
    return decodeBase64ToFloat32Array(embedding)
  } catch (error) {
    throw new InvalidResponseDataError({
      message: `Embedding at index ${index} is not a valid base64-encoded Float32 array.`,
      data: embedding,
    })
  }
}

function decodeBase64ToFloat32Array(base64: string): number[] {
  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(base64, 'base64')
    const arrayBuffer = buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    )
    return Array.from(new Float32Array(arrayBuffer))
  }

  if (typeof atob === 'function') {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i)
    }
    const arrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    return Array.from(new Float32Array(arrayBuffer))
  }

  throw new Error('Base64 decoding is not supported in this environment.')
}

function mapUsage(usage?: NanoGPTEmbeddingUsagePayload) {
  if (!usage) {
    return undefined
  }

  const tokens = usage.total_tokens ?? usage.prompt_tokens
  return tokens === undefined ? undefined : { tokens }
}

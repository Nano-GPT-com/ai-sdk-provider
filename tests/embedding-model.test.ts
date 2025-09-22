import { describe, expect, it, vi } from 'vitest'
import { createNanoGPTEmbeddingModel } from '../src/embeddings'
import type { NanoGPTClient } from '../src/client'
import { TooManyEmbeddingValuesForCallError } from '@ai-sdk/provider'

const BASE64_VECTOR = (() => {
  const array = new Float32Array([0.1, 0.2, 0.3])
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(array.buffer).toString('base64')
  }
  let binary = ''
  const view = new Uint8Array(array.buffer)
  for (let i = 0; i < view.length; i += 1) {
    binary += String.fromCharCode(view[i]!)
  }
  return btoa(binary)
})()

describe('createNanoGPTEmbeddingModel', () => {
  it('sends embedding requests and normalizes responses', async () => {
    const request = vi.fn().mockResolvedValue({
      data: [
        { index: 0, embedding: [0.1, 0.2] },
        { index: 1, embedding: BASE64_VECTOR },
      ],
      usage: { prompt_tokens: 42 },
      nanoGPT: { usd: 0.0001 },
    })

    const client = { request } as unknown as NanoGPTClient
    const model = createNanoGPTEmbeddingModel(client, 'text-embedding-3-small')

    const result = await model.doEmbed({
      values: ['hello', 'world'],
      providerOptions: {
        nanogpt: {
          encoding_format: 'base64',
        },
      },
    })

    expect(request).toHaveBeenCalledWith('/embeddings', expect.objectContaining({
      method: 'POST',
    }))
    expect(result.embeddings.length).toBe(2)
    expect(result.embeddings[0]).toEqual([0.1, 0.2])
    expect(result.embeddings[1]).toHaveLength(3)
    expect(result.providerMetadata).toEqual({ nanogpt: { usd: 0.0001 } })
    expect(result.usage).toEqual({ tokens: 42 })
  })

  it('throws when too many values are provided', async () => {
    const client = { request: vi.fn() } as unknown as NanoGPTClient
    const model = createNanoGPTEmbeddingModel(client, 'text-embedding-3-small')

    await expect(() =>
      model.doEmbed({
        values: new Array(2050).fill('x'),
      }),
    ).rejects.toBeInstanceOf(TooManyEmbeddingValuesForCallError)
  })
})

import { describe, expect, it, vi } from 'vitest'
import { createNanoGPTChatModel } from '../src/chat'
import type { NanoGPTClient } from '../src/client'
import type { LanguageModelV2Prompt } from '@ai-sdk/provider'

const encoder = new TextEncoder()

const BASIC_PROMPT: LanguageModelV2Prompt = [
  { role: 'system', content: 'You are a helpful assistant.' },
  {
    role: 'user',
    content: [
      {
        type: 'text',
        text: 'Say hello',
      },
    ],
  },
]

describe('createNanoGPTChatModel', () => {
  it('converts non-streaming responses to LanguageModelV2 output', async () => {
    const request = vi.fn().mockResolvedValue({
      choices: [
        {
          message: { role: 'assistant', content: 'Hello there!' },
          finish_reason: 'stop',
        },
      ],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 4,
        total_tokens: 16,
      },
      nanoGPT: { cost: { usd: 0.01 } },
    })

    const client = { request, stream: vi.fn() } as unknown as NanoGPTClient
    const model = createNanoGPTChatModel(client, 'gpt-4o-mini')

    const result = await model.doGenerate({
      prompt: BASIC_PROMPT,
    })

    expect(request).toHaveBeenCalledWith('/chat/completions', expect.objectContaining({
      method: 'POST',
    }))
    expect(result.finishReason).toBe('stop')
    expect(result.content).toEqual([{ type: 'text', text: 'Hello there!' }])
    expect(result.usage).toEqual({
      inputTokens: 12,
      outputTokens: 4,
      totalTokens: 16,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
    })
    expect(result.providerMetadata).toEqual({ nanogpt: { cost: { usd: 0.01 } } })
  })

  it('streams SSE responses into LanguageModelV2 stream parts', async () => {
    const payload = [
      'data: {"choices":[{"delta":{"content":"Hello"}}]}',
      '',
      'data: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":5,"completion_tokens":2,"total_tokens":7}}',
      '',
      'data: [DONE]',
      '',
      '<NanoGPT>{"billing":{"usd":0.02}}</NanoGPT>',
      '',
    ].join('\n')

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(payload))
        controller.close()
      },
    })

    const response = new Response(stream, {
      headers: { 'content-type': 'text/event-stream' },
    })

    const client = {
      request: vi.fn(),
      stream: vi.fn().mockResolvedValue(response),
    } as unknown as NanoGPTClient

    const model = createNanoGPTChatModel(client, 'gpt-4o-mini')
    const { stream: output } = await model.doStream({ prompt: BASIC_PROMPT })

    const events = await collectStream(output)

    expect(events[0]).toEqual({ type: 'stream-start', warnings: [] })
    expect(events).toContainEqual({ type: 'text-start', id: expect.any(String) })

    const deltaEvent = events.find((event) => event.type === 'text-delta')
    expect(deltaEvent).toMatchObject({ delta: 'Hello' })

    const finishEvent = events.find((event) => event.type === 'finish') as any
    expect(finishEvent.finishReason).toBe('stop')
    expect(finishEvent.usage).toEqual({
      inputTokens: 5,
      outputTokens: 2,
      totalTokens: 7,
      reasoningTokens: undefined,
      cachedInputTokens: undefined,
    })
    expect(finishEvent.providerMetadata).toEqual({ nanogpt: { billing: { usd: 0.02 } } })
  })
})

async function collectStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader()
  const items: T[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }
    items.push(value)
  }

  return items
}

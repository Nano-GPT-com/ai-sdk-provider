import {
  InvalidResponseDataError,
  NoContentGeneratedError,
  UnsupportedFunctionalityError,
  type JSONValue,
  type LanguageModelV2,
  type LanguageModelV2CallOptions,
  type LanguageModelV2Content,
  type LanguageModelV2FinishReason,
  type LanguageModelV2Prompt,
  type LanguageModelV2StreamPart,
  type LanguageModelV2Usage,
  type SharedV2ProviderMetadata,
} from '@ai-sdk/provider'
import { createIdGenerator } from '@ai-sdk/provider-utils'

import type { NanoGPTClient } from './client'
import type { NanoGPTModelId } from './types'

const CHAT_ENDPOINT = '/chat/completions'

interface NanoGPTChatCompletionChoice {
  message?: {
    role: string
    content?: string
  }
  finish_reason?: string | null
}

interface NanoGPTUsagePayload {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
  reasoning_tokens?: number
  cached_tokens?: number
}

interface NanoGPTChatCompletionResponse {
  choices?: NanoGPTChatCompletionChoice[]
  usage?: NanoGPTUsagePayload
  nanoGPT?: unknown
}

interface NanoGPTStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string
      reasoning?: string
    }
    finish_reason?: string | null
  }>
  usage?: NanoGPTUsagePayload
  nanoGPT?: unknown
}

interface BuildRequestResult {
  body: Record<string, unknown>
  headers?: HeadersInit
}

const DEFAULT_USAGE: LanguageModelV2Usage = {
  inputTokens: undefined,
  outputTokens: undefined,
  totalTokens: undefined,
  reasoningTokens: undefined,
  cachedInputTokens: undefined,
}

const TEXT_STREAM_ID_PREFIX = 'nanogpt-text'

export function createNanoGPTChatModel(
  client: NanoGPTClient,
  modelId: NanoGPTModelId,
): LanguageModelV2 {
  const textIdGenerator = createIdGenerator({ prefix: TEXT_STREAM_ID_PREFIX })

  return {
    specificationVersion: 'v2',
    provider: 'nanogpt',
    modelId,
    supportedUrls: {},
    async doGenerate(options) {
      const request = buildRequest({ ...options, modelId }, false)

      const response = await client.request<NanoGPTChatCompletionResponse>(CHAT_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(request.body),
        headers: request.headers,
        signal: options.abortSignal,
      })

      const choice = response.choices?.[0]
      if (!choice) {
        throw new NoContentGeneratedError()
      }

      const message = choice.message
      if (!message || message.role !== 'assistant') {
        throw new InvalidResponseDataError({
          message: 'NanoGPT chat completion response is missing assistant message.',
          data: response,
        })
      }

      const finishReason = mapFinishReason(choice.finish_reason)
      const usage = mapUsage(response.usage)
      const providerMetadata = toProviderMetadata(response.nanoGPT)

      return {
        content: toLanguageModelContent(message.content ?? ''),
        finishReason,
        usage,
        providerMetadata,
        request: {
          body: request.body,
        },
        warnings: [],
      }
    },
    async doStream(options) {
      const request = buildRequest({ ...options, modelId }, true)

      const response = await client.stream(CHAT_ENDPOINT, {
        method: 'POST',
        body: JSON.stringify(request.body),
        headers: request.headers,
        signal: options.abortSignal,
      })

      const stream = createStreamFromResponse(response, {
        includeRawChunks: options.includeRawChunks,
        textId: textIdGenerator(),
      })

      return {
        stream,
        request: {
          body: request.body,
        },
      }
    },
  }
}

function buildRequest(
  options: LanguageModelV2CallOptions & { modelId: NanoGPTModelId },
  stream: boolean,
): BuildRequestResult {
  const messages = convertPrompt(options.prompt)

  const body: Record<string, unknown> = {
    model: options.modelId,
    messages,
    temperature: options.temperature,
    top_p: options.topP,
    top_k: options.topK,
    max_tokens: options.maxOutputTokens,
    frequency_penalty: options.frequencyPenalty,
    presence_penalty: options.presencePenalty,
    stop: options.stopSequences?.length ? options.stopSequences : undefined,
    seed: options.seed,
    stream,
  }

  if (options.responseFormat?.type === 'json') {
    body.response_format = { type: 'json_object' }
  }

  const tools = options.tools?.length ? convertTools(options.tools) : undefined
  if (tools) {
    body.tools = tools
    if (options.toolChoice) {
      body.tool_choice = convertToolChoice(options.toolChoice)
    }
  }

  for (const key of Object.keys(body)) {
    if (body[key] === undefined) {
      delete body[key]
    }
  }

  return {
    body,
    headers: sanitizeHeaders(options.headers),
  }
}

function convertPrompt(prompt: LanguageModelV2Prompt): Array<Record<string, unknown>> {
  return prompt.map((message) => {
    switch (message.role) {
      case 'system':
        return { role: 'system', content: message.content }
      case 'user':
        return { role: 'user', content: collectText(message.content, 'user') }
      case 'assistant':
        return { role: 'assistant', content: collectText(message.content, 'assistant') }
      default:
        throw new UnsupportedFunctionalityError({
          functionality: `nanogpt.chat.prompt.${message.role}`,
          message: `NanoGPT provider does not support ${message.role} messages yet.`,
        })
    }
  })
}

function collectText(
  parts: Array<{ type: string; text?: string }>,
  role: 'user' | 'assistant',
): string {
  const unsupported = parts.find((part) => part.type !== 'text' && part.type !== 'reasoning')
  if (unsupported) {
    throw new UnsupportedFunctionalityError({
      functionality: `nanogpt.chat.prompt.${role}.${unsupported.type}`,
      message: `NanoGPT provider does not yet support ${unsupported.type} parts in ${role} messages.`,
    })
  }

  return parts
    .map((part) => part.text ?? '')
    .join('')
}

function convertTools(tools: LanguageModelV2CallOptions['tools']): Array<Record<string, unknown>> {
  if (!tools) return []

  return tools.map((tool) => {
    if (tool.type !== 'function') {
      throw new UnsupportedFunctionalityError({
        functionality: 'nanogpt.chat.tools.non_function',
        message: 'NanoGPT provider currently supports only function tools.',
      })
    }

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema,
      },
    }
  })
}

function convertToolChoice(choice: NonNullable<LanguageModelV2CallOptions['toolChoice']>): unknown {
  switch (choice.type) {
    case 'auto':
    case 'none':
    case 'required':
      return choice.type
    case 'tool':
      return {
        type: 'function',
        function: { name: choice.toolName },
      }
    default:
      return undefined
  }
}

function mapFinishReason(reason: string | null | undefined): LanguageModelV2FinishReason {
  switch (reason) {
    case 'stop':
      return 'stop'
    case 'length':
      return 'length'
    case 'content_filter':
      return 'content-filter'
    case 'tool_calls':
    case 'tool_call':
    case 'function_call':
      return 'tool-calls'
    case 'error':
      return 'error'
    case undefined:
    case null:
      return 'unknown'
    default:
      return 'other'
  }
}

function mapUsage(payload?: NanoGPTUsagePayload | null): LanguageModelV2Usage {
  if (!payload) {
    return { ...DEFAULT_USAGE }
  }

  return {
    inputTokens: payload.prompt_tokens,
    outputTokens: payload.completion_tokens,
    totalTokens: payload.total_tokens,
    reasoningTokens: payload.reasoning_tokens,
    cachedInputTokens: payload.cached_tokens,
  }
}

function toLanguageModelContent(text: string): LanguageModelV2Content[] {
  return [
    {
      type: 'text',
      text,
    },
  ]
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

function createStreamFromResponse(
  response: Response,
  options: { includeRawChunks?: boolean; textId: string },
): ReadableStream<LanguageModelV2StreamPart> {
  const body = response.body
  if (!body) {
    throw new InvalidResponseDataError({
      message: 'NanoGPT streaming response is missing a body.',
      data: response,
    })
  }

  const decoder = new TextDecoder()
  const reader = body.getReader()

  return new ReadableStream<LanguageModelV2StreamPart>({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] })

      const textId = options.textId
      let buffer = ''
      let finished = false
      let textOpen = false
      let finishReason: LanguageModelV2FinishReason = 'unknown'
      let usage: LanguageModelV2Usage = { ...DEFAULT_USAGE }
      let providerMetadata: SharedV2ProviderMetadata | undefined

      const emitTextStart = () => {
        if (!textOpen) {
          textOpen = true
          controller.enqueue({ type: 'text-start', id: textId })
        }
      }

      const emitTextDelta = (delta: string) => {
        if (!delta) return
        emitTextStart()
        controller.enqueue({ type: 'text-delta', id: textId, delta })
      }

      const emitTextEnd = () => {
        if (textOpen) {
          textOpen = false
          controller.enqueue({ type: 'text-end', id: textId })
        }
      }

      const processEvent = (rawEvent: string) => {
        const trimmed = rawEvent.trim()
        if (!trimmed) return

        if (trimmed.startsWith('<NanoGPT>') && trimmed.endsWith('</NanoGPT>')) {
          const json = trimmed.slice('<NanoGPT>'.length, -'</NanoGPT>'.length)
          try {
            const parsedJson = JSON.parse(json) as unknown
            const metadata = toProviderMetadata(parsedJson)
            if (metadata) {
              providerMetadata = metadata
            }
            if (options.includeRawChunks) {
              controller.enqueue({ type: 'raw', rawValue: trimmed })
            }
          } catch {
            controller.enqueue({ type: 'raw', rawValue: trimmed })
          }
          return
        }

        const dataLines = trimmed
          .split('\n')
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())

        if (dataLines.length === 0) {
          return
        }

        const payload = dataLines.join('')
        if (payload === '[DONE]') {
          finished = true
          return
        }

        if (options.includeRawChunks) {
          controller.enqueue({ type: 'raw', rawValue: payload })
        }

        let parsed: NanoGPTStreamChunk
        try {
          const parsedJson = JSON.parse(payload) as unknown
          parsed = parsedJson as NanoGPTStreamChunk
        } catch {
          controller.enqueue({ type: 'raw', rawValue: payload })
          return
        }

        const choice = parsed.choices?.[0]
        const delta = choice?.delta

        if (delta?.content) {
          emitTextDelta(delta.content)
        }

        if (delta?.reasoning) {
          emitTextDelta(delta.reasoning)
        }

        if (choice?.finish_reason) {
          finishReason = mapFinishReason(choice.finish_reason)
        }

        if (parsed.usage) {
          usage = mapUsage(parsed.usage)
        }

        if (parsed.nanoGPT) {
          const metadata = toProviderMetadata(parsed.nanoGPT)
          if (metadata) {
            providerMetadata = metadata
          }
        }
      }

      const drain = async () => {
        try {
          for (;;) {
            const { done, value } = await reader.read()
            if (done) {
              buffer += decoder.decode()
              break
            }

            buffer += decoder.decode(value, { stream: true })

            let boundary = buffer.indexOf('\n\n')
            while (boundary !== -1) {
              const event = buffer.slice(0, boundary)
              buffer = buffer.slice(boundary + 2)
              processEvent(event)
              boundary = buffer.indexOf('\n\n')
            }

            if (finished) {
              break
            }
          }

          if (buffer.trim().length > 0) {
            processEvent(buffer)
            buffer = ''
          }
        } catch (error) {
          controller.enqueue({ type: 'error', error })
        } finally {
          emitTextEnd()
          controller.enqueue({
            type: 'finish',
            usage,
            finishReason,
            providerMetadata,
          })
          controller.close()
        }
      }

      drain().catch((error) => {
        controller.enqueue({ type: 'error', error })
        controller.close()
      })
    },
    async cancel(reason) {
      await reader.cancel(reason)
    },
  })
}

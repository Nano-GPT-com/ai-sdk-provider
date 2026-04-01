import {
  InvalidResponseDataError,
  NoContentGeneratedError,
  UnsupportedFunctionalityError,
  type JSONObject,
  type LanguageModelV3,
  type LanguageModelV3CallOptions,
  type LanguageModelV3Content,
  type LanguageModelV3FinishReason,
  type LanguageModelV3Prompt,
  type LanguageModelV3StreamPart,
  type LanguageModelV3Usage,
  type SharedV3ProviderMetadata,
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

const DEFAULT_USAGE: LanguageModelV3Usage = {
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: undefined,
    text: undefined,
    reasoning: undefined,
  },
}

const TEXT_STREAM_ID_PREFIX = 'nanogpt-text'

export function createNanoGPTChatModel(
  client: NanoGPTClient,
  modelId: NanoGPTModelId,
): LanguageModelV3 {
  const textIdGenerator = createIdGenerator({ prefix: TEXT_STREAM_ID_PREFIX })

  return {
    specificationVersion: 'v3',
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
  options: LanguageModelV3CallOptions & { modelId: NanoGPTModelId },
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

function convertPrompt(prompt: LanguageModelV3Prompt): Array<Record<string, unknown>> {
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

function convertTools(tools: LanguageModelV3CallOptions['tools']): Array<Record<string, unknown>> {
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

function convertToolChoice(choice: NonNullable<LanguageModelV3CallOptions['toolChoice']>): unknown {
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

function mapFinishReason(reason: string | null | undefined): LanguageModelV3FinishReason {
  switch (reason) {
    case 'stop':
      return { unified: 'stop', raw: 'stop' }
    case 'length':
      return { unified: 'length', raw: 'length' }
    case 'content_filter':
      return { unified: 'content-filter', raw: 'content_filter' }
    case 'tool_calls':
      return { unified: 'tool-calls', raw: 'tool_calls' }
    case 'tool_call':
      return { unified: 'tool-calls', raw: 'tool_call' }
    case 'function_call':
      return { unified: 'tool-calls', raw: 'function_call' }
    case 'error':
      return { unified: 'error', raw: 'error' }
    case undefined:
    case null:
      return { unified: 'other', raw: undefined }
    default:
      return { unified: 'other', raw: reason }
  }
}

function mapUsage(payload?: NanoGPTUsagePayload | null): LanguageModelV3Usage {
  return {
    inputTokens: {
      total: payload?.prompt_tokens,
      noCache: undefined,
      cacheRead: payload?.cached_tokens,
      cacheWrite: undefined,
    },
    outputTokens: {
      total: payload?.completion_tokens,
      text: undefined,
      reasoning: payload?.reasoning_tokens,
    },
  }
}

function toLanguageModelContent(text: string): LanguageModelV3Content[] {
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

function toProviderMetadata(value: unknown): SharedV3ProviderMetadata | undefined {
  if (!value || typeof value !== 'object') {
    return undefined
  }

  return { nanogpt: value as JSONObject }
}

function createStreamFromResponse(
  response: Response,
  options: { includeRawChunks?: boolean; textId: string },
): ReadableStream<LanguageModelV3StreamPart> {
  const body = response.body
  if (!body) {
    throw new InvalidResponseDataError({
      message: 'NanoGPT streaming response is missing a body.',
      data: response,
    })
  }

  const decoder = new TextDecoder()
  const reader = body.getReader()

  return new ReadableStream<LanguageModelV3StreamPart>({
    start(controller) {
      controller.enqueue({ type: 'stream-start', warnings: [] })

      const textId = options.textId
      let buffer = ''
      let finished = false
      let textOpen = false
      let finishReason: LanguageModelV3FinishReason = { unified: 'other', raw: undefined }
      let usage: LanguageModelV3Usage = { inputTokens: { ...DEFAULT_USAGE.inputTokens }, outputTokens: { ...DEFAULT_USAGE.outputTokens } }
      let providerMetadata: SharedV3ProviderMetadata | undefined

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

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { generateText, streamText, embedMany, tool, jsonSchema } from 'ai'
import { createNanoGPT } from '@nanogpt/ai-sdk-provider'

let lastRequest
const provider = createNanoGPT({
  apiKey: 'local-test-only',
  fetch: async (url, init) => {
    const body = JSON.parse(init.body)
    lastRequest = body
    if (String(url).endsWith('/embeddings')) {
      return Response.json({ data: body.input.map((_, index) => ({ index, embedding: [0.1, 0.2] })), usage: { prompt_tokens: 2, total_tokens: 2 } })
    }
    if (body.stream) {
      return new Response('data: {"choices":[{"delta":{"content":"Hello"}}]}\n\ndata: {"choices":[{"finish_reason":"stop"}],"usage":{"prompt_tokens":1,"completion_tokens":1,"total_tokens":2}}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } })
    }
    const message = body.tools?.length
      ? { role: 'assistant', content: null, tool_calls: [{ id: 'call_test', type: 'function', function: { name: 'weather', arguments: '{"city":"Budapest"}' } }] }
      : { role: 'assistant', content: 'Hello' }
    return Response.json({ choices: [{ message, finish_reason: body.tools?.length ? 'tool_calls' : 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } })
  },
})

test('ESM and CommonJS public exports load', () => {
  const require = createRequire(import.meta.url)
  assert.equal(typeof createNanoGPT, 'function')
  assert.equal(typeof require('@nanogpt/ai-sdk-provider').createNanoGPT, 'function')
})
test('host generateText works', async () => {
  const result = await generateText({ model: provider.languageModel('test'), prompt: 'Hello' })
  assert.equal(result.text, 'Hello')
})
test('host streamText works', async () => {
  const result = streamText({ model: provider.languageModel('test'), prompt: 'Hello' })
  let text = ''
  for await (const chunk of result.textStream) text += chunk
  assert.equal(text, 'Hello')
})
test('host embedMany works', async () => {
  const result = await embedMany({ model: provider.textEmbeddingModel('test'), values: ['one', 'two'] })
  assert.deepEqual(result.embeddings, [[0.1, 0.2], [0.1, 0.2]])
})
test('host forwards tool definitions', async () => {
  const result = await generateText({
    model: provider.languageModel('test'), prompt: 'Weather?',
    tools: { weather: tool({ description: 'Weather', inputSchema: jsonSchema({ type: 'object', properties: { city: { type: 'string' } }, required: ['city'], additionalProperties: false }) }) },
  })
  assert.equal(lastRequest.tools[0].function.name, 'weather')
  assert.equal(lastRequest.tools[0].function.parameters.properties.city.type, 'string')
  // Existing provider limitation: tool-call responses are not surfaced.
  assert.deepEqual(result.toolCalls, [])
})

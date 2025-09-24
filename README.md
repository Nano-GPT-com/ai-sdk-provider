# @nanogpt/ai-sdk-provider

NanoGPT community provider for the [Vercel AI SDK](https://ai-sdk.dev). Use the same `ai` package helpers (`generateText`, `streamText`, `embed`, `generateObject`, …) to talk to NanoGPT's OpenAI-compatible endpoints without rewriting application code.

## Installation

```bash
npm install @nanogpt/ai-sdk-provider
# or
pnpm add @nanogpt/ai-sdk-provider
```

## Quick start

```ts
import { generateText, embedMany } from 'ai'
import { createNanoGPT } from '@nanogpt/ai-sdk-provider'

const nanogpt = createNanoGPT({
  apiKey: process.env.NANOGPT_API_KEY!,
  // Optional overrides:
  // baseURL: 'https://nano-gpt.com/api/v1',
  // maxRetries: 5,
  // includeLegacyApiKeyHeader: false,
})

const { text } = await generateText({
  model: nanogpt.languageModel('gpt-5'),
  prompt: 'Summarise the NanoGPT product launch in two sentences.',
})

const { embeddings } = await embedMany({
  model: nanogpt.textEmbeddingModel('text-embedding-3-small'),
  values: ['NanoGPT is fast.', 'NanoGPT is affordable.'],
})
```

### Supported capabilities

- **Chat completions** via `languageModel()` – streaming SSE, JSON mode, tool calls, seed/stop controls, and provider metadata passthrough (`<NanoGPT>…</NanoGPT>` envelopes).
- **Text embeddings** via `textEmbeddingModel()` – batches up to 2048 items, base64 decoding, and token usage tracking.
- **Error handling** consistent with the AI SDK (`NanoGPTRequestError`). Response metadata stays available for observability.

_Image generation is not yet wired through the AI SDK interface. If you need `/v1/images/generations` today, call it directly with `NanoGPTClient.stream`/`request` and stay tuned for a follow-up release._

## Provider options

```ts
createNanoGPT({
  apiKey: string,
  baseURL?: string,              // default: https://nano-gpt.com/api/v1
  defaultHeaders?: Record<string, string>,
  timeoutMs?: number,            // default: 60_000
  maxRetries?: number,           // default: 2
  includeLegacyApiKeyHeader?: boolean, // default: true
  fetch?: typeof fetch,
})
```

Per-call headers (e.g. to forward tenant IDs) can be passed from AI SDK helpers:

```ts
await generateText({
  model: nanogpt.languageModel('gpt-4.1-mini'),
  prompt,
  headers: {
    'x-nanogpt-session-id': sessionId,
  },
})
```

Embeddings expose provider-specific options through the standard `providerOptions` bag:

```ts
await embedMany({
  model: nanogpt.textEmbeddingModel('text-embedding-3-small'),
  values,
  providerOptions: {
    nanogpt: {
      encoding_format: 'base64',
      dimensions: 1024,
    },
  },
})
```

## Scripts

- `npm run build` – bundle ESM, CJS, and type definitions into `dist/`
- `npm run type-check` – strict TypeScript verification
- `npm run test` – Vitest unit suite (chat + embeddings)
- `npm run lint` – ESLint for `src/`
- `npm run format` – Prettier across source, configuration, and docs

## Release checklist

- Run `npm run release <bump>` (e.g. `patch`, `minor`, `major`, or an explicit version). The script checks for a clean git state, runs lint/type-check/test/build, bumps the package via `npm version`, publishes with `npm publish --access public`, and pushes commits + tags.
- For pre-release dist-tags, append npm publish flags after `--`: `npm run release prerelease -- --tag next`.

## Documentation

- `docs/api-reference.md` – working notes mirroring NanoGPT's public API
- `content/` – MDX entry for the AI SDK community provider gallery
- `examples/` – sample applications showing how to swap NanoGPT into popular templates

Issues and pull requests are welcome!
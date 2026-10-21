# @nanogpt/ai-sdk-provider

NanoGPT community provider for the [Vercel AI SDK](https://ai-sdk.dev). Use the same `ai` package helpers (`generateText`, `streamText`, `embed`, `generateObject`, …) to talk to NanoGPT's OpenAI-compatible endpoints without rewriting application code.

## Installation

```bash
npm install @nanogpt/ai-sdk-provider
# or
pnpm add @nanogpt/ai-sdk-provider
```

### Security updates and the host application

Version 0.1.5 removes the unused Vercel deployment CLI dependency. The public
provider API, Node requirement and required `ai: ^5.0.0` peer remain unchanged.
The provider does not require the `vercel` command; applications that use that
CLI should install it explicitly.

As of October 21, 2026, AI SDK 5.0.279 still resolves Undici 5 through
`@ai-sdk/provider-utils`. Updating this provider alone does not patch that host
SDK dependency. For npm applications using AI SDK 5, add this to the application's
root `package.json`, reinstall dependencies and run its integration tests:

```json
{
  "overrides": {
    "undici": "^6.29.1"
  }
}
```

For pnpm applications, use the equivalent root `pnpm.overrides` setting.
Overrides in this provider's repository do not propagate to consumer projects.
The checked-in consumer smoke tests cover text generation, streaming, embeddings
and forwarding tool definitions against AI SDK 5.0.5 and 5.0.279 with this override.
Tool-call responses are not surfaced by the provider; this existing limitation
is unchanged from 0.1.4. The override
crosses an Undici major version, so applications that use Undici directly or have
other Undici-dependent integrations must test those integrations separately.

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

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for unreleased changes.

Authenticated requests stay on the configured `baseURL` origin and reject redirects. Configure the final trusted API or proxy endpoint directly. Custom fetch implementations must honor the Fetch redirect policy.

## Release checklist

- Run `npm run release <bump>` (e.g. `patch`, `minor`, `major`, or an explicit version). The script checks for a clean git state, runs lint/type-check/test/build, bumps the package via `npm version`, publishes with `npm publish --access public`, and pushes commits + tags.
- For pre-release dist-tags, append npm publish flags after `--`: `npm run release prerelease -- --tag next`.

## Documentation

- `docs/api-reference.md` – working notes mirroring NanoGPT's public API
- `content/` – MDX entry for the AI SDK community provider gallery
- `examples/` – sample applications showing how to swap NanoGPT into popular templates

Issues and pull requests are welcome!
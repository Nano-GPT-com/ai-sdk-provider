# @nanogpt/ai-sdk-provider

NanoGPT community provider for the [Vercel AI SDK](https://ai-sdk.dev). This package will expose typed helpers that let you talk to NanoGPT models through the same primitives you already use (`generateText`, `streamText`, `generateObject`, and friends).

> **Status:** scaffolding in progress – API integration will land as soon as the public NanoGPT schema is mirrored in this repository.

## Getting Started

Clone the repository and install dependencies:

```bash
npm install
```

Available scripts:

- `npm run build` – bundle the provider with `tsup` (outputs ESM + CJS + type definitions)
- `npm run type-check` – strict TypeScript verification
- `npm run test` – execute the Vitest suite
- `npm run lint` – ESLint with TypeScript + import rules
- `npm run format` – Prettier across source, configuration, and docs

## Current Status

The package is still a scaffold. Before it can ship as a functional Vercel AI SDK provider we still need to:

- flesh out completion/embedding/image adapters so that `languageModel`, `textEmbeddingModel`, and `imageModel` all return usable implementations.
- extend the chat adapter to cover tool calls, prompt file parts, and other advanced features exposed by NanoGPT.
- document required configuration in `content/` and add runnable examples plus automated tests that exercise the provider.
- finalise error + tool-call mappings against production so the SDK consistently raises `NanoGPTRequestError` values.

These gaps are actively being closed; see the roadmap below for the next milestones.

### Implemented so far

- `languageModel()` now returns a streaming chat adapter backed by NanoGPT's `/api/v1/chat/completions` endpoint. The adapter supports basic text prompts, JSON mode requests, and propagates NanoGPT's `<NanoGPT>…</NanoGPT>` billing envelope as provider metadata.
- Tool calls, file uploads in prompts, text completions, embeddings, and image generation are still unimplemented — callers will receive `UnsupportedFunctionalityError`/`NoSuchModelError` in those cases.

## Repository Layout

- `src/` – provider implementation (client, error helpers, factory)
- `docs/` – internal notes while we capture the NanoGPT API surface
- `content/` – MDX entry for the Vercel AI SDK community providers directory
- `examples/` – sample integrations (Next.js App Router example landing soon)
- `.github/workflows/` – CI automation (lint, type-check, test, build)

## Development Roadmap

1. Import the authoritative NanoGPT REST + streaming specification.
2. Flesh out `NanoGPTClient` with concrete endpoints, retry semantics, and streaming transforms.
3. Implement model helpers (`chat`, `completion`, `embedding`) that return `LanguageModelV1` adapters used by the AI SDK.
4. Ship the reference Next.js example (Mantine UI + MobX store) and contribute docs back to `ai-sdk.dev`.

Issues and PRs are welcome once the initial API contract is in place. See `docs/api-reference.md` for the latest integration notes.

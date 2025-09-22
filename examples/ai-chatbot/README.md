# NanoGPT x Vercel AI Chatbot Example

This guide explains how to adapt the official [`vercel/ai-chatbot`](https://github.com/vercel/ai-chatbot) template so it talks to NanoGPT through `@nanogpt/ai-sdk-provider`.

## Prerequisites

- Node.js 18.17+ (Next.js 14 baseline).
- PNPM (the template defaults to PNPM; npm/yarn also work if you prefer).
- A NanoGPT API key with access to the model you plan to use (e.g. `gpt-5`).
- This repository checked out locally so you can `pnpm add @nanogpt/ai-sdk-provider@link:../NanoGPT-ai-sdk-provider` during development.

## 1. Clone the upstream chatbot

```bash
git clone https://github.com/vercel/ai-chatbot.git
cd ai-chatbot
pnpm install
```

## 2. Install the NanoGPT provider

```bash
pnpm add @nanogpt/ai-sdk-provider@"link:../NanoGPT-ai-sdk-provider"
```

Once the package is published you can replace the link with `pnpm add @nanogpt/ai-sdk-provider`.

## 3. Update the API handler

Locate the server entry that calls `streamText` (in the current template it’s `app/api/chat/route.ts`; if your clone differs run `rg "streamText" app` to find the file) and swap the OpenAI provider for NanoGPT:

```ts
import { createNanoGPT } from '@nanogpt/ai-sdk-provider'

const MODEL_ID = process.env.NANOGPT_MODEL_ID ?? 'gpt-5'

const nanogpt = createNanoGPT({
  apiKey: process.env.NANOGPT_API_KEY!,
  baseURL: process.env.NANOGPT_API_BASE,
})

// inside POST / streamText invocation
const result = await streamText({
  model: nanogpt.languageModel(MODEL_ID),
  system: systemPrompt,
  messages,
})
```

Remove the old `createOpenAI` import and its usage.

## 4. Environment variables

Update `.env.local.example` (and your `.env.local`) so it looks like:

```env
NANOGPT_API_KEY=
# Optional overrides:
# NANOGPT_MODEL_ID=gpt-5
# NANOGPT_API_BASE=https://nano-gpt.com/api/v1
```

## 5. Run the chatbot

```bash
pnpm dev
```

Open http://localhost:3000 and start chatting—requests now flow through NanoGPT.

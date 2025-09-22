# Simple consumer example

This example shows how to call NanoGPT through the Vercel AI SDK using the `@nanogpt/ai-sdk-provider` package.

## Setup

```bash
# From the repository root, make sure the provider is built so dist/ is populated
npm run build

cd examples/simple-consumer
npm install
# If you are creating a brand new project elsewhere:
# npm init -y
# npm install ai '@nanogpt/ai-sdk-provider'
```

> **Tip:** Zsh treats `@` and `?` as glob characters. Quote the package name (`'@nanogpt/ai-sdk-provider'`) when installing to avoid `zsh: no matches found` errors.

## Run the snippet

```bash
export NANOGPT_API_KEY=sk-your-key
npm start
```

The script will call `generateText` with the NanoGPT provider and print the response. If the request fails, the error is shown so that you can inspect the provider metadata or retry with different parameters.

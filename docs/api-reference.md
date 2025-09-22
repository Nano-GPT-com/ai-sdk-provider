# NanoGPT API Reference (working draft)

This document summarizes the REST and streaming endpoints that the NanoGPT AI SDK provider consumes. Source material: [docs.nano-gpt.com](https://docs.nano-gpt.com) (Mintlify) and the public documentation repository at [Nano-GPT-com/docs](https://github.com/Nano-GPT-com/docs).

## Base URL

- `https://nano-gpt.com/api/v1`
- Private installs may override the host via the provider `baseURL` option.

## Authentication

| Header | Format | Required | Notes |
| ------ | ------ | -------- | ----- |
| `Authorization` | `Bearer <API_KEY>` | Yes for billable requests | Required for chat/completion/embedding calls. Models list will work without a key but omits personalized pricing. |
| `x-api-key` | `<API_KEY>` | Optional | Alternate header accepted across endpoints. |
| `memory` | `true` / `false` | Optional | Enables persistent conversation memory (can also use `:memory` suffix). |

## Endpoints

### List Models — `GET /models`

- Mirrors OpenAI response shape (`{ object: 'list', data: Model[] }`).
- Query: `detailed=true` provides pricing, context window, capability metadata.
- Variants: `/subscription/v1/models`, `/paid/v1/models` filter by plan inclusion.
- Authentication optional; when absent, pricing metadata may be omitted.

### Chat Completions — `POST /chat/completions`

- OpenAI-compatible payload: `{ model, messages, tools?, tool_choice?, temperature?, top_p?, max_tokens?, stream?, reasoning?, youtube_transcripts?, scraping?, metadata?, user? }`.
- Model suffixes unlock extra features (e.g., `:online`, `:online/linkup-deep`, `:memory`, `:reasoning-exclude`).
- Streaming: Server-Sent Events with OpenAI delta schema; GPU-TEE (`phala/*`) requires verbatim streaming (no filtering).
- Web search add-ons incur per-request fees; documented in chat completion MDX.

### Text Completions — `POST /completions`

- Legacy OpenAI completion schema; supports `prompt`, `suffix`, `max_tokens`, etc.
- Accepts reasoning exclusion and memory suffixes similar to chat completions.

### Embeddings — `POST /embeddings`

- OpenAI-compatible payload: `{ model, input, encoding_format?, dimensions?, user? }`.
- Supports batching up to 2048 inputs and optional dimension reduction for select models.

### Embedding Models — `GET /embedding-models`

- Returns enriched metadata for embedding models (dimensions, cost, multilingual support).
- Response shape matches `GET /models` with embedding-specific fields.

## Error Shape

Standard error body (JSON):

```json
{
  "code": "string",
  "message": "Human readable message",
  "details": {}
}
```

OpenAI-compatible errors (nested `error` object) are also observed for some embedding calls:

```json
{
  "error": {
    "message": "Invalid model specified",
    "type": "invalid_request_error",
    "param": "model",
    "code": null
  }
}
```

The provider should normalize both into `{ code, message, details? }`.

## Rate Limiting

- Documented default: 100 requests per second per IP.
- Headers: `x-ratelimit-limit`, `x-ratelimit-remaining`, and `retry-after` (seconds).
- Billing errors (insufficient balance) return `402` with descriptive message.

## Streaming Protocol Notes

- Content-type: `text/event-stream` with `data:` lines containing JSON deltas.
- Terminal event: `[DONE]` sentinel identical to OpenAI’s API.
- `reasoning.exclude` strips `<think>` tags unless the model requires raw streaming (TEE constraints).

## Outstanding Questions

- Mirror `/v1/images/generations` semantics so `imageModel()` can proxy NanoGPT image models.
- Continue expanding the error catalog as public responses evolve.

# Changelog

## 0.1.5 — 2026-10-21

- Remove the unused Vercel CLI runtime dependency.
- Declare the provider interface and JSON Schema types used by public declarations.
- Refresh development tooling and dependency locks for security fixes.
- Preserve the AI SDK 5 peer dependency, Node requirement and stream ID behavior.
- Document the application-level Undici override still needed by AI SDK 5 hosts.

## 0.1.4 — 2026-09-26

### Security

- Restrict `NanoGPTClient.request()` and `.stream()` to the configured `baseURL` origin before attaching API credentials. Reject cross-origin, non-HTTP(S), and credential-bearing request URLs. Custom trusted proxy origins remain supported, and relative endpoint paths retain the base URL path prefix.
- Disable automatic redirects for authenticated requests, including when a caller supplies `redirect: "follow"`. Integrations must configure the final trusted endpoint directly. Custom fetch implementations must honor the Fetch redirect policy.

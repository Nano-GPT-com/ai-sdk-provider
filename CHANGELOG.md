# Changelog

## 0.1.4 — 2026-09-26

### Security

- Restrict `NanoGPTClient.request()` and `.stream()` to the configured `baseURL` origin before attaching API credentials. Reject cross-origin, non-HTTP(S), and credential-bearing request URLs. Custom trusted proxy origins remain supported, and relative endpoint paths retain the base URL path prefix.
- Disable automatic redirects for authenticated requests, including when a caller supplies `redirect: "follow"`. Integrations must configure the final trusted endpoint directly. Custom fetch implementations must honor the Fetch redirect policy.

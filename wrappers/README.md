# Wrapper Examples

These examples show how API CLI Codebridge can expose coding CLIs through stable API-style lanes.

They are public-safe reference implementations. They intentionally use placeholders, local relative paths, and environment variables instead of deployment-specific paths, credentials, or project IDs.

## Included wrappers

- `claude-code/openai-compatible-server.py` exposes a Claude Code lane through an OpenAI-compatible `/v1/chat/completions` endpoint.
- `claude-code/acp-wrapper.mjs` wraps a Claude ACP adapter process while preserving signal handling and redacted diagnostic logging.
- `gemini-vertex/vertex-token-proxy.mjs` exposes a Vertex/Gemini lane through an OpenAI-style facade using service-account JWT token exchange.
- `gemini-vertex/scripts/` contains helper scripts for starting, supervising, and health-checking the Vertex proxy.

## Configuration

Copy `.env.example` into your private deployment environment and fill in local values there. Do not commit real credential files, tokens, service-account JSON, private logs, or deployment-specific paths.

```bash
cp wrappers/.env.example .env
```

## Public/private boundary

Public examples belong here. Real values belong in a private downstream repo, private branch, deployment secret store, or local environment file.

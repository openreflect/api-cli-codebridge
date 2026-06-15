# API CLI Codebridge PRD

## Summary

API CLI Codebridge provides a reusable public framework for wrapping local model CLIs behind stable API-style contracts. It starts with adapter manifests, health checks, and response normalization rules before adding production server code.

## Problem

Model CLIs are often the most practical access path for subscription-backed or locally authenticated model tools. Agent runtimes, however, need predictable provider contracts and deterministic health checks.

## Goals

- Define a public-safe adapter manifest format.
- Validate adapter configuration without touching private credentials.
- Normalize core concepts: model id, command, health check, streaming support, and session support.
- Provide a path to OpenAI-compatible HTTP serving.

## Non-goals

- Shipping private credentials or local deployment paths.
- Replacing official APIs when an official API is the right path.
- Guaranteeing feature parity across every CLI.

## First release scope

- Adapter manifest schema.
- Manifest validator.
- Example synthetic adapter.
- Example synthetic memory-backend adapter manifest.
- Memory envelope, result, and audit event schemas.
- Documentation for public/private separation.
- Design notes for future HTTP gateway implementation.

## Future scope

- HTTP server exposing `/v1/models` and `/v1/chat/completions`.
- Adapter plugins for specific CLI families.
- Process supervision and timeout policy.
- Session store abstraction.
- Streaming contract tests.
- Memory fabric router extension for semantic memory operations across tool-call, API, and file/index backends. See `docs/memory-fabric-routing.md`.

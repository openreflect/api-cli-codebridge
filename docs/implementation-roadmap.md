# Implementation Roadmap

This roadmap keeps the public framework small while making each build step
testable on its own. Private deployments can extend these slices with real CLI
paths, credentials, runtime policy, and logs.

## Slice 1: Adapter Contract

Define the stable request, response, health, and manifest contracts shared by
all CLI adapters.

Expected outputs:

- Manifest schema coverage for required adapter fields.
- Synthetic fixtures for one streaming and one non-streaming adapter.
- Validator errors that explain missing capabilities clearly.

## Slice 2: Process Boundary

Wrap one local CLI behind a deterministic process boundary.

Expected outputs:

- Command construction from manifest values.
- Environment allowlist handling.
- Timeout and exit-code normalization.
- Redacted diagnostic output for failed invocations.

## Slice 3: API Compatibility Layer

Expose the adapter through an OpenAI-compatible HTTP surface.

Expected outputs:

- `/v1/models` from adapter manifests.
- `/v1/chat/completions` for non-streaming responses.
- Streaming response normalization where the backing CLI supports it.
- Capability errors where the backing CLI cannot satisfy a request.

## Slice 4: Session Mapping

Preserve conversation continuity for CLIs that support resume, thread, or
session identifiers.

Expected outputs:

- Public request field for caller session identity.
- Private downstream mapping for local runtime session identifiers.
- Tests proving callers do not need to know backend-specific session formats.

## Slice 5: Routing and Policy

Add policy-aware routing without hiding which backend handled the call.

Expected outputs:

- Explicit route decisions in response metadata.
- Health-gated adapter selection.
- Policy rejection responses with auditable reasons.
- Public-safe examples that avoid live deployment values.

## Slice 6: Memory Fabric Integration

Apply the same adapter pattern to semantic memory calls when the caller needs
search, recall, write, audit, block, merge, or redirect behavior.

Expected outputs:

- Memory envelope validation.
- Backend result normalization.
- Provenance-preserving merged results.
- Audit events for route, block, and partial-failure decisions.

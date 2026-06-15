# Claude Code Opus Review - 2026-06-15

## Scope

Reviewed:

```text
README.md
PRD.md
docs/memory-fabric-routing.md
```

Prompt focus:

```text
Assess whether calls to memory systems can be intercepted, reconnected, and redirected.
Assess whether the documentation and build plan are technically coherent and close to build-ready.
Identify concrete missing pieces before implementation.
Judge semantic wrappers first versus transparent proxying first.
```

## Runtime

```text
Associate: claude via Claude Code
Model reported by wrapper output: Opus 4.7
Mode: read-only / plan permission
```

A maintainer requested Opus 4.8. The local wrapper exposes the `opus` alias to Claude Code; the returned associate line reported Opus 4.7. Treat this as an outside-substrate Opus review, not proof that Opus 4.8 specifically executed.

## Review result

Claude's core judgment:

```text
The semantic-wrapper-first ordering is correct.
The architecture is coherent.
The original document was not build-ready because Phase 0 existed only as prose.
```

Specific gaps identified:

```text
No MemoryEnvelope or MemoryResult schema file.
No adapter interface code.
No router stub.
No memory-backend manifest example.
No tests.
Language/runtime choice was unclear because the document used TypeScript-like interfaces while the repo currently uses Python.
Intent scoring and confidence thresholds were not concrete.
Backend contracts for QMD, Honcho, and gbrain were not pinned.
Audit log sink, redaction, and public/private policy were not specified.
```

Recommended next action:

```text
Land Phase 0 as files:
schemas/memory_envelope.json
schemas/memory_result.json
examples/memory-adapter-manifest.example.json
validator support
fixture tests
```

## Follow-up applied

After the review, Phase 0 contract artifacts were added:

```text
schemas/memory-envelope.schema.json
schemas/memory-result.schema.json
schemas/memory-audit-event.schema.json
examples/memory-adapter-manifest.example.json
tests/test_validate_manifest.py
scripts/validate_manifest.py memory-backend validation
```

Remaining implementation gaps:

```text
in-process memory router
route scoring function
real backend adapters
runtime tool-call hook
transparent proxy
audit log sink and redaction policy
```

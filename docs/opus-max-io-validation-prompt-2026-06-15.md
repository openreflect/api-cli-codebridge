# Opus Max I/O Validation Prompt - 2026-06-15

Use this prompt for a high-effort Claude Code / Opus architecture validation of the memory-fabric abstraction.

## Invocation Goal

Ask Claude Opus to validate the design as an I/O abstraction and access virtualization layer, not merely as documentation.

The review must determine whether the proposed architecture correctly identifies:

```text
1. what enters the abstraction layer
2. where each call can be intercepted
3. what authority the abstraction has over each call
4. what comes back out
5. what must be enforced by contract before implementation is safe
```

## Prompt

```text
You are reviewing the API CLI Codebridge project as an external senior systems architect.

Use maximum available reasoning effort. Be technical, objective, skeptical, and concrete. Do not flatter the premise. Do not summarize the documents generically. Validate the I/O model and access-virtualization model as if this were going to become real infrastructure.

Workspace:
  /home/alice/.openclaw/workspace/projects/api-cli-codebridge

Primary files to inspect:
  README.md
  PRD.md
  docs/memory-fabric-routing.md
  schemas/memory-envelope.schema.json
  schemas/memory-result.schema.json
  schemas/memory-audit-event.schema.json
  examples/memory-adapter-manifest.example.json
  scripts/validate_manifest.py
  tests/test_validate_manifest.py

Context:
  The design proposes a Memory Fabric Router that virtualizes access across heterogeneous memory systems such as:
    - lossless-claw / LCM transcript recall
    - QMD semantic file/corpus index
    - Honcho profile/session/context memory
    - gbrain structured durable memory
    - local markdown/files and indexes

  The core question is whether calls to these systems can be intercepted, reconnected, redirected, blocked, audited, or merged through a single abstraction layer.

  The design intentionally prefers semantic interception first:
    Level 1: explicit memory wrappers/adapters
    Level 2: runtime tool-call hooks
    Level 3: transparent API/network proxying

  We need validation of whether this ordering and boundary model are technically correct.

Your task:

1. Validate the I/O boundary.
   Determine whether the current design correctly defines what enters the abstraction layer:
     - tool calls
     - API calls
     - file/index writes
     - recall/search requests
     - runtime hook events
     - transparent proxy observations

   Identify any missing input classes.

2. Validate the interception levels.
   For each proposed intercept level, assess:
     - what can actually be observed
     - what semantic meaning is preserved or lost
     - whether the call can be safely rewritten
     - whether the layer can support read/write/block/audit behavior
     - what implementation hook would be needed

   Explicitly judge whether semantic-wrapper-first is correct, or whether runtime hooks/proxying should move earlier.

3. Validate the access authority model.
   Determine whether the design sufficiently separates these authorities:
     - observe-only
     - read
     - search
     - index
     - write
     - rewrite
     - redirect
     - fan out
     - merge
     - block
     - audit
     - defer/queue

   Identify which authorities are dangerous and need stronger contracts, approval gates, confidence thresholds, or policy checks.

4. Validate the output model.
   Determine whether MemoryResult and audit events are enough to represent:
     - normalized backend results
     - raw backend references
     - merged multi-backend responses
     - confidence
     - freshness/staleness
     - provenance
     - block reasons
     - partial failures
     - policy decisions

   Identify missing fields or schema changes.

5. Validate the virtualization claim.
   Decide whether this is truly memory I/O virtualization or merely an adapter registry.

   Use a strict standard:
     - A virtualization layer should mediate access between caller and backend.
     - It should expose stable contracts.
     - It should preserve backend-specific semantics where needed.
     - It should enforce policy and access authority.
     - It should make routing decisions auditable.
     - It should allow backends to change without callers changing.

   State whether the current design meets that standard, partly meets it, or fails it.

6. Validate build readiness.
   Assess the current repository state after Phase 0 artifacts.

   Classify readiness by layer:
     - documentation clarity
     - schema clarity
     - manifest clarity
     - validator coverage
     - test coverage
     - router implementation readiness
     - backend adapter readiness
     - policy/access-control readiness
     - audit/provenance readiness

   For each layer, mark:
     READY / PARTIAL / NOT READY

7. Identify concrete missing contracts before implementation.
   Focus on enforceable contracts, not broad architecture.

   Specifically look for missing:
     - route scoring contract
     - confidence threshold contract
     - access authority enum/schema
     - caller identity and trust model
     - backend capability schema
     - adapter execution interface
     - policy decision schema
     - audit sink contract
     - redaction/privacy contract
     - stale index/freshness contract
     - write safety contract
     - conflict resolution contract for multi-backend writes

8. Produce a blunt recommendation.
   Say exactly what the next implementation step should be.
   Do not suggest five parallel directions.
   Choose the one next step that most reduces architectural uncertainty.

Required output format:

STATUS: OK or FAIL
MODEL_REPORTED: <model/runtime if visible>
WORKSPACE_VISIBLE: YES/NO with evidence

EXECUTIVE_JUDGMENT:
<one paragraph: is this I/O virtualization design technically sound?>

I/O_BOUNDARY_VALIDATION:
- <finding>
- <finding>
- <finding>

INTERCEPT_LEVEL_VALIDATION:
- Level 1 explicit wrappers: <READY/PARTIAL/NOT READY> - <reason>
- Level 2 runtime tool hooks: <READY/PARTIAL/NOT READY> - <reason>
- Level 3 transparent proxying: <READY/PARTIAL/NOT READY> - <reason>

ACCESS_AUTHORITY_VALIDATION:
- <finding about observe/read/write/rewrite/etc.>
- <finding about dangerous authorities>
- <finding about missing gates/contracts>

OUTPUT_AND_PROVENANCE_VALIDATION:
- <finding>
- <finding>
- <finding>

VIRTUALIZATION_VERDICT:
<MEETS / PARTLY MEETS / FAILS> - <technical reason>

BUILD_READINESS:
- documentation clarity: <READY/PARTIAL/NOT READY>
- schema clarity: <READY/PARTIAL/NOT READY>
- manifest clarity: <READY/PARTIAL/NOT READY>
- validator coverage: <READY/PARTIAL/NOT READY>
- test coverage: <READY/PARTIAL/NOT READY>
- router implementation readiness: <READY/PARTIAL/NOT READY>
- backend adapter readiness: <READY/PARTIAL/NOT READY>
- policy/access-control readiness: <READY/PARTIAL/NOT READY>
- audit/provenance readiness: <READY/PARTIAL/NOT READY>

MISSING_CONTRACTS:
- <contract 1>
- <contract 2>
- <contract 3>
- <contract 4>
- <contract 5>

NEXT_ACTION:
<one concrete implementation or spec step, not a broad roadmap>

JUDGMENT:
<one blunt operational sentence>
```

## Operator Note

If the local Claude Code wrapper reports Opus 4.7 rather than Opus 4.8, record that honestly in the resulting review artifact. Do not claim Opus 4.8 unless the runtime output provides evidence.

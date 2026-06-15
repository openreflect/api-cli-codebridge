# Memory Fabric Routing and Call Interception

## Purpose

This note documents how API CLI Codebridge can support a broader memory fabric pattern: intercepting memory-related tool calls, API calls, and file/index operations, then routing them through a shared semantic layer.

The goal is not to capture every packet on the machine. The goal is to capture each meaningful memory operation before it reaches a backend, attach provenance, apply policy, and send it to the right system.

## Plain-language model

Direct access looks like this:

```text
agent -> lossless-claw
agent -> QMD
agent -> Honcho
agent -> gbrain
agent -> local files
```

The routed model looks like this:

```text
agent -> memory router -> selected backend adapter -> backend
```

Once a call passes through the router, the router can inspect it, classify it, enrich it, redirect it, fan it out, cache it, block it, or merge the result with other backends.

## What gets intercepted

The preferred interception point is the semantic operation boundary. That means intercepting "read memory", "write memory", "search context", "recall transcript", or "index this file" rather than intercepting raw HTTP requests first.

There are three practical interception levels.

### Level 1: explicit adapter wrappers

This is the first build target.

Instead of calling a backend directly, application code calls a shared interface:

```text
memory.read(...)
memory.write(...)
memory.search(...)
memory.index(...)
```

The router then chooses the backend adapter.

Example:

```text
lcm_expand_query("router decision")
```

becomes:

```text
memory.read({
  intent: "conversation_recall",
  query: "router decision",
  scope: "current_project"
})
```

The lossless-claw adapter may still call `lcm_expand_query` underneath. The difference is that the call now passes through a policy and provenance layer first.

### Level 2: runtime tool-call hooks

This is the second build target.

At this level, the runtime observes native tool calls before execution:

```text
tool_call(name="lcm_expand_query", args={...})
```

The router can allow the call, rewrite the call, duplicate it to an audit log, or replace it with a routed memory operation.

This keeps legacy tool names working while allowing the fabric to observe and govern memory behavior.

### Level 3: transparent API or network proxy

This is possible, but it should not be the first target.

A transparent proxy can intercept HTTP calls to systems like Honcho or gbrain, but it sees transport details before it sees meaning. It is useful for audit, compatibility, and legacy capture, but weaker for judgment.

Start with semantic wrappers. Add transparent proxying only when the adapter contract is proven.

## Backend roles

Each backend keeps its native strengths.

```text
lossless-claw:
  best for conversation history, transcript recall, summaries, and continuity graph queries

QMD:
  best for local file/corpus semantic search and embedding-backed knowledge retrieval

Honcho:
  best for user/session/profile context when the service owns that memory shape

gbrain:
  best for structured durable memory objects and application-level memory records

local files:
  best for human-auditable notes, specs, checkpoints, and source-controlled memory
```

The memory fabric should not flatten these into one database. It should virtualize access across them.

## Core router contract

The router should expose a small set of operations.

```ts
type MemoryOperation =
  | MemoryRead
  | MemoryWrite
  | MemorySearch
  | MemoryIndex
  | MemoryAudit;

type MemoryEnvelope = {
  operationId: string;
  operation: MemoryOperation;
  intent: string;
  content?: unknown;
  query?: string;
  source: ProvenanceSource;
  scope: MemoryScope;
  privacy: PrivacyPolicy;
  durability: DurabilityPolicy;
  routingHints?: RoutingHints;
  createdAt: string;
};
```

Minimum router methods:

```ts
interface MemoryRouter {
  read(envelope: MemoryEnvelope): Promise<MemoryResult>;
  write(envelope: MemoryEnvelope): Promise<MemoryResult>;
  search(envelope: MemoryEnvelope): Promise<MemoryResult>;
  index(envelope: MemoryEnvelope): Promise<MemoryResult>;
}
```

Minimum adapter contract:

```ts
interface MemoryBackendAdapter {
  id: string;
  capabilities(): BackendCapabilities;
  health(): Promise<BackendHealth>;
  canHandle(envelope: MemoryEnvelope): Promise<RouteScore>;
  execute(envelope: MemoryEnvelope): Promise<MemoryResult>;
}
```

## Routing decision

The router should score possible routes rather than hard-code a single destination too early.

Useful scoring inputs:

```text
intent:
  What kind of memory operation is this?

backend capability:
  Can this backend read, write, search, index, summarize, or audit this data type?

scope:
  Is the memory personal, project-local, organization-wide, public-safe, or private?

durability:
  Is this ephemeral context, session continuity, long-term memory, source-controlled spec, or indexed knowledge?

privacy:
  Is this safe for public docs, private workspace only, credential-adjacent, or sensitive?

freshness:
  Does retrieval need live state, indexed corpus state, or historical transcript state?

cost and latency:
  Is the backend cheap and fast enough for this operation?

provenance requirement:
  Does the result need exact source trace, fuzzy recall, or structured object lineage?
```

Example routing logic:

```text
conversation recall:
  prefer lossless-claw
  optionally enrich with QMD if file-backed memory is relevant

local project knowledge:
  prefer QMD or local file search
  optionally write summary/checkpoint to source-controlled docs

structured profile fact:
  prefer Honcho or gbrain depending on ownership
  require privacy classification before write

durable project decision:
  prefer local markdown/spec file
  index via QMD after write
  optionally attach transcript provenance from lossless-claw

application object memory:
  prefer gbrain
  attach source and schema version
```

## Reconnect and redirect behavior

After intercepting a call, the router reconnects the operation to a backend through an adapter.

The router may choose one of several behaviors:

```text
allow:
  send the call to the originally requested backend

redirect:
  send the call to a different backend

fan out:
  send the operation to multiple backends

enrich:
  add provenance, scope, privacy, or schema metadata before execution

rewrite:
  transform backend-specific arguments into a normalized request

merge:
  combine results from multiple backends into one response

block:
  reject unsafe, low-confidence, or policy-violating operations

defer:
  queue an indexing, summarization, or audit operation for later
```

## Provenance model

Every routed operation should produce a durable audit record.

Minimum audit fields:

```json
{
  "operationId": "memop_...",
  "timestamp": "2026-06-15T20:50:00Z",
  "caller": "agent-or-runtime-id",
  "intent": "conversation_recall",
  "source": {
    "surface": "telegram",
    "conversationId": "project-or-session-id",
    "messageId": "optional"
  },
  "policy": {
    "scope": "project",
    "privacy": "private-workspace",
    "durability": "long-term"
  },
  "routeDecision": {
    "selected": ["lossless-claw"],
    "alternates": ["qmd"],
    "reason": "conversation recall request"
  },
  "backendCalls": [
    {
      "backend": "lossless-claw",
      "nativeOperation": "lcm_expand_query",
      "status": "ok"
    }
  ]
}
```

Audit records make the fabric debuggable. They also let a user ask "why did this memory come back?" and get a source-backed answer.

## Relationship to API CLI Codebridge

API CLI Codebridge already defines the pattern of placing a stable API-style contract in front of local, heterogeneous execution lanes.

Memory fabric routing uses the same shape:

```text
stable public interface
  -> adapter manifest
  -> health check
  -> capability declaration
  -> invocation policy
  -> normalized response
  -> diagnostic trace
```

For model CLIs, the backend is a command-line model runtime.

For memory fabric, the backend is a memory system, transcript ledger, semantic index, API service, or file-backed corpus.

The shared product primitive is an adapter framework with explicit manifests and inspectable routing.

## Suggested adapter manifest additions

The existing adapter manifest concept can be extended for memory backends.

```json
{
  "id": "lossless-claw",
  "kind": "memory-backend",
  "transport": "tool-call",
  "capabilities": {
    "read": true,
    "write": false,
    "search": true,
    "index": false,
    "conversationRecall": true,
    "semanticSearch": false,
    "structuredObjects": false
  },
  "operations": {
    "conversationRecall": {
      "nativeName": "lcm_expand_query",
      "requiredFields": ["query", "prompt"]
    }
  },
  "policy": {
    "defaultScope": "conversation",
    "requiresProvenance": true,
    "allowWrites": false
  }
}
```

## Current implementation status

The repository now contains Phase 0 contract artifacts:

```text
schemas/memory-envelope.schema.json
schemas/memory-result.schema.json
schemas/memory-audit-event.schema.json
examples/memory-adapter-manifest.example.json
scripts/validate_manifest.py support for kind=memory-backend
tests/test_validate_manifest.py
```

What does not exist yet:

```text
in-process memory router
real backend adapters
route scoring function
runtime tool-call hook
transparent proxy
audit log sink
```

This means the plan is schema-backed and testable at the contract layer, but not yet a working router.

## Build plan

### Phase 0: define the contract

Deliverables:

```text
MemoryEnvelope schema
MemoryResult schema
BackendAdapter interface
adapter manifest extension
audit event schema
```

Exit criteria:

```text
synthetic examples validate
router decisions are explainable without real backend calls
```

### Phase 1: explicit wrappers

Deliverables:

```text
memory.read/search/write/index functions
lossless-claw adapter stub
QMD adapter stub
local file adapter stub
synthetic routing tests
```

Exit criteria:

```text
a conversation recall request routes to lossless-claw
a project knowledge request routes to QMD/local files
a durable decision write routes to local markdown plus indexing queue
every operation emits an audit record
```

### Phase 2: real backend integration

Deliverables:

```text
lossless-claw tool-call adapter
QMD CLI/API adapter
Honcho API adapter if available
gbrain API adapter if available
health checks for each adapter
```

Exit criteria:

```text
router can call at least two real backends
health checks can remove unhealthy backends from route candidates
merged retrieval results preserve backend provenance
```

### Phase 3: runtime tool-call interception

Deliverables:

```text
tool-call observation hook
tool-call rewrite policy
legacy-tool compatibility mode
sidecar audit mode
```

Exit criteria:

```text
native calls can be observed without changing caller code
selected calls can be rewritten into memory router calls
unsafe writes can be blocked by policy
```

### Phase 4: transparent proxying

Deliverables:

```text
optional HTTP proxy
request/response capture policy
backend-specific proxy adapters
redaction and privacy filters
```

Exit criteria:

```text
proxy mode captures legacy API traffic
semantic wrappers remain the preferred path for new code
proxy does not become the only source of meaning
```

## Test plan

Minimum tests:

```text
schema validation:
  valid envelopes pass
  missing provenance fails
  unsupported privacy/durability combinations fail

routing tests:
  conversation recall -> lossless-claw
  project corpus search -> QMD
  durable decision write -> local file adapter
  structured object write -> gbrain

policy tests:
  public-safe scope rejects private-only content
  write attempts to read-only adapters fail
  unhealthy adapter is skipped
  low-confidence classification requires explicit fallback

provenance tests:
  every route decision emits an audit record
  merged results retain per-backend sources
  blocked operations record the block reason

compatibility tests:
  native backend call arguments can be generated from normalized envelopes
  adapter response normalizes back into MemoryResult
```

## Main risks

The main technical risk is routing on weak classification. If intent classification is wrong, the router may write to the wrong place or retrieve the wrong evidence.

Mitigation:

```text
keep phase 1 explicit and typed
make route decisions explainable
require confidence thresholds for writes
default uncertain writes to review or local draft files
```

The main product risk is over-flattening memory systems. Each backend has different semantics. A fabric that hides those differences too aggressively will lose useful provenance.

Mitigation:

```text
keep backend identity visible in audit records
preserve native operation names
return source-specific confidence and freshness
avoid pretending all memory is one store
```

The main implementation risk is starting at transparent proxying. Proxying is attractive because it appears universal, but it captures transport before intent.

Mitigation:

```text
build semantic wrappers first
use proxying later for legacy capture and audit
```

## Recommended next move

Build the contract and synthetic router first.

The smallest useful implementation is:

```text
1. define MemoryEnvelope and MemoryResult schemas
2. define adapter manifest extension for memory backends
3. implement an in-process router with synthetic adapters
4. write routing tests for lossless-claw, QMD, Honcho, gbrain, and local files
5. add audit event output for each decision
```

That proves the product shape before any runtime hook or network proxy work begins.

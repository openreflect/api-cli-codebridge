# Model CLI Gateway

Model CLI Gateway is a thin adapter framework for exposing local coding-model CLIs through stable API-style interfaces. It is intended for tools that can call an HTTP provider but need to reach local CLIs with their own authentication, session state, and runtime behavior.

The goal is not to hide the CLI. The goal is to make each CLI lane inspectable, health-checkable, and easy to route through a common interface.

## Why it exists

Modern model CLIs are useful operational substrates, but each one has different invocation rules, auth behavior, streaming shape, and session semantics. Agent runtimes often want one predictable provider contract.

This project captures the public generic pattern for wrapping CLIs behind a small API surface while keeping private credentials, deployment paths, and live routing policy out of the public repo.

## Core idea

```text
OpenAI-style client
        |
        v
Model CLI Gateway
        |
        +--> Claude-style CLI adapter
        +--> Gemini-style CLI adapter
        +--> Codex-style CLI adapter
        +--> other local model CLI adapters
```

Each adapter owns only deterministic translation: request shape, process invocation, session binding, health checks, and response normalization.

## What Model CLI Gateway manages

- CLI adapter manifests.
- Public-safe request and response contracts.
- Health checks and capability probes.
- Session mapping for CLIs that support conversation resumption.
- Streaming and non-streaming response normalization.
- Synthetic fixtures for adapter validation.

## Design principles

- Keep adapters small and auditable.
- Prefer explicit manifests over hidden runtime assumptions.
- Treat auth and live deployment as private downstream concerns.
- Make health checks deterministic.
- Preserve enough raw diagnostic information to debug adapter failures.

## Repository layout

```text
.
├── README.md
├── PRD.md
├── docs/
├── examples/
│   └── adapter-manifest.example.json
├── prompts/
│   └── validate-manifest.prompt.md
├── scripts/
│   └── validate_manifest.py
└── tests/
```

## Current status

This is an initial public-safe project workspace. It contains the intended repository shape, a synthetic adapter manifest, and a deterministic manifest validator.

Run the public-safe check:

```bash
python3 scripts/validate_manifest.py examples/adapter-manifest.example.json
```

## Public/private model

Use this repository as the generic upstream. Keep local CLI binary paths, credential references, live model aliases, proof logs, and runtime routing configuration in private downstream repositories or private branches.

```text
ORG/model-cli-gateway   public generic framework
private downstream fork local adapters, credentials, deployment, logs
```

# validate_manifest.py Prompt

## Intent

Validate that a Model CLI Gateway adapter manifest has the required public-safe fields before it is used by an agent or runtime.

## Inputs

- Path to a JSON adapter manifest.

## Preconditions

- The manifest is synthetic or public-safe.
- The validator must not execute adapter commands.
- The validator must not read credentials.

## Verification

- Return `MANIFEST_OK` when required fields and types are present.
- Return `MANIFEST_INVALID` plus actionable field errors otherwise.

## What not to do

- Do not run the CLI command.
- Do not infer credential paths.
- Do not contact external services.

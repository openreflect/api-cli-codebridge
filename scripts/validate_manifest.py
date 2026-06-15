#!/usr/bin/env python3
"""Validate public-safe API CLI Codebridge adapter manifests."""

from __future__ import annotations

import json
import sys
from pathlib import Path


CLI_REQUIRED_FIELDS = {
    "name": str,
    "displayName": str,
    "command": str,
    "args": list,
    "models": list,
    "supportsStreaming": bool,
    "supportsSessions": bool,
    "healthCheck": dict,
}

MEMORY_REQUIRED_FIELDS = {
    "id": str,
    "displayName": str,
    "kind": str,
    "transport": str,
    "capabilities": dict,
    "operations": dict,
    "policy": dict,
    "healthCheck": dict,
}

MEMORY_CAPABILITIES = {
    "read": bool,
    "write": bool,
    "search": bool,
    "index": bool,
    "conversationRecall": bool,
    "semanticSearch": bool,
    "structuredObjects": bool,
}


def require_fields(data: dict, required: dict[str, type], errors: list[str]) -> None:
    for key, expected_type in required.items():
        if key not in data:
            errors.append(f"missing field: {key}")
        elif not isinstance(data[key], expected_type):
            errors.append(f"wrong type for {key}: expected {expected_type.__name__}")


def validate_health_check(health: object, errors: list[str]) -> None:
    if not isinstance(health, dict):
        return
    if "command" in health:
        if not isinstance(health.get("command"), str):
            errors.append("healthCheck.command must be a string")
        if not isinstance(health.get("args"), list):
            errors.append("healthCheck.args must be a list")
    elif "mode" in health:
        if not isinstance(health.get("mode"), str):
            errors.append("healthCheck.mode must be a string")
        if not isinstance(health.get("timeoutMs"), int):
            errors.append("healthCheck.timeoutMs must be an integer")
    else:
        errors.append("healthCheck must define either command or mode")
    if "timeoutMs" in health and not isinstance(health.get("timeoutMs"), int):
        errors.append("healthCheck.timeoutMs must be an integer")


def validate_cli_manifest(data: dict, errors: list[str]) -> None:
    require_fields(data, CLI_REQUIRED_FIELDS, errors)
    validate_health_check(data.get("healthCheck", {}), errors)


def validate_memory_manifest(data: dict, errors: list[str]) -> None:
    require_fields(data, MEMORY_REQUIRED_FIELDS, errors)
    if data.get("kind") != "memory-backend":
        errors.append("kind must be memory-backend")
    if data.get("transport") not in {"tool-call", "api", "cli", "file-index", "local-file"}:
        errors.append("transport must be one of: tool-call, api, cli, file-index, local-file")

    capabilities = data.get("capabilities", {})
    if isinstance(capabilities, dict):
        require_fields(capabilities, MEMORY_CAPABILITIES, errors)

    operations = data.get("operations", {})
    if isinstance(operations, dict):
        if not operations:
            errors.append("operations must define at least one operation")
        for name, operation in operations.items():
            if not isinstance(operation, dict):
                errors.append(f"operations.{name} must be an object")
                continue
            if not isinstance(operation.get("nativeName"), str):
                errors.append(f"operations.{name}.nativeName must be a string")
            if not isinstance(operation.get("requiredFields"), list):
                errors.append(f"operations.{name}.requiredFields must be a list")

    policy = data.get("policy", {})
    if isinstance(policy, dict):
        if not isinstance(policy.get("requiresProvenance"), bool):
            errors.append("policy.requiresProvenance must be a boolean")
        if not isinstance(policy.get("allowWrites"), bool):
            errors.append("policy.allowWrites must be a boolean")

    validate_health_check(data.get("healthCheck", {}), errors)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_manifest.py path/to/adapter-manifest.json", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    data = json.loads(path.read_text(encoding="utf-8"))

    errors: list[str] = []
    if data.get("kind") == "memory-backend":
        validate_memory_manifest(data, errors)
    else:
        validate_cli_manifest(data, errors)

    if errors:
        print("MANIFEST_INVALID")
        for error in errors:
            print(f"- {error}")
        return 1

    print("MANIFEST_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

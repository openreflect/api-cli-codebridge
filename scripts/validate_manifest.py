#!/usr/bin/env python3
"""Validate a public-safe Model CLI Gateway adapter manifest."""

from __future__ import annotations

import json
import sys
from pathlib import Path


REQUIRED_FIELDS = {
    "name": str,
    "displayName": str,
    "command": str,
    "args": list,
    "models": list,
    "supportsStreaming": bool,
    "supportsSessions": bool,
    "healthCheck": dict,
}


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: validate_manifest.py path/to/adapter-manifest.json", file=sys.stderr)
        return 2

    path = Path(sys.argv[1])
    data = json.loads(path.read_text(encoding="utf-8"))

    errors: list[str] = []
    for key, expected_type in REQUIRED_FIELDS.items():
        if key not in data:
            errors.append(f"missing field: {key}")
        elif not isinstance(data[key], expected_type):
            errors.append(f"wrong type for {key}: expected {expected_type.__name__}")

    health = data.get("healthCheck", {})
    if isinstance(health, dict):
        if not isinstance(health.get("command"), str):
            errors.append("healthCheck.command must be a string")
        if not isinstance(health.get("args"), list):
            errors.append("healthCheck.args must be a list")
        if not isinstance(health.get("timeoutMs"), int):
            errors.append("healthCheck.timeoutMs must be an integer")

    if errors:
        print("MANIFEST_INVALID")
        for error in errors:
            print(f"- {error}")
        return 1

    print("MANIFEST_OK")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

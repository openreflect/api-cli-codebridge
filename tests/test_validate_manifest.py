import json
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
VALIDATOR = ROOT / "scripts" / "validate_manifest.py"


def run_validator(path: Path) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["python3", str(VALIDATOR), str(path)],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=False,
    )


class ValidateManifestTests(unittest.TestCase):
    def test_cli_manifest_example_is_valid(self) -> None:
        result = run_validator(ROOT / "examples" / "adapter-manifest.example.json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("MANIFEST_OK", result.stdout)

    def test_memory_manifest_example_is_valid(self) -> None:
        result = run_validator(ROOT / "examples" / "memory-adapter-manifest.example.json")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("MANIFEST_OK", result.stdout)

    def test_memory_manifest_requires_provenance_policy(self) -> None:
        data = json.loads((ROOT / "examples" / "memory-adapter-manifest.example.json").read_text())
        del data["policy"]["requiresProvenance"]

        with tempfile.NamedTemporaryFile("w", suffix=".json", delete=False) as handle:
            json.dump(data, handle)
            temp_path = Path(handle.name)

        try:
            result = run_validator(temp_path)
        finally:
            temp_path.unlink(missing_ok=True)

        self.assertEqual(result.returncode, 1)
        self.assertIn("policy.requiresProvenance must be a boolean", result.stdout)


if __name__ == "__main__":
    unittest.main()

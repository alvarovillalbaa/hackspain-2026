#!/usr/bin/env python3
"""Summarize a repository for agentic execution."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
from pathlib import Path


PRUNE_DIRS = {
    ".agents",
    ".codex",
    ".git",
    ".hg",
    ".pytest_cache",
    ".svn",
    ".next",
    "coverage",
    "dist",
    "build",
    "htmlcov",
    ".venv",
    "venv",
    "__pycache__",
    "node_modules",
    "static",
}

DOC_FILES = {
    "AGENTS.md",
    "CLAUDE.md",
    "CURSOR.md",
    "SOUL.md",
    "PRINCIPLES.md",
    "PLANS.md",
    "README.md",
    "CONTRIBUTING.md",
    "ARCHITECTURE.md",
    "TESTS.md",
    "TESTING.md",
}

MANIFEST_FILES = {
    "package.json",
    "pnpm-lock.yaml",
    "yarn.lock",
    "package-lock.json",
    "pnpm-workspace.yaml",
    "turbo.json",
    "requirements.txt",
    "pyproject.toml",
    "Pipfile",
    "poetry.lock",
    "go.mod",
    "Cargo.toml",
    "Gemfile",
    "manage.py",
    "Dockerfile",
    "docker-compose.yml",
    "docker-compose.yaml",
}

OBSERVABILITY_PATTERNS = {
    "sentry": r"sentry",
    "posthog": r"posthog",
    "amplitude": r"amplitude",
    "datadog": r"datadog|ddtrace",
    "opentelemetry": r"opentelemetry|otel",
    "newrelic": r"newrelic|new relic",
    "honeycomb": r"honeycomb",
    "bugsnag": r"bugsnag",
    "rollbar": r"rollbar",
    "segment": r"@segment|analytics-next|analytics-node|segmentio|segment\.io|SEGMENT_WRITE_KEY",
    "mixpanel": r"mixpanel",
    "launchdarkly": r"launchdarkly|ldclient",
    "structured-logging": (
        r"structlog|loguru|winston|pino|bunyan|logging\.getLogger|"
        r"logger = logging\.getLogger|log_error|log_warning|SystemLog"
    ),
}

DOC_SKIP_PREFIXES = (
    "docs/deprecated/",
    "docs/deprecated-",
)


def run(cmd: list[str], cwd: Path) -> tuple[int, str]:
    """Run a command and return exit code plus stdout."""
    try:
        completed = subprocess.run(
            cmd,
            cwd=cwd,
            text=True,
            capture_output=True,
            check=False,
        )
    except FileNotFoundError:
        return 127, ""
    return completed.returncode, completed.stdout.strip()


def find_named_files(root: Path, names: set[str], max_depth: int = 3) -> list[Path]:
    """Find files with selected names while keeping traversal shallow."""
    matches: list[Path] = []
    for dirpath, dirnames, filenames in os.walk(root):
        rel_dir = Path(dirpath).relative_to(root)
        if len(rel_dir.parts) > max_depth:
            dirnames[:] = []
            continue
        dirnames[:] = [name for name in dirnames if name not in PRUNE_DIRS]
        for filename in filenames:
            if filename in names:
                matches.append(Path(dirpath) / filename)
    return sorted(matches)


def relative_paths(root: Path, paths: list[Path]) -> list[str]:
    return [str(path.relative_to(root)) for path in paths]


def filter_relative_prefixes(paths: list[str], prefixes: tuple[str, ...]) -> list[str]:
    return [path for path in paths if not path.startswith(prefixes)]


def detect_package_runner(root: Path, package_json: Path | None) -> str:
    if (root / "pnpm-lock.yaml").exists() or (root / "pnpm-workspace.yaml").exists():
        return "pnpm"
    if (root / "yarn.lock").exists():
        return "yarn"
    if package_json:
        try:
            data = json.loads(package_json.read_text())
        except (OSError, json.JSONDecodeError):
            return "npm"
        package_manager = data.get("packageManager", "")
        if package_manager.startswith("pnpm"):
            return "pnpm"
        if package_manager.startswith("yarn"):
            return "yarn"
    return "npm"


def parse_package_scripts(package_json: Path) -> dict[str, str]:
    try:
        data = json.loads(package_json.read_text())
    except (OSError, json.JSONDecodeError):
        return {}
    scripts = data.get("scripts", {})
    return {key: str(value) for key, value in scripts.items() if isinstance(value, str)}


def detect_stack(root: Path, manifests: list[Path]) -> list[str]:
    names = {path.name for path in manifests}
    stack: list[str] = []
    if "manage.py" in names:
        stack.append("python/django")
    elif "pyproject.toml" in names or "requirements.txt" in names or "Pipfile" in names:
        stack.append("python")
    if "package.json" in names:
        if any((root / name).exists() for name in ("next.config.js", "next.config.ts", "next.config.mjs")):
            stack.append("nextjs")
        elif any((root / name).exists() for name in ("vite.config.ts", "vite.config.js", "vite.config.mjs")):
            stack.append("vite")
        else:
            stack.append("node/javascript")
    if "Cargo.toml" in names:
        stack.append("rust")
    if "go.mod" in names:
        stack.append("go")
    if "Gemfile" in names:
        stack.append("ruby")
    if any(path.name == "Dockerfile" for path in manifests):
        stack.append("containerized")
    if (root / ".github" / "workflows").exists():
        stack.append("github-actions")
    return stack


def detect_commands(root: Path, manifests: list[Path]) -> list[dict[str, str]]:
    commands: list[dict[str, str]] = []
    package_json = next((path for path in manifests if path.name == "package.json"), None)
    if package_json:
        runner = detect_package_runner(root, package_json)
        scripts = parse_package_scripts(package_json)
        for kind in ("dev", "test", "lint", "build", "typecheck"):
            if kind in scripts:
                commands.append(
                    {
                        "kind": kind,
                        "command": f"{runner} run {kind}" if runner != "yarn" else f"yarn {kind}",
                    }
                )
    if any(path.name in {"pyproject.toml", "requirements.txt", "Pipfile"} for path in manifests):
        if (root / "tests").exists() or (root / "pytest.ini").exists():
            commands.append({"kind": "test", "command": "pytest"})
        if any((root / name).exists() for name in ("ruff.toml", ".ruff.toml")):
            commands.append({"kind": "lint", "command": "ruff check ."})
        if (root / "manage.py").exists():
            commands.append({"kind": "dev", "command": "python manage.py runserver"})
    if any(path.name == "Cargo.toml" for path in manifests):
        commands.extend(
            [
                {"kind": "build", "command": "cargo build"},
                {"kind": "test", "command": "cargo test"},
            ]
        )
    if any(path.name == "go.mod" for path in manifests):
        commands.extend(
            [
                {"kind": "build", "command": "go build ./..."},
                {"kind": "test", "command": "go test ./..."},
            ]
        )
    if any(path.name == "Gemfile" for path in manifests):
        commands.append({"kind": "test", "command": "bundle exec rspec"})

    deduped: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for item in commands:
        key = (item["kind"], item["command"])
        if key not in seen:
            deduped.append(item)
            seen.add(key)
    return deduped


def detect_observability(root: Path) -> dict[str, list[str]]:
    found: dict[str, list[str]] = {}
    for name, pattern in OBSERVABILITY_PATTERNS.items():
        code, output = run(
            [
                "rg",
                "-l",
                "-i",
                "-m",
                "5",
                "-g",
                "*.py",
                "-g",
                "*.js",
                "-g",
                "*.jsx",
                "-g",
                "*.ts",
                "-g",
                "*.tsx",
                "-g",
                "*.json",
                "-g",
                "*.toml",
                "-g",
                "*.ini",
                "-g",
                "*.yaml",
                "-g",
                "*.yml",
                "-g",
                "*.env",
                "-g",
                "*.env.*",
                "-g",
                "!docs/**",
                "-g",
                "!static/**",
                "-g",
                "!.agents/**",
                "-g",
                "!.codex/**",
                "-g",
                "!node_modules",
                "-g",
                "!.git",
                "-g",
                "!.next",
                "-g",
                "!dist",
                "-g",
                "!build",
                "-g",
                "!coverage",
                "-g",
                "!htmlcov",
                pattern,
                ".",
            ],
            root,
        )
        if code not in {0, 1}:
            continue
        matches = [line for line in output.splitlines() if line][:5]
        if matches:
            found[name] = matches
    return found


def detect_skills(root: Path) -> list[str]:
    skills: list[str] = []
    for base in (root / ".agents" / "skills", root / ".codex" / "skills"):
        if not base.exists():
            continue
        for path in sorted(base.iterdir()):
            if path.is_dir() and (path / "SKILL.md").exists():
                skills.append(path.name)
    return skills


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", default=".", help="repository path")
    parser.add_argument("--json", action="store_true", help="emit JSON")
    args = parser.parse_args()

    start = Path(args.path).resolve()
    git_code, git_root_output = run(["git", "rev-parse", "--show-toplevel"], start)
    root = Path(git_root_output).resolve() if git_code == 0 and git_root_output else start

    docs = find_named_files(root, DOC_FILES)
    manifests = find_named_files(root, MANIFEST_FILES)
    git_branch_code, git_branch = run(["git", "branch", "--show-current"], root)
    _, git_status = run(["git", "status", "--short"], root)
    _, worktrees = run(["git", "worktree", "list"], root)

    data = {
        "root": str(root),
        "git": {
            "branch": git_branch if git_branch_code == 0 else "",
            "dirty_files": len([line for line in git_status.splitlines() if line]),
            "worktrees": [line for line in worktrees.splitlines() if line],
        },
        "instruction_files": filter_relative_prefixes(relative_paths(root, docs), DOC_SKIP_PREFIXES),
        "manifests": relative_paths(root, manifests),
        "stack": detect_stack(root, manifests),
        "commands": detect_commands(root, manifests),
        "observability": detect_observability(root),
        "local_skills": detect_skills(root),
    }

    if args.json:
        print(json.dumps(data, indent=2, sort_keys=True))
        return 0

    print(f"Repository: {data['root']}")
    print("Git:")
    branch = data["git"]["branch"] or "(not a git repo)"
    print(f"- branch: {branch}")
    print(f"- dirty files: {data['git']['dirty_files']}")
    print(f"- worktrees: {len(data['git']['worktrees'])}")

    print("Instruction files:")
    if data["instruction_files"]:
        for item in data["instruction_files"]:
            print(f"- {item}")
    else:
        print("- none detected in the first 3 levels")

    print("Key manifests:")
    if data["manifests"]:
        for item in data["manifests"]:
            print(f"- {item}")
    else:
        print("- none detected in the first 3 levels")

    print("Likely stack:")
    if data["stack"]:
        for item in data["stack"]:
            print(f"- {item}")
    else:
        print("- unknown")

    print("Likely commands:")
    if data["commands"]:
        for item in data["commands"]:
            print(f"- {item['kind']}: {item['command']}")
    else:
        print("- no strong candidates detected")

    print("Observability signals:")
    if data["observability"]:
        for name, matches in data["observability"].items():
            joined = ", ".join(matches)
            print(f"- {name}: {joined}")
    else:
        print("- none detected from common tool patterns")

    print("Local skills:")
    if data["local_skills"]:
        for skill in data["local_skills"][:20]:
            print(f"- {skill}")
    else:
        print("- none detected")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())

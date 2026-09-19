#!/usr/bin/env python3
"""Scan a repository and suggest QA commands and references."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable


def has_any(root: Path, names: Iterable[str]) -> bool:
    return any((root / name).exists() for name in names)


def read_text(path: Path) -> str:
    try:
        return path.read_text()
    except OSError:
        return ""


def detect_languages(root: Path) -> list[str]:
    languages: list[str] = []
    if has_any(root, ["pyproject.toml", "requirements.txt", "manage.py", "setup.py"]):
        languages.append("python")
    if (root / "package.json").exists():
        languages.append("javascript-or-typescript")
    if has_any(root, ["Gemfile"]):
        languages.append("ruby")
    if has_any(root, ["go.mod"]):
        languages.append("go")
    if has_any(root, ["Cargo.toml"]):
        languages.append("rust")
    return languages


def detect_frameworks(root: Path) -> list[str]:
    frameworks: list[str] = []
    package_json = read_text(root / "package.json")
    pyproject = read_text(root / "pyproject.toml")
    requirements = read_text(root / "requirements.txt")

    if (root / "manage.py").exists() or "django" in pyproject.lower() or "django" in requirements.lower():
        frameworks.append("django")
    if "fastapi" in pyproject.lower() or "fastapi" in requirements.lower():
        frameworks.append("fastapi")
    if "flask" in pyproject.lower() or "flask" in requirements.lower():
        frameworks.append("flask")
    if '"next"' in package_json:
        frameworks.append("nextjs")
    if '"react"' in package_json:
        frameworks.append("react")
    if '"vue"' in package_json:
        frameworks.append("vue")
    if '"svelte"' in package_json:
        frameworks.append("svelte")
    if '"express"' in package_json:
        frameworks.append("express")
    return frameworks


def detect_ci(root: Path) -> list[str]:
    providers: list[str] = []
    if (root / ".github" / "workflows").exists():
        providers.append("github-actions")
    if (root / ".gitlab-ci.yml").exists():
        providers.append("gitlab-ci")
    if (root / ".circleci" / "config.yml").exists():
        providers.append("circleci")
    if (root / ".buildkite").exists() or (root / "buildkite.yml").exists():
        providers.append("buildkite")
    if (root / "azure-pipelines.yml").exists():
        providers.append("azure-pipelines")
    if (root / "buildspec.yml").exists() or (root / "buildspec.yaml").exists():
        providers.append("aws-codebuild")
    return providers


def detect_test_runners(root: Path) -> list[str]:
    runners: list[str] = []
    package_json = read_text(root / "package.json")
    pyproject = read_text(root / "pyproject.toml")
    requirements = read_text(root / "requirements.txt")
    if has_any(root, ["pytest.ini", "conftest.py"]) or "pytest" in pyproject or "pytest" in requirements:
        runners.append("pytest")
    if '"vitest"' in package_json:
        runners.append("vitest")
    if '"jest"' in package_json:
        runners.append("jest")
    if '"playwright"' in package_json:
        runners.append("playwright")
    if '"cypress"' in package_json:
        runners.append("cypress")
    if (root / "Gemfile").exists() and "rspec" in read_text(root / "Gemfile").lower():
        runners.append("rspec")
    if (root / "go.mod").exists():
        runners.append("go-test")
    if (root / "Cargo.toml").exists():
        runners.append("cargo-test")
    return runners


def detect_linters(root: Path) -> list[str]:
    tools: list[str] = []
    package_json = read_text(root / "package.json")
    pyproject = read_text(root / "pyproject.toml")
    requirements = read_text(root / "requirements.txt")
    if "ruff" in pyproject or "ruff" in requirements or (root / "ruff.toml").exists() or (root / ".ruff.toml").exists():
        tools.append("ruff")
    if "mypy" in pyproject or "mypy" in requirements:
        tools.append("mypy")
    if "pyright" in package_json or "pyright" in pyproject:
        tools.append("pyright")
    if '"eslint"' in package_json:
        tools.append("eslint")
    if '"prettier"' in package_json:
        tools.append("prettier")
    if (root / "Gemfile").exists() and "rubocop" in read_text(root / "Gemfile").lower():
        tools.append("rubocop")
    return tools


def suggested_commands(root: Path, runners: list[str], linters: list[str]) -> list[str]:
    commands: list[str] = []
    package_json = read_text(root / "package.json")

    if (root / "Makefile").exists():
        makefile = read_text(root / "Makefile")
        for target in ("lint", "typecheck", "test", "coverage"):
            if f"{target}:" in makefile:
                commands.append(f"make {target}")

    if "ruff" in linters:
        commands.extend(["ruff check .", "ruff format --check ."])
    if "mypy" in linters:
        commands.append("mypy .")
    if "pyright" in linters:
        commands.append("pyright")
    if "pytest" in runners:
        commands.append("pytest -q")
    if '"lint"' in package_json:
        commands.append("npm run lint")
    if '"typecheck"' in package_json:
        commands.append("npm run typecheck")
    if '"test:unit"' in package_json:
        commands.append("npm run test:unit")
    elif '"test"' in package_json:
        commands.append("npm test")
    if "playwright" in runners:
        commands.append("npx playwright test")
    if "cypress" in runners:
        commands.append("npx cypress run")
    if "go-test" in runners:
        commands.append("go test ./...")
    if "cargo-test" in runners:
        commands.append("cargo test")
    return commands


def suggested_references(languages: list[str], frameworks: list[str], ci: list[str]) -> list[str]:
    refs = ["code-review.md", "test-strategy.md", "debugging.md", "verification.md"]
    if any(name in frameworks for name in ("django", "fastapi", "flask", "express")) or "python" in languages or "ruby" in languages or "go" in languages:
        refs.append("backend-testing.md")
    if any(name in frameworks for name in ("react", "nextjs", "vue", "svelte")) or "javascript-or-typescript" in languages:
        refs.append("frontend-testing.md")
    if ci:
        refs.extend(["ci-cd.md", "suite-architecture.md"])
    return refs


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("path", nargs="?", default=".", help="repository path")
    args = parser.parse_args()

    root = Path(args.path).resolve()

    languages = detect_languages(root)
    frameworks = detect_frameworks(root)
    ci = detect_ci(root)
    runners = detect_test_runners(root)
    linters = detect_linters(root)
    commands = suggested_commands(root, runners, linters)
    references = suggested_references(languages, frameworks, ci)

    payload = {
        "repo": str(root),
        "languages": languages,
        "frameworks": frameworks,
        "ci_providers": ci,
        "test_runners": runners,
        "linters_and_types": linters,
        "suggested_commands": commands,
        "suggested_references": references,
    }

    print("# QA scan")
    print()
    print(f"Repo: {payload['repo']}")
    print()
    print("## Stack")
    print(f"- Languages: {', '.join(languages) if languages else 'none detected'}")
    print(f"- Frameworks: {', '.join(frameworks) if frameworks else 'none detected'}")
    print(f"- CI: {', '.join(ci) if ci else 'none detected'}")
    print(f"- Test runners: {', '.join(runners) if runners else 'none detected'}")
    print(f"- Linters/types: {', '.join(linters) if linters else 'none detected'}")
    print()
    print("## Likely commands")
    for command in commands or ["none detected"]:
        print(f"- {command}")
    print()
    print("## Load these references first")
    for ref in references:
        print(f"- references/{ref}")
    print()
    print("## JSON")
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()

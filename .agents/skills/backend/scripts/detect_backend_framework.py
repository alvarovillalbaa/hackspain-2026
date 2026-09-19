#!/usr/bin/env python3
"""Detect the backend framework(s) and version(s) used in a project.

Scans common manifest files (package.json, requirements.txt, pyproject.toml,
go.mod, Cargo.toml, pom.xml, build.gradle, Gemfile) and reports detected
frameworks with their declared versions where available.

Usage:
    python detect_backend_framework.py [project_root]
    python detect_backend_framework.py . --json
"""

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Dict, List


NODE_FRAMEWORKS = {
    "express": "Express",
    "@nestjs/core": "NestJS",
    "fastify": "Fastify",
    "koa": "Koa",
    "next": "Next.js (API routes)",
    "@hapi/hapi": "hapi",
}

PY_FRAMEWORKS = {
    "djangorestframework": "Django REST Framework",
    "django": "Django",
    "fastapi": "FastAPI",
    "flask": "Flask",
    "sanic": "Sanic",
    "tornado": "Tornado",
}


def detect_node(root: Path, found: List[Dict[str, str]]) -> None:
    pkg = root / "package.json"
    if not pkg.exists():
        return
    try:
        data = json.loads(pkg.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return
    deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
    for dep, name in NODE_FRAMEWORKS.items():
        if dep in deps:
            found.append({"language": "node", "framework": name,
                          "version": deps[dep].lstrip("^~")})


def _scan_text_for(reqs: str, mapping: Dict[str, str], language: str,
                   source: str, found: List[Dict[str, str]]) -> None:
    seen = {f["framework"] for f in found}
    for dep, name in mapping.items():
        m = re.search(rf"(?im)^\s*{re.escape(dep)}\s*([=><~!]+\s*[\w.\*]+)?", reqs)
        if m and name not in seen:
            version = (m.group(1) or "").strip().lstrip("=><~! ") or "unspecified"
            found.append({"language": language, "framework": name,
                          "version": version, "source": source})
            seen.add(name)


def detect_python(root: Path, found: List[Dict[str, str]]) -> None:
    for fname in ("requirements.txt", "pyproject.toml", "Pipfile", "setup.cfg"):
        f = root / fname
        if f.exists():
            try:
                _scan_text_for(f.read_text(encoding="utf-8"), PY_FRAMEWORKS,
                               "python", fname, found)
            except OSError:
                continue


def detect_other(root: Path, found: List[Dict[str, str]]) -> None:
    if (root / "go.mod").exists():
        found.append({"language": "go", "framework": "Go module", "version": "n/a"})
    if (root / "Cargo.toml").exists():
        found.append({"language": "rust", "framework": "Cargo project", "version": "n/a"})
    if (root / "pom.xml").exists() or (root / "build.gradle").exists() \
            or (root / "build.gradle.kts").exists():
        found.append({"language": "jvm", "framework": "JVM (Maven/Gradle)", "version": "n/a"})
    gemfile = root / "Gemfile"
    if gemfile.exists():
        try:
            text = gemfile.read_text(encoding="utf-8")
            if re.search(r"(?im)^\s*gem\s+['\"]rails['\"]", text):
                found.append({"language": "ruby", "framework": "Rails", "version": "n/a"})
        except OSError:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(description="Detect backend framework(s).")
    parser.add_argument("root", nargs="?", default=".", help="Project root")
    parser.add_argument("--json", action="store_true", help="Emit JSON")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    if not root.is_dir():
        print(f"ERROR: {root} is not a directory", file=sys.stderr)
        return 1

    found: List[Dict[str, str]] = []
    detect_node(root, found)
    detect_python(root, found)
    detect_other(root, found)

    if args.json:
        print(json.dumps({"root": str(root), "frameworks": found}, indent=2))
        return 0

    if not found:
        print(f"No backend framework detected under {root}")
        return 0

    print(f"Backend frameworks detected under {root}:")
    for f in found:
        src = f" (from {f['source']})" if f.get("source") else ""
        print(f"  - {f['framework']} [{f['language']}] {f['version']}{src}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

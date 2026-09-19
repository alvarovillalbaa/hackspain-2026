#!/usr/bin/env python3
"""Inventory likely local memory files without reading their contents."""

from __future__ import annotations

import argparse
import json
import os
from datetime import datetime, timezone
from pathlib import Path


DEFAULT_NAMES = {"memory.md", "memories.md"}
DEFAULT_DIRS = {"memory", "memories"}
SKIP_DIRS = {".git", "node_modules", "vendor", "dist", "build", "__pycache__"}


def looks_like_memory(path: Path) -> bool:
    name = path.name.lower()
    parent_names = {part.lower() for part in path.parts[:-1]}
    return (
        name in DEFAULT_NAMES
        or name.endswith(".memory.md")
        or bool(parent_names & DEFAULT_DIRS) and path.suffix.lower() in {".md", ".json", ".jsonl", ".yaml", ".yml"}
    )


def inventory(root: Path, max_depth: int, max_files: int) -> tuple[list[dict[str, object]], bool]:
    root = root.resolve()
    records: list[dict[str, object]] = []
    truncated = False

    for current, dirs, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        depth = len(current_path.relative_to(root).parts)
        dirs[:] = sorted(
            name
            for name in dirs
            if name not in SKIP_DIRS
            and not name.startswith(".")
            and not (current_path / name).is_symlink()
        )
        if depth >= max_depth:
            dirs[:] = []

        for name in sorted(files):
            if name.startswith("."):
                continue
            path = current_path / name
            if path.is_symlink() or not looks_like_memory(path):
                continue
            stat = path.stat()
            records.append(
                {
                    "path": path.relative_to(root).as_posix(),
                    "size_bytes": stat.st_size,
                    "modified_at": datetime.fromtimestamp(stat.st_mtime, tz=timezone.utc).isoformat(),
                }
            )
            if len(records) >= max_files:
                truncated = True
                return records, truncated

    return records, truncated


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="List metadata for likely memory files under one explicit local root."
    )
    parser.add_argument("root", type=Path, help="Authorized directory to scan")
    parser.add_argument("--max-depth", type=int, default=5)
    parser.add_argument("--max-files", type=int, default=200)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.root.is_dir():
        raise SystemExit(f"Not a directory: {args.root}")
    if args.max_depth < 0 or args.max_files < 1:
        raise SystemExit("--max-depth must be non-negative and --max-files must be positive")

    records, truncated = inventory(args.root, args.max_depth, args.max_files)
    print(
        json.dumps(
            {
                "root": str(args.root.resolve()),
                "content_read": False,
                "count": len(records),
                "truncated": truncated,
                "candidates": records,
            },
            indent=2,
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

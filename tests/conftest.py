"""Pytest root config: auto-markers from folder, legacy deselected via addopts."""

from __future__ import annotations

from pathlib import Path

import pytest

FOLDER_MARKERS = {
    "unit": "unit",
    "integration": "integration",
    "adversarial": "adversarial",
    "evals": "evals",
    "regression": "regression",
}


def pytest_ignore_collect(collection_path: Path, config: pytest.Config) -> bool | None:
    """Skip legacy packages at collection time (they need polars / old path hacks)."""
    parts = Path(collection_path).parts
    if "legacy" not in parts:
        return None
    markexpr = config.option.markexpr or ""
    # Collect only when the user explicitly asks for legacy.
    if "legacy" in markexpr and "not legacy" not in markexpr:
        return None
    return True


def pytest_collection_modifyitems(config: pytest.Config, items: list[pytest.Item]) -> None:
    root = Path(config.rootpath) / "tests"
    for item in items:
        try:
            rel = Path(item.path).resolve().relative_to(root)
        except ValueError:
            continue
        parts = rel.parts
        if not parts:
            continue
        if "legacy" in parts:
            item.add_marker(pytest.mark.legacy)
        top = parts[0]
        if top in FOLDER_MARKERS:
            item.add_marker(getattr(pytest.mark, FOLDER_MARKERS[top]))

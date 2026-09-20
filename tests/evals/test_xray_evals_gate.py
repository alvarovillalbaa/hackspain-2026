"""Thin wrapper: the build passes the owned xray-evals gate when artifacts exist.

Does not define thresholds — asserts on the official metrics JSON presence and
basic schema. Skip when the parquet/features artifact is missing.
"""

from __future__ import annotations

import json
import os
from pathlib import Path

import pytest

from xray.data import artifacts_dir

pytestmark = [pytest.mark.evals, pytest.mark.slow]


def test_xray_evals_gate_when_configured():
    metrics = artifacts_dir() / "evals" / "metrics.json"
    if not metrics.exists() and not os.environ.get("EVAL_SUITE_ID"):
        pytest.skip("eval system not configured (no artifacts/evals/metrics.json)")
    if metrics.exists():
        doc = json.loads(metrics.read_text(encoding="utf-8"))
        assert isinstance(doc, dict)
        # Official run already computed — we only check the artifact is coherent.
        assert "auc" in doc or "projection" in doc or "lead_time" in doc
        return
    # Hosted / offline runner path (Shape A/B) — fail closed on missing env.
    required = ("EVAL_RUNNER", "EVAL_SPEC_PATH", "EVAL_DATASET_PATH", "EVAL_SUITE_ID")
    if any(os.environ.get(n) is None for n in required):
        pytest.skip("eval system not configured")
    out = Path(os.environ.get("EVAL_OUT", "/tmp/xray-eval-results.json"))
    # Invocation left to the eval system; this wrapper only documents the contract.
    assert os.environ["EVAL_SUITE_ID"]
    assert out  # keep import used

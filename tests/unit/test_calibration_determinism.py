"""Verifica que la mitad determinista del sistema tiene varianza cero.

Calibración agéntica (docs/calibration.md): el score Python no es estocástico.
Dos ejecuciones de score_table sobre el mismo fixture deben ser byte-idénticas
en la tabla de salida y en el modelo isotónico serializado.
"""

from __future__ import annotations

import json
from dataclasses import asdict

import pandas as pd

from xray import features, score


def test_score_table_is_byte_identical_across_two_runs():
    fixture = features.load_fixture()
    a, model_a = score.score_table(fixture)
    b, model_b = score.score_table(fixture)

    pd.testing.assert_frame_equal(a, b)
    assert asdict(model_a) == asdict(model_b)


def test_rules_model_json_roundtrip_is_stable(tmp_path):
    fixture = features.load_fixture()
    _, model = score.score_table(fixture)
    path = tmp_path / "rules_model.json"
    model.save(path)

    raw1 = json.loads(path.read_text())
    model.save(path)
    raw2 = json.loads(path.read_text())
    assert raw1 == raw2

import pandas as pd

from xray.calibration import CalibrationArtifact, ConformalScoreCalibrator, fit_calibration_artifact
from xray.forecast import BaselineForecaster
from xray.ledger import Ledger


def test_conformal_uses_only_explicit_oof_rows():
    frame = pd.DataFrame(
        {
            "horizon_days": [30, 30, 30],
            "actual": [40, 50, 60],
            "prediction": [42, 48, 55],
            "is_out_of_fold": [True, True, True],
        }
    )
    calibrator = ConformalScoreCalibrator().fit(frame)
    low, high = calibrator.interval(50, 30)
    assert low < 50 < high
    frame.loc[0, "is_out_of_fold"] = False
    try:
        ConformalScoreCalibrator().fit(frame)
    except ValueError:
        pass
    else:
        raise AssertionError("in-sample calibration row was accepted")


def test_fitted_artifact_adds_intervals_and_probabilities(mini_cache, tmp_path):
    rows = []
    for index in range(12):
        rows.append(
            {
                "horizon_days": 30,
                "actual_score": 35 + index * 2,
                "predicted_score": 38 + index * 1.5,
                "current_score": 50,
                "confidence": "B",
                "is_out_of_fold": True,
            }
        )
    artifact = fit_calibration_artifact(pd.DataFrame(rows), minimum_tier_size=5)
    path = tmp_path / "calibration.pkl"
    artifact.save(path)
    loaded = CalibrationArtifact.load(path)
    forecast = BaselineForecaster(Ledger(mini_cache)).forecast(
        "C1", "2024-07-31", horizon_days=30, score_horizons=(30,)
    )
    calibrated = loaded.apply(forecast, current_score=50)
    assert calibrated.calibration_status == "calibrated_out_of_fold"
    assert calibrated.intervals[30] is not None
    assert set(calibrated.threshold_probabilities[30]) == {
        "score_below_40",
        "decline_at_least_15",
    }

import pandas as pd

from xray.calibration import ConformalScoreCalibrator


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

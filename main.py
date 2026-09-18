from __future__ import annotations

import argparse
import sys
from pathlib import Path


def _arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build explainable monthly treasury resilience scores."
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        default=Path("dataset"),
        help="Directory containing the challenge CSV files (default: dataset).",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("artifacts/score"),
        help="Directory for score outputs (default: artifacts/score).",
    )
    parser.add_argument(
        "--profile",
        type=Path,
        help="Optional fitted score_profile.json. Omit to fit a new frozen reference profile.",
    )
    return parser.parse_args()


def main() -> int:
    arguments = _arguments()
    sys.path.insert(0, str(Path(__file__).parent / "src"))

    from xray_score import ScorePipeline

    result = ScorePipeline(
        data_dir=arguments.data_dir,
        output_dir=arguments.output_dir,
        profile_path=arguments.profile,
    ).run()
    latest_month = result.company_scores.get_column("month").max()
    print(
        f"Scored {result.company_scores.get_column('company_id').n_unique()} companies "
        f"and {result.group_scores.get_column('group_id').n_unique()} groups through {latest_month}."
    )
    print(f"Outputs: {result.output_dir.resolve()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

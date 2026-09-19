from __future__ import annotations

import argparse
from pathlib import Path

from .pipeline import ScorePipeline


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Build explainable monthly treasury resilience scores."
    )
    parser.add_argument("--data-dir", type=Path, default=Path("dataset"))
    parser.add_argument("--output-dir", type=Path, default=Path("artifacts/score"))
    parser.add_argument("--profile", type=Path)
    arguments = parser.parse_args()

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

# Offline Runner Contract

Use `scripts/run_evals.py` for deterministic, credential-free contract evaluation. It does not invoke a model or provider.

## Input spec

Require exactly these top-level fields:

- `schema_version`: `1.0`;
- `eval_id` and `description`;
- `manifest`: non-empty `dataset_id`, `dataset_version`, `target_version`, `evaluator_version`, `prompt_version`, `data_policy_fingerprint`, and `sample_manifest_id`;
- `variables`: named definitions with dotted row `path`, `type`, and `required`;
- `evaluation`: one recursively composable operation;
- `dataset_gate`: `min_pass_rate` from 0 to 1 and integer `max_failed_rows`.

Format `data_policy_fingerprint` as `sha256:` plus 64 lowercase hexadecimal characters. Set `sample_manifest_id` to the runner's `sample_` content ID for the exact ordered set of row IDs, splits, and content hashes. The runner rejects relabeled, reordered, added, or omitted rows when they do not match that frozen ID.

Support variable types `string`, `number`, `integer`, `boolean`, `object`, `array`, and `json`. Parse JSON strings for `json` variables with strict JSON semantics. Reject duplicate object keys, unpaired Unicode surrogates, `NaN`, infinities, non-finite thresholds, and non-finite weights. Fail the row closed on missing required paths, type errors, undeclared references, unresolved optional references, invalid regex, or invalid operation operands.

Represent operands as exactly one of `{"var": "name"}` or `{"value": ...}`.

## Operations

- `eq`, `contains`: use `left`, `right`, and optional `case_sensitive`. Compare JSON values type-safely so booleans never alias numbers.
- `regex`: use string `left` and a literal-string pattern in `right`; row-supplied patterns are invalid. The runner evaluates regexes in an isolated process with a one-second timeout and caps pattern and input sizes so pathological expressions fail closed instead of hanging the run.
- `gt`, `gte`, `lt`, `lte`: require numeric `left` and `right`; booleans are not numbers.
- `json-valid`: use `value`.
- `all`, `any`: use a non-empty `checks` array.
- `not`: use one `check`.
- `weighted`: use threshold and positive-weight `{weight, check}` entries.
- `gate`: use non-empty hard checks and an optional soft check.

Require unique check IDs across the full operation tree. Preserve child decisions and concise rationales in output.

## Dataset manifest

Require each JSONL row to contain unique non-empty `row_id` and `split` in `train`, `validation`, `holdout`, or `blind_holdout`. Reject an empty dataset, duplicate keys, invalid Unicode scalar text, and all non-standard JSON constants. In `--mode optimization`, reject the entire input when any holdout row is present.

## Stable output

Canonicalize strict JSON with sorted keys. Derive content-addressed IDs for the frozen sample manifest, run, row results, and gates. Identical spec, ordered rows, and mode produce identical IDs. Any content, order, version, or mode change produces a new run identity. Treat a sample-manifest mismatch as an invalid run, not an ordinary failed row.

Emit row, dataset, eval-set, and run gates. Treat any row contract error as a hard dataset failure even if the numeric pass-rate threshold would otherwise pass.

Return exit code 0 for a passing official run gate, 1 for a completed failing run, and 2 for invalid specs, datasets, holdout leakage, or I/O errors.

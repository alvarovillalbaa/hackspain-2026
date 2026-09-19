# Offline Eval Run Example

Use `support-eval-spec.json` with `support-eval-data.jsonl`. The spec composes typed variables with exact, contains, regex, numeric, JSON-valid, all, any, not, weighted, and hard-gate operations. Its manifest includes the governing data-policy fingerprint and the content ID of these exact ordered rows. The second row is a sealed holdout.

Run the authoritative evaluation:

```bash
python3 scripts/run_evals.py \
  --spec examples/support-eval-spec.json \
  --dataset examples/support-eval-data.jsonl \
  --out /tmp/support-eval-results.json
```

Expected headline:

```text
pass: 2/2 rows passed; errors=0; run_id=<stable content-addressed ID>
```

The output preserves field decisions inside each row and persists row, dataset, eval-set, and run gates. Running the same inputs again produces the same manifest, run, result, and gate IDs. Changing, reordering, adding, or removing a row without explicitly resealing the spec exits 2 before scoring.

Verify optimizer isolation:

```bash
python3 scripts/run_evals.py \
  --spec examples/support-eval-spec.json \
  --dataset examples/support-eval-data.jsonl \
  --mode optimization
```

The command exits 2 because optimizer-visible input contains a holdout row. Build a separate train/validation-only manifest for candidate generation; do not filter the sealed manifest opportunistically.

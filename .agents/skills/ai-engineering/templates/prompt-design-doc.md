# Prompt Design Doc: <prompt name>

## Purpose

<What this prompt is for, in one sentence. Which feature/agent uses it.>

## Task definition

- **Input the model receives:** <variables, their sources, expected ranges>
- **Output contract:** <exact shape — JSON schema, format, length bounds>
- **Determinism need:** <temperature; is exact-format required?>

## System prompt

```text
<the system prompt — role, capabilities, constraints, tone>
```

### Why each instruction exists

| Instruction | Reason it is needed |
| --- | --- |
| <line> | <failure it prevents / behavior it ensures> |

## Few-shot examples (if used)

```text
<example 1: input → ideal output>
<example 2: an edge case the model gets wrong without it>
```

## Output format & parsing

- **Format:** <JSON / XML tags / markdown>
- **How it is parsed:** <strict schema validation? what happens on malformed output>
- **Refusal / "I don't know" path:** <how the model signals uncertainty>

## Failure modes & mitigations

| Observed failure | Mitigation in the prompt |
| --- | --- |
| <e.g. invents fields> | <e.g. "only use fields listed; omit unknowns"> |
| <e.g. ignores format> | <e.g. constrained output / stop sequences> |

## Evaluation

- **Test cases:** <link to eval dataset>
- **Pass criteria:** <metric + threshold>
- **Known weak spots:** <inputs that still fail>

## Versioning

| Version | Date | Change | Eval delta |
| --- | --- | --- | --- |
| v1 | <YYYY-MM-DD> | initial | baseline |

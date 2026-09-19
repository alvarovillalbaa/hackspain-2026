# Guidance for Constrained Generation

Use this reference when prompt-only instructions are not enough and the output must satisfy a deterministic syntax or schema.

## When to Use Guidance

Use Guidance when you need:

- Regex-constrained outputs such as IDs, dates, emails, codes, or numeric formats.
- Small controlled choice sets via `select(...)`.
- Grammar-backed JSON, XML, code, or domain-specific text.
- Multi-step generation flows written as Python functions instead of one large prompt.
- Tighter output control than "respond only with valid JSON" style prompting can reliably provide.

Prefer native model structured-output APIs when:

- The provider already supports the exact schema you need.
- You do not need regex or grammar-level control.
- You want the simplest operational path with the least extra runtime code.

Prefer Guidance when:

- The output format is strict and non-negotiable.
- You need reusable constrained generation components across providers.
- You need to interleave reasoning, tool execution, and controlled text generation in Python.

## Installation

```bash
pip install guidance
```

Common backend extras:

```bash
pip install guidance[transformers]
pip install guidance[llama_cpp]
```

## Backend Setup

### API models

```python
from guidance import models

lm = models.OpenAI("gpt-4o-mini")
# or
lm = models.Anthropic("claude-3-5-sonnet-latest")
```

### Local models

```python
from guidance.models import Transformers, LlamaCpp

lm = Transformers("microsoft/Phi-4-mini-instruct", device="cuda")

llm = LlamaCpp(model_path="/path/to/model.gguf")
```

Choose API backends for fast iteration and better hosted-model quality. Choose local backends when latency, privacy, or cost control matters more than raw capability.

## Core Primitives

### Context managers

Use role blocks for chat-shaped interactions.

```python
from guidance import assistant, gen, models, system, user

lm = models.OpenAI("gpt-4o-mini")

with system():
    lm += "You generate structured incident summaries."

with user():
    lm += "Summarize this outage in one sentence."

with assistant():
    lm += gen("summary", max_tokens=80)
```

### Regex constraints

Use `gen(..., regex=...)` when the format is narrow and well described by a pattern.

```python
from guidance import gen, models

lm = models.OpenAI("gpt-4o-mini")
lm += "Ticket ID: " + gen("ticket_id", regex=r"[A-Z]{3}-[0-9]{6}")
lm += "\nSeverity: " + gen("severity", regex=r"(sev1|sev2|sev3|sev4)")
```

Good fits:

- IDs, version strings, dates, timestamps, emails, SKUs, slugs.
- Small scalar fields inside a larger generated structure.

Poor fits:

- Deeply nested JSON with optional branches.
- Large free-form text spans.

### Selection constraints

Use `select(...)` when the answer must be one of a known set.

```python
from guidance import models, select

lm = models.OpenAI("gpt-4o-mini")
lm += "Classification: " + select(
    ["bug", "feature_request", "question", "incident"],
    name="label",
)
```

This is usually better than a regex when the allowed values are explicit and finite.

### Grammar-backed generation

Use grammar patterns when the structure matters more than long-form prose.

```python
from guidance import gen, guidance, models

@guidance
def generate_user(lm):
    lm += "{\n"
    lm += '  "name": ' + gen("name", regex=r'"[A-Za-z ]+"') + ",\n"
    lm += '  "age": ' + gen("age", regex=r"[0-9]+") + ",\n"
    lm += '  "active": ' + gen("active", regex=r"(true|false)") + "\n"
    lm += "}"
    return lm

lm = models.OpenAI("gpt-4o-mini")
lm = generate_user(lm)
```

Use this pattern for:

- JSON objects with predictable fields.
- Small DSLs or command formats.
- Code stubs with constrained identifiers or options.

### Guidance functions

Wrap reusable generation logic with `@guidance`.

```python
from guidance import gen, guidance

@guidance
def extract_person(lm, text):
    lm += f"Text: {text}\n"
    lm += "Name: " + gen("name", regex=r"[A-Za-z ]+", stop="\n")
    lm += "\nAge: " + gen("age", regex=r"[0-9]+")
    return lm
```

Use this when you want:

- Reusable constrained subroutines.
- Clear composition of multiple generation steps.
- Easier testing than giant inline prompts.

### Token healing

Guidance repairs awkward token boundaries between the prompt and generated text. This helps when the prompt ends mid-token boundary or with whitespace that would otherwise produce malformed spacing. Do not rely on token healing to fix a bad schema design; use it as a correctness improvement around otherwise sound prompts.

## Recommended Patterns

### Deterministic classification

```python
from guidance import models, select

lm = models.OpenAI("gpt-4o-mini")
lm += "Sentiment: " + select(["positive", "negative", "neutral"], name="sentiment")
```

Use for routing, moderation buckets, escalation paths, or workflow states.

### Structured extraction from unstructured text

```python
from guidance import assistant, gen, guidance, models, system, user

@guidance
def extract_contact(lm, text):
    with user():
        lm += f"Extract contact details from:\n{text}"
    with assistant():
        lm += "Name: " + gen("name", regex=r"[A-Za-z ]+", stop="\n")
        lm += "\nEmail: " + gen(
            "email",
            regex=r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}",
            stop="\n",
        )
    return lm

lm = models.OpenAI("gpt-4o-mini")
with system():
    lm += "Extract only supported fields."
lm = extract_contact(lm, "Reach Jane Doe at jane@example.com")
```

### JSON generation with constrained fields

Use regex on each field instead of asking for "valid JSON" and hoping the model complies.

```python
from guidance import gen, guidance, models

@guidance
def generate_order(lm):
    lm += "{\n"
    lm += '  "order_id": ' + gen("order_id", regex=r'"ORD-[0-9]{6}"') + ",\n"
    lm += '  "date": ' + gen("date", regex=r'"\d{4}-\d{2}-\d{2}"') + ",\n"
    lm += '  "status": ' + gen(
        "status",
        regex=r'"(pending|processing|shipped|delivered)"',
    ) + "\n"
    lm += "}"
    return lm

lm = models.OpenAI("gpt-4o-mini")
lm = generate_order(lm)
```

### Agent loops with constrained actions

```python
from guidance import gen, guidance, select

@guidance(stateless=False)
def react_loop(lm, question, tools, max_rounds=5):
    lm += f"Question: {question}\n"
    for step in range(max_rounds):
        lm += f"Thought {step + 1}: " + gen(f"thought_{step}", stop="\n")
        lm += "\nAction: " + select(list(tools.keys()), name=f"action_{step}")
        observation = tools[lm[f"action_{step}"]]()
        lm += f"\nObservation: {observation}\n"
        lm += "Done: " + select(["yes", "no"], name=f"done_{step}")
        if lm[f"done_{step}"] == "yes":
            break
    lm += "\nFinal Answer: " + gen("answer", max_tokens=120)
    return lm
```

Use this when tool choices are closed and you want to prevent invented actions.

## Design Rules

- Prefer the narrowest valid constraint. If the field is one of four labels, use `select`, not a broad regex.
- Use regex for leaf fields and small scalar spans, not for entire documents.
- For nested outputs, combine fixed scaffolding with constrained fields instead of generating the whole structure freely.
- Keep generated spans short where possible. Long constrained spans are harder to debug.
- Treat constraints as part of the contract. Test them with representative edge cases.
- Separate free-form reasoning from constrained final output. Let the model think, then constrain the deliverable.

## Production Checklist

- Validate the generated artifact with a downstream parser even if Guidance constrained it.
- Log constraint failures and retries separately from general model failures.
- Measure latency overhead for local vs hosted backends before standardizing.
- Keep provider and model choice configurable; Guidance is the control layer, not the model strategy.
- Add golden tests for high-value constrained formats such as invoices, policy JSON, or router labels.
- Prefer deterministic temperatures for extraction and routing unless diversity is explicitly needed.

## Debugging Tips

- If generation stalls, the regex or grammar may be over-constrained relative to the prompt.
- If outputs are valid but semantically poor, loosen the generation prompt, not the syntax constraint.
- If local models struggle with complex constraints, test the same pattern on a stronger hosted model to isolate whether the issue is model capability or grammar design.
- If JSON is valid but awkward, move more fixed punctuation into the template and constrain only the field values.

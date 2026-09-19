# AI Engineering

Router skill for AI system architecture, prompt/tool design, context and memory/RAG, AI eval observability, agent governance/safety, data/ML pipelines, and computer vision systems.

**This parent is a router.** Select the narrowest child skill and load that child before using lane-specific assets.

## Child Skill Ownership Map

| Domain | Child skill |
|--------|-------------|
| System prompts, tool schemas, MCP, prompt patterns, constrained generation | [`prompt-engineering`](../prompt-engineering/SKILL.md) |
| Agent topology, multi-agent orchestration, handoffs, A2A, lifecycle, RunSteeringService | [`agent-system-architecture`](../agent-system-architecture/SKILL.md) |
| Context assembly, memory tiers, retrieval, RAG, vector stores, compaction, grounding | [`context-engineering`](../context-engineering/SKILL.md) |
| Eval architecture, traces, AI metrics, score monitoring, regression gates, observability | [`ai-evals-observability`](../ai-evals-observability/SKILL.md) |
| Agent governance, safety gates, scope isolation, autonomy limits, HITL, prompt-injection | [`ai-governance-safety`](../ai-governance-safety/SKILL.md) |
| Data pipelines, ML features, fine-tuning datasets, model eval, DataOps | [`data-ml-pipelines`](../data-ml-pipelines/SKILL.md) |
| Computer vision architectures, detection, segmentation, video inference, model serving | [`computer-vision`](../computer-vision/SKILL.md) |

## Install

```bash
npx -y skills add ./engineering/skills/ai-engineering
```

Codex path:

```text
https://github.com/alvarovillalbaa/plugins/tree/main/engineering/skills/ai-engineering
```

## Fine-Tuning Ownership Note

`fine-tuning.md` lives under `agent-system-architecture/references/` and covers agent-behavior tuning strategy (when to tune, dataset tiers, SFT job launch, post-training gates). `data-ml-pipelines` owns dataset construction ops, training infrastructure, and model evaluation. These overlap by design — see cross-links in both files.

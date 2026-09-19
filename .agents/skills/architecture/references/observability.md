# Observability

Start investigations with the observability the repo already has. Adding new logs before reading existing signals is usually waste.

## Detection Order

1. Run the repo scan and note the observability section.
2. Read manifest files, env docs, and config files for existing vendors and wrappers.
3. Search for logging helpers, analytics clients, tracing setup, middleware, and custom log models.
4. Only then decide whether extra instrumentation is needed.

## Common Signal Types

- console logs and stderr or stdout
- standard logger wrappers such as `logging`, `structlog`, `winston`, `pino`, `loguru`
- error trackers such as Sentry, Rollbar, Bugsnag
- product analytics such as PostHog, Amplitude, Segment, Mixpanel
- feature flags such as LaunchDarkly
- tracing and metrics via OpenTelemetry, Datadog, New Relic, Honeycomb
- custom persistence such as database-backed log models or audit trails

## Investigation Flow

1. Reproduce the issue as narrowly as possible.
2. Capture the identifiers that let you correlate events: request id, user id, job id, conversation id, run id, trace id.
3. Follow the request, job, or event path through the logs, traces, metrics, or analytics the repo already emits.
4. If those signals are insufficient, add the minimum new instrumentation in the system the repo already uses.
5. Remove temporary debug noise before finishing unless the repo explicitly keeps it.

## Agent-Readable Observability

For agent-heavy repos, observability is part of the execution harness. Prefer signals an agent can query directly:

- runbooks with exact commands for logs, metrics, traces, Sentry, deployment events, and browser debug modes
- structured output that includes timestamps, subsystem tags, request/run/thread/trace ids, and status
- query tools such as `query_system_logs`, `query_agent_metrics`, or `get_trace_summary` when the repo has durable telemetry stores
- worktree-local observability stacks or clearly isolated namespaces when multiple agent runs execute in parallel

Do not require a human to manually correlate dashboards if the agent is expected to diagnose the class of issue.

## Correlation Checklist

Useful fields vary by stack, but the goal is consistent:

- request, trace, and span ids
- job, run, task, or queue ids
- user, tenant, org, or account ids
- domain entity ids such as order, conversation, or document
- external provider ids, retry counts, and feature flag states
- release version, worker name, region, or environment when rollout behavior matters

## Adding Instrumentation

- Extend the existing vendor or wrapper instead of introducing a second competing path.
- Prefer structured fields over free-form string dumps.
- Avoid secrets, credentials, raw tokens, or unnecessary PII.
- Put backend logs near service boundaries and side effects, not scattered through every call site.
- Put frontend analytics on meaningful user actions and state transitions, not every click or render.

## Backend Signal Patterns

- Log queue dispatch and queue execution with the same correlation ids when the system is async.
- Time external calls, expensive queries, and retry loops with the repo's current metrics or tracing helpers.
- Prefer one durable, well-structured failure signal over duplicate error logs at every layer.
- Use stable error categories or event names when the repo already has them.
- If a bug depends on load, ordering, or race conditions, define the exact proof path instead of adding broad speculative logging.

## Multi-Channel Logging

Some repos use both operational logger output and a second channel for investigation-grade incidents, audit events, or durable error records. That is a good pattern when the repo already distinguishes between routine telemetry and high-value diagnostic events. Reuse the established distinction instead of inventing new logging channels.

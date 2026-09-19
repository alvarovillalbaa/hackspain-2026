# Endpoint Spec: <METHOD /resource/path>

> One spec per endpoint (or tightly related group). Product-contract first:
> describe behavior and the contract, keep implementation notes minimal.

## Summary

- **What it does (one sentence):**
- **Owner / service:**
- **Auth required:** <none | session | bearer token | API key | scope: X>
- **Idempotent:** <yes / no>

## Request

`<METHOD> /v1/<path>/{id}`

### Path / query params

| Name | In | Type | Required | Notes |
| --- | --- | --- | --- | --- |
| id | path | uuid | yes | |
| limit | query | int | no | default 20, max 100 |

### Headers

| Header | Required | Notes |
| --- | --- | --- |
| Authorization | yes | `Bearer <token>` |
| Idempotency-Key | no | required for retryable writes |

### Body

```json
{
  "field": "value"
}
```

Validation rules: <required fields, formats, bounds, allowed enums>.

## Response

### Success — `200 OK` (or `201 Created`)

```json
{
  "id": "uuid",
  "field": "value",
  "createdAt": "2026-01-01T00:00:00Z"
}
```

### Errors

| Status | Code | When |
| --- | --- | --- |
| 400 | `validation_error` | Body failed validation |
| 401 | `unauthenticated` | Missing/invalid credentials |
| 403 | `forbidden` | Authenticated but not allowed |
| 404 | `not_found` | Resource does not exist (or not visible to caller) |
| 409 | `conflict` | Idempotency/version conflict |
| 422 | `unprocessable` | Semantically invalid |
| 429 | `rate_limited` | Too many requests |

Error body shape:

```json
{ "error": { "code": "validation_error", "message": "human readable", "details": [] } }
```

## Behavior & invariants

- Side effects (writes, events emitted, jobs enqueued):
- Concurrency / race considerations:
- Pagination / sorting contract:
- Rate limits:

## Authorization

- Who can call it:
- Tenant / ownership scoping enforced where:

## Observability

- Log fields to include (request id, tenant id, actor):
- Metrics / traces:

## Acceptance / proof

- [ ] Happy path test
- [ ] Each error case tested
- [ ] AuthZ negative test (wrong tenant/user)
- [ ] Contract doc / OpenAPI updated

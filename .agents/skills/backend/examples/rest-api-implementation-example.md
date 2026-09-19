# Example: CRUD API with Authentication in Express.js

Worked example of a small but production-shaped REST resource (`/notes`) in
Express: JWT auth middleware, input validation, ownership scoping, consistent
error shape, and async error handling. Illustrative — adapt to your stack.

## Layout

```
src/
  app.js               # wiring
  middleware/auth.js   # JWT verification
  middleware/errors.js # central error handler
  routes/notes.js      # the CRUD resource
  notes/repository.js  # data access
```

## Auth middleware — `middleware/auth.js`

```js
import jwt from "jsonwebtoken";

export function requireAuth(req, res, next) {
  const header = req.get("authorization") || "";
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: { code: "unauthenticated", message: "Missing bearer token" } });
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: { code: "unauthenticated", message: "Invalid or expired token" } });
  }
}
```

## Central error handler — `middleware/errors.js`

```js
export class ApiError extends Error {
  constructor(status, code, message, details = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Wrap async handlers so rejected promises reach the error handler.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

// Must be registered LAST, after all routes.
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  console.error("unhandled", err);
  res.status(500).json({ error: { code: "internal", message: "Unexpected error" } });
}
```

## Routes — `routes/notes.js`

```js
import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth.js";
import { ApiError, asyncHandler } from "../middleware/errors.js";
import * as repo from "../notes/repository.js";

const router = Router();
router.use(requireAuth);

const NoteInput = z.object({
  title: z.string().min(1).max(200),
  body: z.string().max(10_000).default(""),
});

function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError(400, "validation_error", "Invalid request body",
      result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  }
  return result.data;
}

// CREATE
router.post("/", asyncHandler(async (req, res) => {
  const input = parse(NoteInput, req.body);
  const note = await repo.create({ ...input, ownerId: req.user.sub });
  res.status(201).json(note);
}));

// LIST (scoped to the caller)
router.get("/", asyncHandler(async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 20, 100);
  res.json(await repo.listByOwner(req.user.sub, limit));
}));

// READ
router.get("/:id", asyncHandler(async (req, res) => {
  const note = await repo.findById(req.params.id);
  // Return 404 (not 403) so non-owners can't probe existence.
  if (!note || note.ownerId !== req.user.sub) {
    throw new ApiError(404, "not_found", "Note not found");
  }
  res.json(note);
}));

// UPDATE
router.put("/:id", asyncHandler(async (req, res) => {
  const input = parse(NoteInput, req.body);
  const existing = await repo.findById(req.params.id);
  if (!existing || existing.ownerId !== req.user.sub) {
    throw new ApiError(404, "not_found", "Note not found");
  }
  res.json(await repo.update(req.params.id, input));
}));

// DELETE
router.delete("/:id", asyncHandler(async (req, res) => {
  const existing = await repo.findById(req.params.id);
  if (!existing || existing.ownerId !== req.user.sub) {
    throw new ApiError(404, "not_found", "Note not found");
  }
  await repo.remove(req.params.id);
  res.status(204).end();
}));

export default router;
```

## Wiring — `app.js`

```js
import express from "express";
import notes from "./routes/notes.js";
import { errorHandler } from "./middleware/errors.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/notes", notes);
app.use(errorHandler); // last
export default app;
```

## What makes this production-shaped

- **AuthZ, not just authN:** every read/write is scoped by `ownerId`; missing
  resources and unauthorized ones both return 404 so existence can't be probed.
- **One error shape** everywhere via `ApiError` + central handler.
- **Validation at the boundary** with a schema; the rest of the code trusts
  parsed input.
- **Async errors can't escape** — `asyncHandler` funnels rejections to the
  handler instead of crashing the process.
- **Body size limit** guards against oversized payloads.

## Test checklist (see ../../testing)

- [ ] Create/read/update/delete happy paths
- [ ] 401 with no/invalid token
- [ ] 404 when accessing another user's note (ownership scoping)
- [ ] 400 with invalid body, asserting `details`
- [ ] List respects `limit` cap

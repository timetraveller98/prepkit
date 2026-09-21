# API reference

Base URL: the API service itself (`http://localhost:4000` in development). From the
browser, everything is reached through the web app at `/backend/*`, which strips that
prefix and forwards to `/api/*`.

## Authentication

Two accepted forms, both the same HS256 JWT signed with `JWT_SECRET`, carrying the user
id as `sub`:

| Form | Used by |
| --- | --- |
| `Authorization: Bearer <token>` | The web server, which mints a five-minute token per forwarded request |
| `prepkit_session` cookie | Direct API use, and the test suite |

Every kit and practice route requires one. Every kit is loaded through an ownership
check before anything is read or written.

## Errors

```jsonc
{ "error": { "code": "FORBIDDEN", "message": "this kit belongs to someone else", "details": null } }
```

| Status | Codes |
| --- | --- |
| 400 | `BAD_REQUEST`, `VALIDATION_FAILED` |
| 401 | `UNAUTHORIZED`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 409 | `EMAIL_TAKEN`, `KIT_NOT_READY`, `REGENERATION_IN_FLIGHT`, `ALREADY_RUNNING` |
| 429 | `TOO_MANY_ATTEMPTS` |
| 500 | `INTERNAL_ERROR` |

`details` carries field-level problems on a validation failure.

---

## Health

### `GET /health`

No authentication. Used as the deployment health check.

```jsonc
{ "status": "ok", "activeGenerations": 0 }
```

---

## Authentication

### `POST /api/auth/register`

```jsonc
{ "email": "you@example.com", "password": "at least ten characters" }
```

`201` with `{ user: { id, email } }` and a session cookie. `409 EMAIL_TAKEN` if the
address is taken. Rate-limited to `AUTH_ATTEMPTS_PER_WINDOW` per ten minutes.

### `POST /api/auth/login`

Same body. `200` with `{ user }` and a session cookie. `401 INVALID_CREDENTIALS`
otherwise — with the same body and status whether the email is unknown or the password
is wrong.

### `POST /api/auth/verify`

Same body. `200` with `{ user }` and **no cookie**. This is what NextAuth's credentials
provider calls; it exists so the web server can check a password without inheriting a
session it will not use.

### `POST /api/auth/logout`

`204`. Clears the cookie.

### `GET /api/auth/me`

`200` with `{ user }`, or `401` when the session is missing or expired.

---

## Kits

### `GET /api/kits`

The signed-in user's kits, newest first, capped at 100.

```jsonc
{
  "kits": [{
    "id": "…", "title": "Senior Backend Engineer at Acme Freight",
    "company": "Acme Freight", "companyUrl": "https://acme.test",
    "role": "Senior Backend Engineer", "daysAvailable": 5,
    "status": "ready", "regeneratingSection": null,
    "progress": { "step": "validate", "status": "completed", "index": 10, "total": 10, "at": "…" },
    "error": null, "createdAt": "…", "updatedAt": "…",
    "counts": { "requirements": 7, "mustRequirements": 5, "questions": 12,
                "flashcards": 14, "uncoveredMust": 0 }
  }]
}
```

### `POST /api/kits`

```jsonc
{ "jobDescription": "…", "companyUrl": "acme.com", "daysAvailable": 5, "force": false }
```

- `202` — `{ duplicate: false, kit }`. Queued.
- `200` — `{ duplicate: true, message, kit }`. The same posting and company already
  exist for this user. Resend with `force: true` to build it again anyway.
- `400` — the URL cannot be fetched, or the posting is under twenty characters.

`companyUrl` is normalised (a bare host gains `https://`) before it is stored.

### `POST /api/kits/batch`

```jsonc
{ "cases": [{ "jobDescription": "…", "companyUrl": "…", "daysAvailable": 5 }], "force": false }
```

At most ten cases. `202` with `{ created: [KitSummary], skipped: [{ companyUrl, reason }] }`.
Duplicates are skipped rather than failing the batch.

### `GET /api/kits/:id`

The summary plus `jobDescription`, `kit`, `itemState`, `events`, `usage`,
`hiringProcess` and `researchedPages`.

### `DELETE /api/kits/:id`

`204`. Cancels the kit if it is still generating.

### `POST /api/kits/:id/retry`

`202`. Re-queues a failed kit. `409 ALREADY_RUNNING` if it is already going.

### `GET /api/kits/:id/events`

`text/event-stream`. On connect it replays the current status and the last twenty
events, then streams live ones. A comment heartbeat every twenty-five seconds keeps
intermediaries from closing it.

```
data: {"type":"status","kitId":"…","status":"running","error":null}
data: {"type":"progress","kitId":"…","event":{"step":"crawl-company-site","status":"completed","message":"4 page(s) read, 3 skipped","index":2,"total":10,"at":"…"}}
```

---

## The builder

All of these require the kit to be `ready`; otherwise `409 KIT_NOT_READY`. All of them
rebuild the schedule, recompute coverage and revalidate the structure before saving, and
all of them return the full kit detail so the interface never has to refetch.

| Method | Path | Body | Notes |
| --- | --- | --- | --- |
| `PATCH` | `/api/kits/:id/brief` | `{ summary?, what_they_do? }` | Marks the edited field `edited` |
| `POST` | `/api/kits/:id/questions` | `{ prompt, category, answer_outline?, difficulty?, requirement_ids? }` | `201`, `origin: "user"` |
| `PATCH` | `/api/kits/:id/questions/:qid` | any of `prompt`, `answer_outline`, `difficulty`, `category`, `requirement_ids` | Changing `category` is how a question moves group |
| `DELETE` | `/api/kits/:id/questions/:qid` | | Returns `newGaps: string[]` — must-haves this deletion left uncovered |
| `PUT` | `/api/kits/:id/questions/order` | `{ ids: string[] }` | Unlisted ids keep their relative order at the end; an unknown id is `400` |
| `POST` | `/api/kits/:id/questions/:qid/pin` | `{ pinned: boolean }` | |
| `POST` | `/api/kits/:id/flashcards` | `{ front, back?, requirement_ids? }` | `201` |
| `PATCH` | `/api/kits/:id/flashcards/:fid` | `{ front?, back?, requirement_ids? }` | |
| `DELETE` | `/api/kits/:id/flashcards/:fid` | | |
| `PUT` | `/api/kits/:id/flashcards/order` | `{ ids: string[] }` | |
| `POST` | `/api/kits/:id/flashcards/:fid/pin` | `{ pinned: boolean }` | |

`requirement_ids` entries that name a requirement which does not exist are dropped, not
rejected — the kit stays referentially sound either way.

### `POST /api/kits/:id/regenerate`

```jsonc
{ "section": "questions", "category": "technical" }
```

| `section` | Extra | What happens |
| --- | --- | --- |
| `company_brief` | | Each field regenerated unless it is protected |
| `questions` | `category` required | Protected questions kept in place, the rest replaced |
| `flashcards` | | Protected cards kept, the rest replaced |
| `schedule` | `daysAvailable?` | Recomputed deterministically; no model call |

```jsonc
{ "preservedIds": ["q1", "q4"], "replacedIds": ["q2", "q3"], "kit": { /* full detail */ } }
```

Synchronous. `409 REGENERATION_IN_FLIGHT` if a section is already regenerating.

---

## Practice

### `GET /api/kits/:id/practice?limit=40`

```jsonc
{
  "session": [{ "flashcard": { … }, "record": { … } | null, "overdue": true }],
  "progress": { "total": 14, "seen": 6, "due": 9, "confident": 4,
                "byConfidence": { "0": 1, "1": 1, "2": 2, "3": 2 } }
}
```

Never-seen cards first, then the least confident, then the most overdue.

### `POST /api/kits/:id/practice/:flashcardId`

```jsonc
{ "confidence": 2 }
```

`0` no idea, `1` shaky, `2` solid, `3` could teach it. Returns the updated record and
progress. Idempotent per card — it is an upsert on `{ kitId, flashcardId }`.

### `POST /api/kits/:id/practice/reset`

`204`. Clears every review record for the kit.

### `GET /api/kits/:id/readiness`

```jsonc
{
  "readiness": {
    "score": 62, "generatedAt": "…",
    "totalRequirements": 7, "mustRequirements": 5, "untouchedMustRequirements": 2,
    "byRequirement": [{ "requirementId": "r1", "text": "…", "priority": "must",
                        "kind": "technical", "questionIds": ["q1"], "flashcardIds": ["f1"],
                        "drilled": 2, "confidence": 0.83, "risk": 0.17 }],
    "weakSpots": [ /* highest risk first */ ],
    "strengths": [ /* confidence ≥ 0.66 */ ],
    "nextFlashcardIds": ["f4", "f9"]
  }
}
```

---

## Rate limits

| Scope | Default |
| --- | --- |
| `/api/auth/register`, `/login`, `/verify` | `AUTH_ATTEMPTS_PER_WINDOW` (20) per 10 minutes per IP |
| Everything else | `API_REQUESTS_PER_MINUTE` (300) per minute per IP |

The event stream is exempt, since one open connection would otherwise consume a slot
for its whole lifetime.

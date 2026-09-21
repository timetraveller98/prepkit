# Data model

## The kit

The structure the assessment specifies, defined once in `packages/core/src/kit.ts` as a
Zod schema and inferred into TypeScript types. Nothing else declares it.

```jsonc
{
  "source": {
    "company": "Acme Freight",
    "company_url": "https://acme.test",
    "role": "Senior Backend Engineer",
    "location": "Chicago or remote",
    "jd_chars": 1420,
    "researched_at": "2026-09-21T09:20:56.882Z",
    "pages_used": ["https://acme.test/", "https://acme.test/company/handbook/how-we-hire/"]
  },
  "company_brief": { "summary": "", "what_they_do": "", "sources": ["https://…"] },
  "role": {
    "title": "Senior Backend Engineer",
    "seniority": "senior",
    "responsibilities": ["…"],
    "requirements": [
      { "id": "r1", "text": "5+ years with React", "kind": "technical", "priority": "must",
        "evidence": "5+ years with React" }
    ]
  },
  "questions": [
    { "id": "q1", "requirement_ids": ["r1"], "category": "technical",
      "prompt": "", "answer_outline": "", "difficulty": 2 }
  ],
  "flashcards": [{ "id": "f1", "front": "", "back": "", "requirement_ids": ["r1"] }],
  "schedule": {
    "days_available": 5,
    "days": [{ "day": 1, "focus": "", "question_ids": ["q1"], "minutes": 60 }]
  },
  "coverage": { "uncovered_requirement_ids": [], "passes": 2 },

  // extensions
  "research": { … },
  "notes": ["…"]
}
```

### Enumerations

| Field | Values |
| --- | --- |
| `requirements[].kind` | `technical`, `behavioural`, `domain` |
| `requirements[].priority` | `must`, `nice` |
| `questions[].category` | `technical`, `behavioural`, `system-design`, `company-fit` |
| `questions[].difficulty` | `1`, `2`, `3` — integers |
| `schedule.days[].minutes` | a non-negative integer |

### The two extensions, and why

The assessment allows extending the structure where it genuinely helps. Two fields do.

**`notes: string[]`** — the honest-gaps record. The FAQ asks for a partially researched
case to be `ok` "with the gaps recorded honestly in the kit". This is where they go:
the site was unreachable, the posting was forty words, no public discussion exists,
three must-haves needed a written question after three passes.

**`research`** — what retrieval actually reached:

```ts
{
  hiring_process_found: boolean;
  hiring_process_summary: string;
  hiring_pages: string[];
  public_discussion_found: boolean;
  public_discussion_sources: string[];
  pages_failed: { url: string; reason: string }[];
  robots_blocked: string[];
  suspicious_content_flags: string[];
}
```

This is what makes "we skipped this source and here is why" inspectable rather than a
claim, and it is what the interface's *What the research reached* panel renders.

### The invariants Zod cannot express per-field

`kitSchema.superRefine` enforces:

- requirement, question and flashcard ids are each unique;
- every `questions[].requirement_ids` entry names a requirement that exists;
- every `flashcards[].requirement_ids` entry names a requirement that exists;
- `schedule.days.length === schedule.days_available`;
- day numbers are exactly `1..n` in order;
- every `schedule.days[].question_ids` entry names a question that exists;
- every `coverage.uncovered_requirement_ids` entry names a requirement that exists.

`validateKit` runs on **every** write, not only after generation. Unknown keys are
stripped, so a stored kit cannot drift into a different shape over time.

## Editing state

Bookkeeping lives beside the kit, never inside it:

```ts
interface ItemMeta {
  origin: "generated" | "user";
  edited: boolean;
  pinned: boolean;
  rev: number;
  updatedAt: string;
}

interface KitItemState {
  requirements: Record<string, ItemMeta>;
  questions:    Record<string, ItemMeta>;
  flashcards:   Record<string, ItemMeta>;
  brief:        { summary: ItemMeta; what_they_do: ItemMeta };
  schedule:     ItemMeta;
}
```

| Transition | Effect |
| --- | --- |
| Generated | `origin: "generated"`, `edited: false`, `pinned: false`, `rev: 1` |
| Edited through the API | `edited: true`, `rev++` |
| Written by hand | `origin: "user"` |
| Pinned | `pinned: true`, content untouched |
| **Protected** | `origin === "user" \|\| edited \|\| pinned` |

`pruneKitState` drops entries for ids that no longer exist, so the map cannot leak.

Ordering is the array order in `kit.questions` and `kit.flashcards`. Reordering rewrites
the array; there is no separate order field to fall out of sync.

### Why a sidecar

The kit is validated on every write and is the object handed to the batch output.
Keeping bookkeeping out of it means the stored kit and the exported kit are the same
object, with nothing to strip on the way out and no risk of the shape drifting from
what the assessment specifies.

## Collections

### `users`

| Field | Type | Notes |
| --- | --- | --- |
| `email` | string | unique, lowercased, trimmed, indexed |
| `passwordHash` | string | bcrypt, 12 rounds |
| `createdAt`, `updatedAt` | Date | |

### `kits`

| Field | Type | Notes |
| --- | --- | --- |
| `userId` | ObjectId | indexed; every read filters on it |
| `title` | string | the posting's first line until generation names the role |
| `companyUrl`, `jobDescription`, `daysAvailable` | | the inputs, kept so a kit can be rebuilt |
| `fingerprint` | string | `sha256(userId + normalised posting + normalised url)` |
| `status` | enum | `queued`, `running`, `ready`, `failed` |
| `regeneratingSection` | string \| null | the per-section lock |
| `progress` | PipelineEvent \| null | the latest step |
| `events` | PipelineEvent[] | capped at the last 80 |
| `kit` | Mixed | the validated kit |
| `itemState` | Mixed | the sidecar |
| `research` | Mixed | pages and hiring result, kept so a section can be regenerated without re-crawling |
| `error` | `{ code, message }` \| null | |
| `usage` | `{ calls, inputTokens, outputTokens }` \| null | |

Indexes: `{ userId, fingerprint }` for duplicate detection, `{ userId, createdAt: -1 }`
for the list.

`kit`, `itemState` and `research` are `Mixed`. Zod already validates the kit before it
is written, and duplicating that schema in Mongoose would create two definitions that
can disagree. Zod validates; Mongo stores.

The research snapshot is trimmed to the six highest-scoring pages at 6000 characters
each, which is enough to regenerate a brief and far short of anything Mongo minds.

### `reviews`

One document per flashcard per kit.

| Field | Type |
| --- | --- |
| `userId`, `kitId` | ObjectId |
| `flashcardId` | string |
| `repetitions`, `intervalDays`, `ease` | number |
| `lastConfidence` | 0–3 \| null |
| `lastReviewedAt` | Date \| null |
| `dueAt` | Date |

Indexes: `{ kitId, flashcardId }` unique — which is what makes grading an idempotent
upsert — and `{ userId, kitId }` for loading a session.

Review records are a separate collection rather than an array on the kit because they
are written far more often than the kit and by a different interaction. Embedding them
would mean rewriting the whole kit document on every card.

## Batch output

```jsonc
{
  "version": "1.0",
  "generated_at": "2026-09-01T09:12:44Z",
  "kits": [
    { "id": "case-01", "status": "ok", "kit": { /* the structure above */ }, "error": null },
    { "id": "case-04", "status": "failed", "kit": null,
      "error": { "code": "EMPTY_JOB_DESCRIPTION", "message": "…" } }
  ]
}
```

One entry per input case, keyed by the id given. `itemState` never appears — it is the
application's bookkeeping, not part of a kit.

# Architecture

## The shape of it

Three packages in one npm workspace:

```
packages/core   the pipeline. No framework, no database, no HTTP server.
apps/api        Express 5. Persistence, auth, the job queue, the builder endpoints.
apps/web        Next.js 16. The interface, and the session the browser holds.
```

`packages/core` has no dependency on either app. Both apps, and the batch command,
depend on it. That is what makes "the batch entry point runs the same code the
application runs" structurally true rather than a promise.

## Why the split exists

The assessment requires a batch command that runs the full retrieval, generation and
validation path without going through the interface. There are two ways to get there:
extract the pipeline, or call your own HTTP API from a script. The second couples the
CLI to a running server, a database and an authenticated session for no benefit. So the
pipeline is a library, and everything else is a caller.

A second consequence falls out of it: the pipeline is testable without a server. The
integration test in `packages/core/test/pipeline.test.ts` drives the real crawler
against a real local fixture site with a stubbed model, and needs neither Express nor
MongoDB.

## Module map

### `packages/core`

| Module | Owns |
| --- | --- |
| `kit.ts` | The kit structure as a Zod schema, plus the cross-field rules a per-field schema cannot express |
| `state.ts` | Generated / edited / pinned bookkeeping |
| `env.ts` | A portable `EnvSource` record, because `process.env` types differently inside Next |
| `llm/provider.ts` | The provider interface every model backend implements |
| `llm/gemini.ts`, `llm/openai-compatible.ts` | Two backends behind that interface |
| `llm/client.ts` | Rate limiting, retries, structured output, one schema-aware repair attempt |
| `llm/json.ts` | Getting JSON out of text that is nearly JSON |
| `util/rate-limit.ts` | A rolling one-minute window over both requests and tokens |
| `util/retry.ts` | Exponential backoff with jitter, honouring `Retry-After` |
| `util/untrusted.ts` | Fencing third-party text and flagging injection shapes |
| `retrieval/url-guard.ts` | Which addresses may be fetched at all |
| `retrieval/fetcher.ts` | Timeouts, redirect re-checking, content-type and size caps |
| `retrieval/robots.ts` | `robots.txt` per origin, cached, including sitemap declarations |
| `retrieval/html.ts` | Readable text and same-site links |
| `retrieval/link-score.ts` | Which link is worth fetching, and what a page is about |
| `retrieval/crawler.ts` | Homepage resolution and the two-level crawl |
| `retrieval/search.ts` | Public discussion, with a provider chain and an honest empty result |
| `pipeline/steps/*` | One module per model call, each with its own prompt and schema |
| `pipeline/coverage.ts` | **Deterministic.** Which requirements have no question |
| `pipeline/schedule.ts` | **Deterministic.** Allocation across exactly the days available |
| `pipeline/evidence.ts` | **Deterministic.** Whether an extracted requirement traces back to the posting |
| `pipeline/run.ts` | The orchestrator, its progress events, and its failure policy |
| `pipeline/regenerate.ts` | Section regeneration that preserves edits |
| `practice.ts`, `readiness.ts` | Spaced repetition and the readiness report |
| `dev/fixture-server.ts` | Local company sites, shared by `npm run fixtures` and the tests |
| `bin/evaluate.ts` | The batch entry point |

### `apps/api`

| Module | Owns |
| --- | --- |
| `config/env.ts` | Environment parsed and validated once, at boot, with useful errors |
| `http/errors.ts` | `ApiError`, and the one place an error becomes a response |
| `http/validate.ts` | Request-body parsing against a schema |
| `db/models/*` | Mongoose schemas for users, kits and review records |
| `modules/auth/*` | Registration, login, credential verification, session reading |
| `modules/kits/service.ts` | Every mutation on a kit, as pure functions over `(kit, state)` |
| `modules/kits/routes.ts` | HTTP shape only: parse, call the service, persist, present |
| `modules/kits/presenters.ts` | What the interface is allowed to see |
| `modules/practice/routes.ts` | Review records and the readiness report |
| `jobs/generation-queue.ts` | Concurrency, progress events, restart recovery |

The split inside `modules/kits` is deliberate. `service.ts` takes a kit and a state map
and returns a new kit and a new state map; it touches no request and no response. That
is why the mutation rules are testable and why the HTTP layer stays thin.

### `apps/web`

| Module | Owns |
| --- | --- |
| `auth.config.ts`, `auth.ts` | NextAuth configuration and the credentials provider |
| `proxy.ts` | Route protection, on the session |
| `app/api/auth/[...nextauth]` | NextAuth's own endpoints |
| `app/backend/[...path]` | The authenticated forwarder to the API |
| `lib/api.ts` | One fetch wrapper, one error type |
| `lib/queries.ts` | Every server interaction, with its optimistic update |
| `lib/types.ts` | Core types re-exported, plus the response shapes |
| `components/ui/*` | Primitives. No knowledge of kits |
| `components/kits/*`, `components/practice/*` | Feature components |

## How a request moves

### Creating a kit

```
browser  POST /backend/kits
   │
   ▼
Next route handler
   ├─ reads the NextAuth session         → 401 if absent
   ├─ mints a 5-minute HS256 token
   └─ POST {API_ORIGIN}/api/kits  Authorization: Bearer …
         │
         ▼
      Express
         ├─ verifies the token, attaches the user
         ├─ validates the body
         ├─ fingerprints (user + posting + url) → 200 duplicate, or
         ├─ inserts the kit as `queued`         → 202
         └─ enqueues it
              │
              ▼
         GenerationQueue
              ├─ status → running, publish
              ├─ generateKit(...) from packages/core
              │     └─ progress events → SSE subscribers + batched Mongo writes
              └─ status → ready | failed, persist the kit and the research snapshot
```

The browser gets its 202 immediately and opens an `EventSource` on
`/backend/kits/:id/events`, which the same forwarder streams through.

### Editing a kit

```
browser  PATCH /backend/kits/:id/questions/:qid
   │                    (optimistic cache update has already rendered)
   ▼
Express
   ├─ loadOwnedKit          → 403 if it belongs to someone else
   ├─ requireReadyKit       → 409 if it is still generating
   ├─ service.updateQuestion(kit, state, …)   pure
   └─ persistKit
        ├─ rebuildSchedule         deterministic, so no dangling references
        ├─ recomputeCoverage       so the interface always sees the truth
        ├─ validateKit             the structure is never saved broken
        └─ save
```

If the request fails, the query layer rolls the optimistic update back.

### Regenerating a section

Synchronous, because it is one or two model calls rather than ten:

```
POST /backend/kits/:id/regenerate { section, category? }
   ├─ take the per-section lock            → 409 if one is already running
   ├─ partition the section into protected (user / edited / pinned) and replaceable
   ├─ generate, passing the protected items in as "these already exist"
   ├─ keep protected items in place, drop the replaceable ones, append the new ones
   ├─ re-seal any must-have coverage gap the replacement opened
   ├─ persistKit  (schedule rebuilt, coverage recomputed, structure validated)
   └─ release the lock, return { preservedIds, replacedIds, kit }
```

## Boundaries worth naming

- **Core never imports Express, Mongoose or React.** If it needs something from the
  environment, it takes it as an argument.
- **Routes never contain rules.** They parse, delegate, persist and present.
- **The API never imports Auth.js.** It verifies a signed token. Where that token came
  from is not its problem.
- **The interface never computes coverage or a schedule.** It renders what the server
  already decided, so the two can never disagree.

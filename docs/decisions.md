# Decision log

Each entry: what was decided, what it was decided against, and why.

---

## 1. The pipeline is a library, not an HTTP endpoint

**Decided:** `packages/core` is framework-free. The API, the batch command and the tests
are all callers.

**Against:** having `npm run evaluate` call the running API over HTTP.

**Why:** the assessment requires the batch command to run "the same code your application
uses, not a parallel implementation". Calling your own API means the CLI needs a server,
a database and a session to do something none of them are needed for. As a library it is
one implementation by construction, and the pipeline becomes testable without booting
anything.

---

## 2. A separate Express service rather than Next route handlers

**Decided:** Next for the interface, Express for the API.

**Against:** everything in Next route handlers, one deployment.

**Why:** generation takes ninety seconds to two minutes and streams progress. Serverless
functions are the wrong shape for that, and the assessment's preferred stack names
Express anyway. The separation also makes retrieval, generation, scheduling and
persistence visibly separate concerns rather than co-located ones.

**Cost:** two deployments, and a hop between them.

---

## 3. NextAuth in the web app, bearer tokens into the API

**Decided:** NextAuth (Auth.js v5) owns the browser session. The web server mints a
five-minute HS256 token per forwarded request. Express verifies it with a shared secret
and never imports Auth.js.

**Against:** (a) hand-rolled cookie sessions in Express only; (b) NextAuth with Express
decrypting the Auth.js session cookie directly.

**Why:** (a) means owning CSRF, cookie flags, rotation and the sign-in surface by hand —
solved problems that are easy to get subtly wrong. (b) couples Express to Auth.js's
internal cookie encryption, its salt and its cookie naming, which would break on an
Auth.js upgrade. A signed short-lived token is a boundary both sides can hold
independently: the API is testable with nothing but `jsonwebtoken`, and the web app can
change auth libraries without touching it.

**Cost:** one extra hop per browser request, and two secrets that must match. Auth.js v5
is a beta, which is noted in the README.

---

## 4. An unreachable company site does not fail a case

**Decided:** record the attempts in `research.pages_failed` and `notes`, and return
`status: "ok"`. Failure codes are reserved for an empty posting, a model that cannot be
reached at all, and a kit that will not validate.

**Against:** returning `COMPANY_UNREACHABLE`, which Appendix B shows as an example.

**Why:** the FAQ says to reserve `failed` for "a case you could not produce a kit for at
all", and the scoring criteria say unreachable sites should be "recorded rather than
fatal". A posting alone produces a genuinely useful kit. The two statements in the brief
point the same way and Appendix B is an example of the shape, not a rule about when.

---

## 5. Three model passes, then a deterministic backstop

**Decided:** up to three coverage passes. Anything still uncovered gets a real question
written from a template keyed on the requirement's kind, and the kit's notes say it
happened.

**Against:** (a) looping until covered; (b) shipping the gap.

**Why:** (a) burns tokens on a model that has already failed twice the same way; free
tiers are the constraint the assessment names. (b) fails the one thing the assessment
says the kit must not do. The template questions are real questions, not placeholders,
and the note keeps the guarantee from being silent.

---

## 6. Requirement evidence is verified by code

**Decided:** the model must return a verbatim evidence span per requirement. Code checks
it against the posting — full substring, or 50% token overlap for light reformatting —
and drops anything that fails, recording the drop.

**Against:** instructing the model not to invent requirements and trusting it.

**Why:** the automated score's largest component is "the must-haves in each description
are found, marked correctly, and nothing is invented". Asking a model to be careful is
not a control. Checking its evidence against the source is.

**Cost:** a requirement legitimately paraphrased beyond the threshold is lost. 0.5 is
lenient enough that this is rare, and the note makes it visible when it happens.

---

## 7. Editing state is a sidecar map, not fields on the kit

**Decided:** `KitItemState` lives beside the kit, keyed by item id.

**Against:** a `_meta` object on every question, flashcard and brief field.

**Why:** the kit is validated on every write and is the object handed to the batch
output. Keeping bookkeeping out of it means the stored kit and the exported kit are the
same object — nothing to strip, and no chance of the shape drifting from what the
assessment specifies.

**Cost:** two objects to keep in step. `pruneKitState` handles it in one place, on every
write.

---

## 8. The schedule is rebuilt on every write

**Decided:** `persistKit` always rebuilds the schedule and recomputes coverage before
validating and saving.

**Against:** rebuilding only when questions change.

**Why:** the allocator is deterministic and cheap, so rebuilding is idempotent, and it
removes an entire class of bug — deleting a question can never leave a schedule day
pointing at something that no longer exists. Tracking *when* a rebuild is needed is
exactly the kind of bookkeeping that eventually gets it wrong.

**Cost:** editing a question's difficulty reshuffles the plan. That is arguably correct
behaviour, since difficulty is an input to the allocation.

---

## 9. Regeneration is synchronous; first generation is not

**Decided:** creating a kit returns `202` and streams progress. Regenerating a section
answers inside the request with the updated kit attached.

**Against:** making both asynchronous, for consistency.

**Why:** a first run is ten or more model calls and needs streaming. A section is one or
two. Returning the updated kit directly also removes a refetch race against the user's
own in-flight edits, which is the exact thing this part of the assessment is about.

---

## 10. No headless browser

**Decided:** `fetch` plus `cheerio`.

**Against:** Playwright for client-rendered sites.

**Why:** the pages that matter — marketing sites, handbooks, careers pages — are
server-rendered. A browser triples runtime and memory for a minority case, on a free
tier, inside a fifteen-minute budget for five cases.

**Cost:** a fully client-rendered company site yields little. Listed as a known
limitation.

---

## 11. Client-side throttling rather than reacting to 429

**Decided:** the rate limiter tracks a rolling one-minute window of requests **and**
estimated tokens, and waits before sending.

**Against:** sending freely and backing off on 429.

**Why:** the assessment says it directly — free tiers limit tokens per minute, not just
requests, and "a pipeline that falls over the first time a provider says 'slow down' is
the most common way to lose points here". Backoff still exists for when the estimate is
wrong; it is the second line, not the first.

The batch command shares **one** limiter across all cases, so `--concurrency` cannot
blow the budget.

---

## 12. Four question categories, four calls

**Decided:** a separate call per category, with its own persona, its own rules and its
own requirement subset.

**Against:** one call that returns every category.

**Why:** the assessment is explicit that "a requirement like five years of React leads to
technical questions while mentoring junior engineers leads to behavioural ones; the two
should not come from the same call with the same instructions". It also produces better
questions: the technical prompt can talk about failure modes and the behavioural one
about specific past situations, without either instruction diluting the other.

**Cost:** four calls instead of one. Mitigated by the shared limiter and by skipping
categories with no relevant requirements.

---

## 13. `tsx` at runtime rather than a compiled `dist`

**Decided:** TypeScript is executed directly, in development and in production.

**Against:** `tsc` to `dist` with a build-ordering step between packages.

**Why:** no build artefacts, no cross-package build ordering, and the code that runs is
the code in the repository. For a service of this size the trade is clearly worth it.

**Cost:** a slightly slower cold start on the API. `tsx` is a runtime dependency of the
API for that reason, since `NODE_ENV=production` makes `npm ci` skip devDependencies.

---

## 14. Mongoose `Mixed` for the kit, Zod as the schema

**Decided:** `kit`, `itemState` and `research` are `Schema.Types.Mixed`. Zod validates
before every write.

**Against:** modelling the kit structure in Mongoose as well.

**Why:** two definitions of the same structure eventually disagree, and the one that
matters is the one the assessment specifies. Zod already owns it and already runs on
every write. Mongo stores what Zod approved.

---

## 15. Review records are their own collection

**Decided:** one document per flashcard per kit, with a unique index on
`{ kitId, flashcardId }`.

**Against:** an array on the kit document.

**Why:** grading a card is the most frequent write in the application and comes from a
different interaction than editing. Embedding would mean rewriting the whole kit document
on every keystroke of a practice session. The unique index also makes grading an
idempotent upsert.

---

## 16. SM-2, with the interval capped at the days remaining

**Decided:** a lightweight SM-2, with `intervalDays` never exceeding
`schedule.days_available`.

**Against:** textbook SM-2, or a plain confidence sort.

**Why:** textbook SM-2 will happily schedule a review three weeks out. If the interview
is on Thursday, that card is never coming back — the algorithm is actively wrong for this
use. A plain sort, on the other hand, throws away the information that a card was easy
last time. Capping keeps the spacing behaviour and makes it fit the deadline.

---

## 17. The readiness report is not a model call

**Decided:** the creative feature is a deterministic join and sort over data the
application already holds.

**Against:** asking the model "what should this candidate work on".

**Why:** the model does not know what the user found hard — the application does. A join
over priority, coverage and measured confidence is instant, free, reproducible and
trustworthy. Handing it to a model would make it slower, cost tokens, and produce
something nobody can check.

---

## 18. Biome instead of ESLint and Prettier

**Decided:** one tool.

**Why:** one configuration, one command, fast enough to run on save. Its accessibility
rules caught a real bug — the theme switch was buttons with `role="radio"`, which loses
arrow-key movement within the group.

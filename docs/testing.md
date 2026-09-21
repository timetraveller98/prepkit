# Testing

```bash
npm test          # everything
npm run test:watch
```

136 tests, 12 files, about 18 seconds. No API key, no network, no installed database —
`mongodb-memory-server` provides MongoDB and a stubbed provider stands in for the model.

## What is covered, and why it was chosen

The assessment names three things worth protecting: schedule allocation, coverage
checking and structure validation. Those come first. The rest is where a regression
would be silent.

### `packages/core/test/schedule.test.ts`

The allocator's guarantees, each asserted rather than assumed:

- Exactly the requested number of days, for 1, 2, 3, 5, 7, 14, 30 and 60.
- Day numbers are `1..n` in order.
- Every question is scheduled when there are more days than questions, **and** when
  there are more questions than days.
- One day puts everything on day one.
- Every must-have requirement is reachable from the schedule.
- Harder, higher-priority material lands earlier.
- Every duration is a positive integer, across several day counts and difficulty mixes.
- Zero questions still produces the requested days, with a non-empty focus on each.
- `topicLabel` strips experience boilerplate: "5+ years with React" → "React".

### `packages/core/test/coverage.test.ts`

- Requirements with no question are reported, split into must and nice.
- A link to a requirement that does not exist is ignored, and the question is reported
  as an orphan.
- A question naming several requirements covers all of them.
- `dropUnknownRequirementLinks` leaves a kit referentially sound.

### `packages/core/test/kit-schema.test.ts`

A good kit passes. Each of these fails, individually:

- a question referencing a requirement that does not exist;
- a schedule day referencing a question that does not exist;
- a day count that disagrees with `days_available`;
- fractional minutes;
- a difficulty outside 1–3;
- duplicate ids;
- an unknown `priority`.

Plus: unknown keys are stripped, so a stored kit cannot drift.

### `packages/core/test/link-score.test.ts`

The retrieval judgement, which is otherwise invisible:

- an explicit hiring-process path outranks a generic careers page;
- anchor text alone carries intent when the path says nothing;
- legal, auth and asset links fall below the fetch threshold;
- shallow paths beat deeply nested ones;
- a handbook is recognised as a hiring lead;
- ranking deduplicates, drops off-site links and honours the exclusion set;
- content classification finds a real hiring process and does **not** claim one from
  marketing copy.

### `packages/core/test/security.test.ts`

- The blocklist across IPv4 and IPv6, including `::ffff:` mapped addresses, and that
  ordinary public addresses are allowed.
- `file:`, `ftp:` and `gopher:` are rejected; a bare host gains a scheme; fragments are
  dropped.
- Injection shapes are flagged; ordinary posting language is not.
- A forged fence inside the payload is neutralised, and oversized content is truncated.

### `packages/core/test/llm-json.test.ts`

Plain JSON, fenced JSON, JSON wrapped in commentary, trailing commas, a brace inside a
string, and a response with no JSON at all.

### `packages/core/test/practice.test.ts`

- A forgotten card returns within the hour.
- Intervals grow monotonically while confidence holds.
- The interval never exceeds the days remaining.
- Ease falls on hard, rises on easy.
- Ordering puts never-seen first, then least confident.
- Progress separates covered from not, and a card due in ten minutes is not yet due.

### `packages/core/test/readiness.test.ts`

- Zero before anything is practised.
- An unprepared must-have outranks an unprepared nice-to-have.
- A requirement the user can teach drops to zero risk and leaves the weak spots.
- No evidence outranks bad evidence.
- Weak spots name the cards to drill.

### `packages/core/test/pipeline.test.ts`

The one that ties it together. The **real** crawler runs against a **real** local fixture
site; only the model is stubbed.

- The full run validates, extracts 4 requirements with 3 must-haves, calls all four
  question categories separately, closes the coverage gap in a second pass, and produces
  a 5-day schedule whose every reference resolves.
- The hiring page buried at `/company/handbook/how-we-hire/` is found by the second-level
  crawl, and its content reaches the hiring-process prompt.
- A company with no hiring page produces `hiring_process_found: false` and an honest note.
- An unreachable company site still produces a valid kit, with the failures recorded.
- A two-line posting produces zero requirements, zero questions, a schedule that still
  spans the requested days, and a note saying why.
- An empty posting fails with `EMPTY_JOB_DESCRIPTION`.

### `apps/web/test/parse-cases.test.ts`

The batch upload parses in the browser, so the parser is worth protecting:

- JSON in the same shape the batch command takes, and in the camelCase spelling the
  interface uses.
- A missing day count defaults rather than rejecting the row; an out-of-range one is
  clamped.
- Skipped rows are reported with the row number they have in the file, and the good rows
  still come through.
- CSV with a posting that contains commas and newlines inside quotes, and doubled quotes
  unescaped.
- A CSV missing the columns it needs is refused with a message that says which.

### `apps/web/test/theme-contrast.test.ts`

Parses the design tokens out of `globals.css`, converts each `oklch` value to sRGB, and
asserts the WCAG contrast ratio for every text-on-surface pair in both themes, plus that
the two themes define the same token set. A palette tweak that quietly makes a label
unreadable fails the build rather than shipping.

### `apps/api/test/api.test.ts`

Supertest against the real Express app and an in-memory MongoDB.

- **Authentication** — register, identify, sign out; duplicate email; a weak password
  rejected before the database is touched; an unknown email and a wrong password return
  identical responses; protected endpoints closed when signed out; a tampered cookie
  rejected.
- **Bearer tokens** — a token minted with the shared secret authenticates; one signed
  with a different secret does not; an expired one does not; `/auth/verify` returns the
  user without issuing a cookie.
- **Ownership** — one account cannot read, list or delete another's kit.
- **The builder** — an edited question, a pinned question and a hand-written question
  each survive a regeneration of their category while the untouched generated one is
  replaced; an edited brief field survives while the untouched one refreshes; reordering
  works and an invented id is rejected; a question moves category; deleting the only
  question covering a must-have reports the gap it opened; the schedule rebuilds when the
  day count changes; an edit that would break the structure is refused.
- **Creating kits** — the same posting twice returns the existing kit with
  `duplicate: true`, and `force` overrides it; an unfetchable URL is rejected; a batch
  queues several kits.
- **Practice** — unseen cards first, progress tracked, an unknown confidence rejected,
  readiness naming the weakest must-have.

## What is not covered

- **React components.** Beyond the batch file parser, there are no component tests. The time went into the pipeline
  and the API, where a regression is silent; a broken panel is visible the moment you
  open it. `npm run typecheck` and the production build cover the compile surface.
- **The `/backend` forwarder.** It is exercised by hand and in the browser, not by an
  automated test, because testing it meaningfully means booting Next.
- **Real provider calls.** Deliberately. A test that needs a key and a network is a test
  that fails for reasons unrelated to the code. The provider adapters are thin; the
  logic around them — rate limiting, retries, JSON recovery, schema repair — is tested
  directly.
- **Real search providers.** Same reason. `SEARCH_PROVIDER=none` is used in tests.

## Fixtures

`packages/core/test/fixtures/sites/` holds two small static sites, shared by the tests
and by `npm run fixtures`:

- **acme** — a hiring page at `/company/handbook/how-we-hire/`, reachable only by
  following the homepage to `/company/`, to `/company/handbook/`, to the page itself. A
  fixed path list does not find it. Some links 404 on purpose, so failure recording is
  exercised.
- **northwind** — a real company site with no careers or hiring page anywhere, which is
  the case the assessment says it tests against.

`StubLlmProvider` responds per step label and counts calls, which is how the test can
make the first pass deliberately miss a requirement and then assert the second pass
closed it.

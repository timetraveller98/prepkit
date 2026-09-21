# PrepKit

Turn a pasted job description and a company website into a researched interview
preparation kit: a company brief, the requirements the posting actually states, a
categorised question bank, flashcards and a day-by-day study plan — all of it
editable, and practisable inside the app.

---

## Contents

- [What it does](#what-it-does)
- [Tech stack and why](#tech-stack-and-why)
- [Setup](#setup)
- [The batch entry point](#the-batch-entry-point)
- [Architecture](#architecture)
- [Retrieval](#retrieval)
- [How the research and generation steps are sequenced](#how-the-research-and-generation-steps-are-sequenced)
- [The second pass](#the-second-pass)
- [How the schedule is allocated](#how-the-schedule-is-allocated)
- [Generated, edited and pinned state](#generated-edited-and-pinned-state)
- [Practice mode](#practice-mode)
- [The readiness report](#the-readiness-report)
- [Handling a long, failure-prone generation](#handling-a-long-failure-prone-generation)
- [Edge cases](#edge-cases)
- [Security](#security)
- [Tests](#tests)
- [Deployment](#deployment)
- [Further documentation](#further-documentation)
- [Environment variables](#environment-variables)
- [Design decisions and trade-offs](#design-decisions-and-trade-offs)
- [Known limitations](#known-limitations)

---

## What it does

1. You paste a job description, give a company website, and say how many days you have.
2. The application reads the posting for the requirements it genuinely states.
3. It crawls the company site, ranks the links it finds, and goes looking for whatever
   page describes how they hire — wherever that turns out to live.
4. It searches for public discussion of that company's interview process.
5. It writes a company brief, then question sets — one call per category, each with its
   own interviewer persona — then flashcards.
6. **Code**, not the model, compares the questions against the requirements, feeds the
   gaps back for targeted generation, and re-checks.
7. **Code**, not the model, allocates the material across exactly the days you asked for.
8. The kit arrives as a draft you can edit, reorder, extend, prune and regenerate a
   section at a time without losing your work, and then practise against.

---

## Tech stack and why

| Layer | Choice | Why |
| --- | --- | --- |
| Frontend | Next.js 16 (App Router), React 19, Tailwind CSS 4 | The preferred stack. Radix primitives underneath the components so keyboard and screen-reader behaviour is correct rather than approximated. |
| Auth | NextAuth (Auth.js v5) in the web app, verified credentials in the API | Session handling, CSRF and cookie hardening are solved problems; v5 is the App Router version. The API stays stateless and takes a bearer token, so it is still usable and testable on its own. |
| Backend | Node.js + Express 5 | The preferred stack. Express 5 rather than 4 for native async error propagation, which removes a whole class of unhandled-rejection wrappers. |
| Database | MongoDB (Mongoose) | The preferred stack. A kit is one deeply nested document that is almost always read whole, which is exactly what a document store is good at. |
| Language | TypeScript, strict, everywhere | |
| Scraping | `undici`'s `fetch` (built into Node) + `cheerio` + `robots-parser` | No headless browser. Company marketing sites and handbooks are server-rendered; a browser would triple the runtime and the memory footprint for nothing. |
| LLM | Google Gemini (`gemini-2.5-flash`) | The most usable free tier for this workload: its tokens-per-minute budget is the one that survives a five-case batch. The provider is behind an interface, so any OpenAI-compatible endpoint (Groq, OpenRouter, Together) works by changing two environment variables. |
| Tests | Vitest + Supertest + `mongodb-memory-server` | |
| Lint/format | Biome | One tool instead of ESLint plus Prettier, and fast enough to run on every save. |

### Why a monorepo

The pipeline has to run from three places: the Express API, the mandatory batch
command, and the test suite. `packages/core` holds it once, and the API, the CLI and
the tests are all consumers. That is what makes "the same code your application uses,
not a parallel implementation" true by construction rather than by discipline.

### Why the API is a separate service

Generation routinely takes ninety seconds to two minutes. That does not fit
comfortably in a serverless function, and streaming progress out of one is awkward.
A long-lived Node process with an in-process queue and server-sent events is the
simpler correct answer, and it keeps retrieval, generation, scheduling and persistence
as visibly separate concerns.

---

## Setup

### Requirements

- Node.js 20.9 or newer (developed on 25)
- A MongoDB connection string — MongoDB Atlas free tier is fine
- A Gemini API key from <https://aistudio.google.com/apikey> (free, no card)

### Local

```bash
git clone <this repository>
cd prep-kit
npm install

cp .env.example .env
# fill in GEMINI_API_KEY and MONGODB_URI
```

Then, in separate terminals:

```bash
npm run dev          # api on :4000 and web on :3000
```

**No MongoDB installed?** This repository ships an ephemeral one so you do not have to
install anything:

```bash
npm run dev:db       # starts MongoDB on :27017, discards the data when you stop it
```

Open <http://localhost:3000>, create an account, and paste a posting.

There is also a small fixture site for exercising the crawler without hitting the open
internet:

```bash
npm run fixtures
# http://localhost:8099/acme/       a company whose hiring page is buried in a handbook
# http://localhost:8099/northwind/  a company with no hiring page anywhere
# http://localhost:8099/missing/    always 404
```

### Useful commands

```bash
npm run dev          # api + web
npm run dev:db       # ephemeral mongodb
npm run fixtures     # local fixture company sites
npm test             # the whole suite
npm run typecheck    # core, api and web
npm run lint         # biome
npm run build        # production build of the web app
npm run evaluate     # the batch entry point, below
```

---

## The batch entry point

```bash
npm run evaluate -- --input <cases.json> --output <kits.json>
```

Works from a clean clone after `npm install` and a filled-in `.env`. An example input
file is included, pointed at the local fixture sites:

```bash
npm run fixtures &                                              # optional, for cases 01–04
npm run evaluate -- --input cases.example.json --output kits.json
```

Optional flags: `--concurrency <1-4>` (default 2) and `--days <n>` to override every
case's day count.

What it does:

- Reads an array of `{ id, jd, company_url, days }`.
- Runs the same `generateKit` pipeline the web application runs. There is no second
  implementation.
- Shares **one** rate limiter across all cases, so raising concurrency cannot blow the
  free tier's tokens-per-minute budget.
- Writes `{ version, generated_at, kits: [{ id, status, kit, error }] }`.
- Records a failure and carries on. The process exits 0 as long as the run completed;
  it exits 2 only when the input file itself is unusable.
- Logs each step to stderr so a long run is legible while it happens.

Five cases complete well inside fifteen minutes at the default concurrency, including
retries. `.env` is loaded from the repository root automatically.

**Local addresses**: retrieval never assumes a host and follows relative links, so
`http://localhost:8099/acme/` works. Private and loopback addresses are blocked when
`NODE_ENV=production`; see [Security](#security).

---

## Architecture

```
packages/core            the pipeline — no framework, no database, no HTTP server
  kit.ts                 Appendix A as a Zod schema, plus the cross-field invariants
  state.ts               generated / edited / pinned state
  llm/                   provider adapters, rate limiting, retries, JSON recovery
  retrieval/             url guard, fetcher, robots, html, link ranking, crawler, search
  pipeline/
    steps/               one module per model call, each with its own prompt
    coverage.ts          deterministic: which requirements have no question
    schedule.ts          deterministic: allocate material across the days available
    run.ts               the orchestrator and its progress events
    regenerate.ts        section regeneration that preserves edits
  practice.ts            spaced repetition
  readiness.ts           the readiness report
  bin/evaluate.ts        the batch entry point

apps/api                 Express 5
  modules/auth           registration, login, sessions
  modules/kits           persistence, the builder endpoints
  modules/practice       review records and readiness
  jobs/                  in-process generation queue and the progress stream
  db/                    Mongoose models

apps/web                 Next.js 16
  app/                   routes
  components/            ui primitives, then feature components
  lib/                   api client, React Query hooks, types
  proxy.ts               route protection
```

The browser talks only to the web origin, and never holds a token for the API.

```
browser ──▶ Next.js
              ├─ /api/auth/*        NextAuth: sign in, session, CSRF
              ├─ /backend/*         reads the session, mints a 5-minute
              │                     HS256 token, forwards to Express
              └─ pages              proxy.ts guards them on the session
                       │
                       ▼
                   Express API  ──▶  MongoDB
```

The API is still directly reachable — `GET /health` on the API origin — and still
accepts its own session cookie, so it can be exercised and tested without the web app
in front of it.

---

## Retrieval

**The job description is never fetched.** It is pasted, so there is nothing to retrieve.

**The company site is crawled, not guessed.** A fixed list of paths finds `/careers`
and misses everything interesting. What actually happens:

1. Resolve the homepage, trying the URL as given, then with and without `www.`, then
   over http, then the site root. A 404 on a deep link does not end the run.
2. Read `robots.txt` once per origin, respect its rules and its crawl delay, and mine
   it for `Sitemap:` declarations.
3. Extract every same-site link from the homepage and score each one. Scoring looks at
   **both the URL path and the anchor text**, because "Join our team" pointing at
   `/company/2` is a stronger signal than the path is. Explicit hiring-process wording
   (`how-we-hire`, `hiring-process`, `interview-process`) scores highest; careers and
   handbook entry points next; about and product pages next; login, legal, commerce,
   localised duplicates, dated permalinks and non-HTML assets score negative. Depth is
   penalised.
4. Pull in sitemap URLs as additional candidates and score them the same way.
5. Fetch the best candidates with a concurrency limit and a politeness delay.
6. **Then go a level deeper.** Any fetched page that looks like a hiring hub gets its
   links extracted and scored again. This is the step that matters: it is how
   `/company/handbook/` leads to `/company/handbook/how-we-hire/`, which is where the
   fixture company — and GitLab, and PostHog — actually keep the useful page.
7. Classify each fetched page by content, not just by URL. A page containing "hiring
   process", "take-home" and "system design interview" is treated as a hiring page even
   if its path says nothing.

Anything that cannot be retrieved is recorded with its reason (`HTTP_ERROR: responded
404`, `ROBOTS_DISALLOWED: …`, `TIMEOUT: …`) and shown in the app under *What the
research reached*. It never ends the run.

**Public discussion** is searched through a small provider chain: Brave Search API if
`BRAVE_API_KEY` is set, then Tavily if `TAVILY_API_KEY` is set, then DuckDuckGo's HTML
endpoint, which needs no key. Result snippets are used as evidence; result pages are
fetched only where `robots.txt` allows it, which in practice means most large
aggregators are cited but not scraped. When nothing is found, the kit says so rather
than filling the gap.

**Sources used**: the company's own website (homepage, about, careers, handbook and
engineering pages, discovered by crawling) and whatever public web results the search
provider returns. No job boards — most block automated access, and the brief asks for
the description to be pasted instead.

---

## How the research and generation steps are sequenced

Each step consumes what the previous one found. The sequence is not decoration: a
company that publishes a take-home followed by a system design round produces a
different kit from one that publishes nothing.

| Step | Responsible for | Deterministic? |
| --- | --- | --- |
| `extract-requirements` | Reading the pasted posting into requirements with `must`/`nice` and a kind, each with a verbatim evidence span. No retrieval — the text is already here. | Model, with a code-side grounding check |
| `crawl-company-site` | Homepage resolution, robots, link ranking, two-level crawl, page classification | Code |
| `search-public-discussion` | Finding outside accounts of how they interview | Code (providers) |
| `company-brief` | A short factual brief from the fetched pages only | Model |
| `hiring-process` | Reconstructing their process, ranking company pages above anecdote, and reporting a confidence | Model |
| `questions:technical` | Depth on tools and practice the posting named | Model |
| `questions:system-design` | Design prompts anchored in this company's domain | Model |
| `questions:behavioural` | Past-situation questions tied to a named behaviour | Model |
| `questions:company-fit` | Questions that are impossible to answer without knowing this company | Model |
| `coverage` | Which requirements have no question against them | **Code** |
| gap fill | Targeted generation for the uncovered requirements | Model |
| `flashcards` | Recall cards, must-haves first | Model |
| `schedule` | Allocating topics across exactly the days available | **Code** |
| `validate` | The kit matches the agreed structure before anything is saved | **Code** |

**The four question categories are four separate calls** with four different system
prompts and four different requirement subsets. "Five years of React" reaches the
technical persona; "mentoring junior engineers" reaches the hiring-manager persona.
They never share a call or an instruction set.

**Two things are deliberately kept away from the model**, as the brief requires:
allocating topics across days is arithmetic, and comparing questions against
requirements to find gaps is a set operation. Both live in `packages/core/src/pipeline/`
as pure functions with tests.

A third thing is also kept away from it: **whether an extracted requirement is real**.
The model must return a verbatim evidence span for each requirement, and code checks
that span against the posting. Anything that cannot be traced back — full substring
match, or 50% token overlap for light reformatting — is dropped and the drop is
recorded in the kit's notes. Inventing requirements is the failure mode that matters
most here, so it is not left to a prompt.

---

## The second pass

After the first draft, `computeCoverage` returns every requirement with no question
linked to it. Coverage is by explicit `requirement_ids`, never by similarity, which is
what makes it checkable rather than a matter of opinion. Links to requirement ids that
do not exist are stripped before the check, so the model cannot fake coverage.

If any **must-have** is uncovered, those requirements are grouped by kind, routed to the
category that fits, and regenerated with the uncovered ids named explicitly in the
prompt. Then coverage runs again.

**Three passes, then a deterministic backstop.** Two model passes that both miss the
same requirement will usually miss it a third time — the cost is real and the marginal
return is not. So after three passes, any still-uncovered must-have gets a question
written by code from a template keyed on the requirement's kind. These are real
questions ("Walk me through the most demanding thing you have built with X. What broke,
and what would you design differently now?"), they are honest, and they guarantee the
one invariant that matters: **a kit never ships with an uncovered must-have**. When this
happens, the kit's notes say so.

Nice-to-haves are allowed to remain uncovered and are reported in
`coverage.uncovered_requirement_ids`.

---

## How the schedule is allocated

Pure arithmetic in `packages/core/src/pipeline/schedule.ts`:

1. **Order.** Sort questions by whether they cover a must-have, then by difficulty
   descending, then by category, then by id. Harder and higher-priority material ends
   up first, and the sort is stable across runs.
2. **Split the timeline.** `learningDays = min(questionCount, ceil(days × 0.75))`. New
   material goes in the first stretch; what is left becomes review. With 5 days that is
   4 learning days and a final review day; with 60 days and 20 questions it is 20
   learning days and 40 review days.
3. **Fill the learning days.** Each question carries study minutes by difficulty
   (10/15/25). Days get a target that tapers from 1.18× down to 0.82× of the average,
   so the early days are heavier. Questions are packed in order, with a guard that
   guarantees every remaining day still receives at least one question.
4. **Build the review days.** Each takes a rotating slice of the ordered list at review
   rates (5/8/12 minutes), so material recurs at spaced intervals. The final day is
   always the must-have questions, out loud, no notes.
5. **Label each day.** The focus line comes from the dominant category plus topic labels
   extracted from the linked requirements, with experience boilerplate stripped —
   "5+ years with React" becomes "React".

Guarantees, each covered by a test: the schedule has exactly the days requested, day
numbers run 1..n, every question appears, every must-have requirement is reachable,
and every duration is a positive integer.

Edge cases: one day puts everything on day one; sixty days produces sixty days with
spaced review; **zero questions still produces the requested number of days**, with an
honest focus line and no question ids, because the kit has nothing to study.

---

## Generated, edited and pinned state

This is the hardest state problem in the brief, and the shape of the answer is the
important part.

**The kit stays exactly the agreed structure.** Editing state is a sidecar map stored
beside it, keyed by item id:

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

Why a sidecar rather than a `_meta` key on each item: the kit is validated against
Appendix A on **every write**, and it is the object handed to the batch output. Keeping
bookkeeping out of it means the stored kit and the exported kit are the same thing,
and there is no shape to strip on the way out.

The rules:

- Any edit through the API sets `edited: true` and bumps `rev`.
- Anything the user writes by hand is `origin: "user"`.
- Pinning sets `pinned: true` without changing the content.
- An item is **protected** when it is user-authored, edited or pinned.

Regenerating a section keeps every protected item **in place**, drops only the
generated-and-untouched ones, and appends the new ones. The protected items are also
passed into the prompt as "these already exist, do not repeat them", so a regeneration
complements your edits instead of duplicating them. The response tells the interface
exactly which ids were kept and which were replaced, and the toast says so: *"Regenerated.
3 items you touched were kept."*

The company brief is tracked per field, so editing the summary and regenerating still
refreshes *what they do* while leaving your summary untouched.

Two invariants are enforced on **every** write, not just on regeneration:

- The schedule is rebuilt, so deleting a question can never leave a day pointing at
  something that no longer exists.
- Coverage is recomputed, so the interface always shows the truth. Deleting the only
  question covering a must-have is allowed — it is your kit — but the response names
  the gap it opened and the UI surfaces it.

Regeneration takes a per-section lock, so a double-click cannot run it twice.

In the interface, editing is inline with a 700 ms debounce plus save-on-blur and an
optimistic cache update, so typing never round-trips per keystroke. Reordering is
drag-and-drop (`@dnd-kit`, which also gives full keyboard reordering) applied
optimistically and reverted if the request fails. Moving a question between categories
is a menu action rather than a cross-list drag, because it is faster, and because it
works with a keyboard.

---

## Practice mode

Flashcards are stepped through one at a time: front, reveal, then rate how it felt on a
four-point scale. Space reveals, `1`–`4` rate, so a whole session is keyboard-only.

Ordering uses a **lightweight SM-2**: ease starts at 2.5 and moves with your ratings,
intervals grow as `1 → 3 → interval × ease`, a card you had no idea about comes back in
ten minutes, and the next session leads with never-seen cards, then the least confident,
then the most overdue.

One deliberate change to SM-2: **the interval is capped at the number of days you have
left**. Textbook spaced repetition would happily schedule a review for three weeks out.
If the interview is on Thursday, that card is never coming back, which makes the
algorithm actively wrong for this use. Capping it keeps everything in play before the
interview, which is the only thing that matters here.

Progress shows what has been covered, what is due, and how much is solid or better.

---

## The readiness report

*This is the optional creative feature.*

**The problem.** Two days out, the question is not "what is in my kit" — it is "where am
I most likely to get caught out, and what do I do in the next hour". A question bank
cannot answer that. It has no idea what you already know.

**What it does.** It joins three things the application already has and nothing else in
the kit connects: what the posting called a **must-have**, which flashcards cover each
requirement, and how confident you actually felt on those cards. From that it computes,
deterministically:

- a readiness score out of 100, weighting must-haves roughly three times nice-to-haves;
- ranked weak spots — highest priority, least evidence you know it, first;
- a deliberate tie-break where **a requirement you have never drilled outranks one you
  drilled badly**, because no evidence is worse than bad evidence: you do not even know
  how bad it is;
- a one-click drill of exactly those cards, and a print stylesheet that turns the report
  into a one-page sheet for the morning of.

It is not another model call. It is a join and a sort over data the app already holds,
which is the point: it is trustworthy, instant, and free.

---

## Handling a long, failure-prone generation

**It takes ninety seconds.** Creating a kit returns `202` immediately with a queued kit.
Generation runs in an in-process queue with a concurrency limit. Progress is pushed over
server-sent events **and** written to MongoDB in batches, so a browser that reloads or
reconnects mid-run replays what it missed instead of staring at a spinner. The interface
shows a real step checklist — *Crawling the company site*, *Looking for public
discussion*, *Checking every requirement is covered* — with substeps and their results.

**It fails halfway.** Steps are individually fault-tolerant. An unreachable company site
is recorded and the kit continues from the posting alone. A failed search is recorded.
A failed question category is recorded and the others still run. Only a failure that
makes a kit impossible — an empty posting, a model that will not respond at all, a kit
that will not validate — fails the run, and then the status, the error code and every
step that did complete are kept and shown, with a retry button.

**It is triggered twice.** Every kit carries a fingerprint over the user, the normalised
posting and the normalised URL. A second submission returns `200` with the existing kit
and `duplicate: true`; the interface offers *open the existing kit* or *build it again
anyway*, and only the second sends `force`. Separately, a kit already queued or running
cannot be enqueued again, and regeneration takes a per-section lock.

**The server restarts.** Anything left `queued` or `running` is marked failed with an
`INTERRUPTED` code on boot, rather than hanging forever in a state nothing will advance.

**The provider rate-limits you.** The client throttles *before* sending, tracking a
rolling one-minute window of both requests and estimated tokens, because free tiers cap
tokens per minute and that is the limit people actually hit. On a 429 it backs off
exponentially with jitter and honours `Retry-After` — including the `retryDelay` field
Gemini returns in its error body. The batch command shares one limiter across all cases.

**The model returns malformed JSON.** Output goes through a recovery pass that handles
markdown fences, leading prose, trailing commas and braces inside strings. If it still
fails schema validation, the model gets exactly one repair attempt with the validation
errors quoted back at it. If that fails too, the step fails cleanly.

---

## Edge cases

| Case | What happens |
| --- | --- |
| Company URL invalid, 404 or times out | Four homepage candidates are tried. If all fail, the attempts and their reasons are recorded, the brief says plainly that nothing could be retrieved, and **the kit is still produced** from the posting. Not a failed case — the scoring brief asks for unreachable sites to be recorded rather than fatal. |
| No hiring or about page anywhere | `research.hiring_process_found: false`, no stages invented, and the UI says the kit is built from the posting and brief alone. Company-fit questions are told not to pretend to know how they interview. |
| Two-line posting | Few or no requirements, a note saying the posting is *n* words and the kit is thin because the source is, few questions, and a schedule that still spans the requested days. A thin kit that says so beats an invented one. |
| Public discussion turns up nothing | Recorded in the notes; the hiring process falls back to company pages only, or to nothing. |
| Model returns invalid JSON or an incomplete kit | Recovery pass, then one schema-aware repair attempt, then a clean step failure. The kit is validated before it is ever saved. |
| Provider rate-limits or briefly fails | Pre-emptive throttling, exponential backoff with jitter, `Retry-After` and Gemini's `retryDelay` honoured, up to four attempts. |
| Same description and company twice | Fingerprint match returns the existing kit with `duplicate: true` and an explicit *build it again* path. |
| 1-day or 60-day schedule | 1 day: everything on day one. 60 days: sixty days, with learning front-loaded and the rest turned into spaced review. Both are tested. |

---

## Security

Everything fetched — and the pasted posting — is text nobody here wrote.

- **URL validation and SSRF.** Only `http` and `https`. Hostnames are resolved and every
  resulting address is checked against loopback, private, link-local, CGNAT, multicast
  and reserved ranges, IPv4 and IPv6 including `::ffff:` mapped forms. Redirects are
  followed manually and **re-checked at every hop**, so a public host cannot bounce the
  fetcher onto `169.254.169.254`. Blocking is on in production and can be relaxed with
  `ALLOW_PRIVATE_URLS=true` for local fixture sites — which is exactly the behaviour the
  brief asks for, since the batch command may be pointed at a local address.
- **Content types and sizes.** Only HTML, XHTML, XML and plain text are processed.
  Bodies are capped while streaming, not after download, and `content-length` is
  rejected up front when it is already too large. Every request has a timeout.
- **Prompt injection.** Untrusted text is wrapped in a per-call random fence, with a
  standing instruction that fenced content is data and never instruction. Any forged
  fence inside the payload is neutralised, and control characters are stripped. Text
  matching known injection shapes — instruction overrides, role hijacks, prompt
  exfiltration — is **flagged and surfaced in the kit**, so the user can see that a page
  tried something. The real defence is structural: every model response is parsed into a
  schema, ids are validated against ids the code minted, and coverage and scheduling are
  never delegated, so there is very little for an injected instruction to actually move.
- **Application security.** NextAuth owns the browser session: an encrypted, httpOnly,
  `sameSite` cookie with CSRF protection on its own routes. The browser never holds a
  token for the API. The web server mints a five-minute HS256 token per request when it
  forwards to the API, so a leaked token is worth almost nothing and the API stays
  stateless. Passwords are bcrypt at 12 rounds. Every kit route loads through an
  ownership check. Login, registration and credential verification are rate-limited
  separately from the rest of the API. Helmet sets the usual headers, CORS is an
  explicit allow-list, and request bodies are capped and schema-validated.

---

## Tests

```bash
npm test
```

136 tests. The ones worth having:

- **Schedule allocation** — exact day count for 1, 2, 3, 5, 7, 14, 30 and 60 days; every
  question scheduled in both directions of the more-days/more-questions split;
  must-haves reachable; harder material first; integer minutes; the zero-question case.
- **Coverage** — uncovered detection, must/nice split, links to requirements that do not
  exist ignored, orphan questions reported.
- **Structure validation** — a good kit passes; dangling question and schedule
  references, a day count that disagrees with `days_available`, fractional minutes, an
  out-of-range difficulty, duplicate ids and unknown enum values all fail.
- **Retrieval** — hiring paths outrank careers pages, anchor text alone can carry
  intent, assets and legal pages fall below threshold, shallow beats deep, content
  classification does not claim a hiring process from marketing copy.
- **Security** — the private-range blocklist across IPv4 and IPv6, protocol rejection,
  injection detection, fence forgery neutralisation.
- **The pipeline, end to end** — the real crawler against a real local fixture site with
  a stubbed model. It asserts the steps ran in order, that the hiring page buried at
  `/company/handbook/how-we-hire/` was found and reached the prompt, that the second
  pass closed a coverage gap, that an unreachable site still produces a valid kit, and
  that a two-line posting produces an honest thin one.
- **The builder** — an edited question, a pinned question and a hand-written question all
  survive a regeneration of their category while the untouched generated one is replaced.
- **Ownership** — one account can never read, edit or delete another account's kit.
- **Bearer tokens** — a token minted with the shared secret authenticates; one signed
  with the wrong secret, or an expired one, does not.
- **Theme contrast** — every text-on-surface pair in both themes is checked against WCAG
  by parsing the design tokens out of the stylesheet, so a palette change cannot quietly
  make a label unreadable.
- **The batch file parser** — JSON and CSV in every column spelling the interface
  accepts, postings containing commas and newlines inside quotes, doubled quotes, day
  counts clamped, and skipped rows numbered so they match the file.

---

## Deployment

- **Web** — Vercel. Import the repository, set **Root Directory** to `apps/web`, and set
  `API_ORIGIN` to the deployed API URL. Nothing else is needed; the `/api/*` rewrite is
  in `next.config.ts`.
- **API** — Render. `render.yaml` in the repository root is a blueprint: it builds with
  `npm ci`, starts with `npm run start:api`, health-checks `/health`, and generates
  `JWT_SECRET` for you. Fill in `MONGODB_URI`, `GEMINI_API_KEY` and `CORS_ORIGIN`
  (your Vercel URL) as secrets in the dashboard — they are marked `sync: false` so they
  are never committed.
- **Database** — MongoDB Atlas free tier. Allow access from anywhere, or from Render's
  egress addresses.

Set `NODE_ENV=production` on the API. That is what turns on the private-address block,
`secure` cookies and `trust proxy`.

Free-tier note: Render spins an idle free service down, so the first request after a
quiet period takes roughly a minute to wake.

---

## Environment variables

Every variable is documented inline in `.env.example`. The short version:

| Variable | Needed by | What it is for |
| --- | --- | --- |
| `GEMINI_API_KEY` | api, batch | The model key. Free from Google AI Studio. |
| `LLM_PROVIDER`, `LLM_MODEL` | api, batch | `gemini` by default. Set to any other value plus `LLM_API_KEY` and `LLM_BASE_URL` to use an OpenAI-compatible provider. |
| `LLM_REQUESTS_PER_MINUTE`, `LLM_TOKENS_PER_MINUTE`, `LLM_CONCURRENCY`, `LLM_MAX_ATTEMPTS` | api, batch | Client-side throttling so a free tier is never the reason a run fails. |
| `SEARCH_PROVIDER`, `BRAVE_API_KEY`, `TAVILY_API_KEY` | api, batch | Optional. With no key, DuckDuckGo's HTML endpoint is used. `none` skips the search step. |
| `ALLOW_PRIVATE_URLS` | api, batch | Allows loopback and private addresses. Off in production. Needed for the local fixture sites. |
| `FETCH_TIMEOUT_MS`, `FETCH_MAX_BYTES`, `CRAWL_MAX_PAGES` | api, batch | Retrieval budget. |
| `MONGODB_URI` | api | Connection string. |
| `JWT_SECRET` | api | Signs session cookies. At least 16 characters. |
| `SESSION_TTL_DAYS` | api | Cookie and token lifetime. |
| `CORS_ORIGIN` | api | Comma-separated browser origins allowed to call the API with credentials. |
| `GENERATION_CONCURRENCY` | api | How many kits may generate at once on one instance. |
| `AUTH_ATTEMPTS_PER_WINDOW`, `API_REQUESTS_PER_MINUTE` | api | Abuse limits. |
| `API_ORIGIN` | web | Where `/backend/*` is forwarded to. Server-side only; it is never sent to the browser. |
| `AUTH_SECRET` | web | Signs and encrypts the NextAuth session cookie. `npx auth secret` generates one. |
| `API_JWT_SECRET` | web | Must equal the API's `JWT_SECRET`. The web server signs a short-lived token with it when forwarding a request on a signed-in user's behalf. |

---

## Design decisions and trade-offs

**An unreachable company site does not fail a case.** The brief's Appendix B shows a
`COMPANY_UNREACHABLE` failure, but its FAQ says to reserve `failed` for a case you could
not produce a kit for at all, and the scoring criteria say unreachable sites should be
"recorded rather than fatal". A posting alone is enough to produce a useful kit, so the
site failure is recorded honestly in `research.pages_failed` and the case is `ok`.
Failure codes are reserved for an empty posting, a model that cannot be reached, and a
kit that will not validate.

**Three model passes, then code.** Guaranteeing the invariant with a template is better
than shipping a gap, and cheaper than a fourth pass that will probably fail the same way.
The kit says when it happened, so the guarantee is never silent.

**Evidence spans are verified by code.** The single most damaging failure here is
inventing a requirement the posting does not contain. Asking the model to be careful is
not a control; checking its evidence against the source is.

**A sidecar state map, not fields on the kit.** Keeps the stored kit and the exported
kit identical, and means the Appendix A validator runs on the real object rather than a
stripped copy.

**Rebuild the schedule on every write.** The allocator is deterministic and cheap, so
rebuilding is always safe and removes an entire class of dangling-reference bug. The
cost is that editing a question's difficulty reshuffles the plan — which is arguably
correct anyway.

**NextAuth in the web app, bearer tokens into the API.** Rolling session handling by
hand means owning CSRF, cookie flags, rotation and the sign-in surface. NextAuth solves
that, but it lives in Next and the API must not depend on it — so the boundary is a
plain short-lived HS256 token that Express verifies with a shared secret. The API never
imports Auth.js, and its tests drive it directly with cookies or bearer tokens. The
cost is one extra hop for every browser request; the benefit is that neither half has
to know how the other authenticates.

**`tsx` at runtime rather than a compile step.** One less build artefact, no
cross-package build ordering, and the code that runs is the code in the repository.
The cost is a slightly slower cold start on the API.

**Synchronous regeneration, asynchronous first generation.** A first run touches ten or
more model calls and needs streaming. Regenerating one section is one or two calls, so
it answers inside the request with the updated kit attached — which also removes a
refetch race against your own in-flight edits.

**No headless browser.** Faster, lighter, and fine for the server-rendered marketing
sites and handbooks that matter here. It does mean a fully client-rendered company site
yields little, which is a real limitation.

---

## Known limitations

- A company site that renders entirely on the client gives the crawler almost nothing.
  A headless-browser fallback would fix it at a large cost in runtime and memory.
- DuckDuckGo's HTML endpoint is the keyless search fallback and it is not stable. With
  no `BRAVE_API_KEY`, public-discussion results are best-effort; the kit reports honestly
  when there are none.
- The generation queue is in-process. One instance is correct; several instances behind
  a load balancer would each keep their own queue, and the progress stream only reaches
  clients connected to the instance running that kit. A shared queue is the fix, and it
  is more infrastructure than this brief asks for.
- If generation fails halfway, nothing partial is kept — the events are, but the sections
  that had completed are not. Persisting each section as it lands would be better.
- Pinning applies to questions and flashcards. Pinning a specific schedule day is not
  supported; the schedule is fully derived.
- Requirement extraction quality is bounded by the model. `gemini-2.5-flash` is
  consistent on well-structured postings and less so on prose-heavy ones that bury
  requirements in paragraphs.

---

## Further documentation

Longer-form documents live in [`docs/`](./docs):

| Document | What is in it |
| --- | --- |
| [`docs/architecture.md`](./docs/architecture.md) | Every module, what it owns, and how a request moves through the system |
| [`docs/pipeline.md`](./docs/pipeline.md) | Each research and generation step, its prompt contract, and the coverage loop |
| [`docs/data-model.md`](./docs/data-model.md) | The kit structure, the editing-state sidecar, collections and indexes |
| [`docs/api.md`](./docs/api.md) | Every endpoint, its payload, and its failure codes |
| [`docs/frontend.md`](./docs/frontend.md) | Routes, component boundaries, state strategy, accessibility |
| [`docs/security.md`](./docs/security.md) | Threat model and the control for each threat |
| [`docs/operations.md`](./docs/operations.md) | Environment, deployment, runbook, troubleshooting |
| [`docs/testing.md`](./docs/testing.md) | What is covered, what is not, and why |
| [`docs/decisions.md`](./docs/decisions.md) | The decision log, with what was rejected and why |

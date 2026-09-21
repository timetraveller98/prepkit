# The research and generation pipeline

`generateKit` in `packages/core/src/pipeline/run.ts` is the only entry point. The web
app, the batch command and the tests all call it.

```ts
const { kit, events, usage, research } = await generateKit({
  jobDescription,
  companyUrl,
  daysAvailable,
  llm,               // optional; built from the environment otherwise
  env,               // optional; process.env otherwise
  signal,            // optional; cancels retrieval and model calls
  onProgress,        // optional; called for every step transition
});
```

## The sequence

Each step consumes what the previous one found. Nothing runs speculatively.

```
 1  extract-requirements       posting → requirements, each with evidence
 2  crawl-company-site         homepage → ranked links → pages → a second level
 3  search-public-discussion   company name + role → outside accounts
 4  company-brief              fetched pages → a short factual brief
 5  hiring-process             hiring pages + discussion → stages and signals
 6  questions:technical        \
 7  questions:system-design     |  four separate calls, four personas,
 8  questions:behavioural       |  four requirement subsets
 9  questions:company-fit      /
10  coverage                   CODE: which requirements have no question
    └─ gap fill → coverage     repeat, up to three passes
    └─ backstop                CODE: a written question for anything still uncovered
11  flashcards                 requirements + questions → recall cards
12  schedule                   CODE: allocation across exactly the days available
13  validate                   CODE: the structure, before anything is saved
```

## Step by step

### 1. `extract-requirements`

Reads the pasted posting. No retrieval — the text is already here, which is the point
of the assessment's "pasted text needs no retrieval at all".

The model returns, per requirement: the text in the posting's own words, a `kind`
(`technical` / `behavioural` / `domain`), a `priority` (`must` / `nice`), and an
**evidence span copied verbatim from the posting**.

Then code takes over:

- `keepGrounded` checks each evidence span against the posting. A full substring match
  scores 1; otherwise the fraction of evidence tokens present in the posting is used.
  Below 0.5 the requirement is dropped and the drop is recorded in `notes`.
- Ids `r1..rn` are minted by the application, never by the model. Everything downstream
  references ids the code controls.
- Under sixty words, the posting is marked thin and a note says so explicitly.

The `must` / `nice` distinction comes from how the posting frames it — "required",
"expected", or stated as plain fact about the person, versus "bonus", "a plus",
"preferred", "nice to have". The prompt says this in those words, because the
distinction is graded and it is the posting's language that decides it.

### 2. `crawl-company-site`

See [architecture.md](./architecture.md) for the module boundaries; the algorithm:

1. **Resolve the homepage.** Try the URL as given, then toggle `www.`, then downgrade
   to `http`, then fall back to the site root. A 404 on a deep link is not the end.
2. **`robots.txt`**, once per origin, cached, respected, and mined for `Sitemap:`.
3. **Rank the homepage's same-site links.** Each link is scored on its path *and* its
   anchor text, because "Join our team" pointing at `/company/2` is a stronger signal
   than the path is.

   | Signal | Weight |
   | --- | --- |
   | `how-we-hire`, `hiring-process`, `interview-process`, `interview-guide`, `what-to-expect` | +16 |
   | `careers`, `jobs`, `open-roles`, `join-us`, `work-with-us` | +9 |
   | `handbook`, `playbook` | +8 |
   | `about`, `company`, `our-story`, `mission`, `what-we-do` | +8 |
   | `interview`, `interviewing` | +8 |
   | `hiring`, `recruiting`, `candidate` | +7 |
   | `life-at`, `working-at`, `culture`, `values`, `benefits`, `onboarding` | +5 |
   | `products`, `platform`, `solutions`, `how-it-works` | +4 |
   | `engineering`, `developers`, `docs` | +4 |
   | site root | +6 |
   | `login`, `signup`, `account`, `dashboard` | −14 |
   | `privacy`, `terms`, `legal`, `cookies`, `gdpr` | −12 |
   | `pricing`, `checkout`, `billing` | −7 |
   | dated permalink (`/2024/03/`) | −6 |
   | localised duplicate (`/de/`, `/fr/`, …) | −9 |
   | non-HTML asset | −40 |
   | each path segment beyond two | −1.6 |

   Anchor-text matches count at 0.8 of the path weight. The winning intent is whichever
   of hiring / about / engineering accumulated the most positive weight.

4. **Add sitemap URLs** as further candidates, scored the same way.
5. **Fetch the best**, with a concurrency limit and a politeness delay that respects
   `Crawl-delay`.
6. **Go one level deeper** from any page that turns out to be a hiring hub. This is the
   step that finds `/company/handbook/how-we-hire/` from `/company/handbook/` — the
   pattern GitLab and PostHog both use, and the one a fixed path list cannot reach.
7. **Classify by content, not just URL.** A page containing "hiring process",
   "take-home" and "system design interview" is a hiring page whatever its path says.
   Two or more such phrases flips `looksLikeHiringProcess`.

Every failure is recorded with its reason and carried into `research.pages_failed`.
A completely unreachable site throws `CompanySiteUnreachableError`, which the
orchestrator catches — it records the attempts and continues from the posting alone.

### 3. `search-public-discussion`

A provider chain: Brave (`BRAVE_API_KEY`), then Tavily (`TAVILY_API_KEY`), then
DuckDuckGo's HTML endpoint, which needs no key. `SEARCH_PROVIDER=none` skips the step
entirely, which is what the tests and offline runs use.

Two queries: `"<company>" interview process experience` and
`<company> <role> interview questions`.

Result snippets are the primary evidence. Result *pages* are fetched only where that
site's `robots.txt` allows it, which in practice means the large aggregators are cited
but not scraped. Nothing found is reported as nothing found.

### 4. `company-brief`

Only pages actually fetched from the company's own site are passed in, each inside an
untrusted fence. The model is told that marketing copy is evidence of positioning, not
of fact, and to list what the pages did not answer under `unknowns` instead of filling
the gap. Its `used_sources` are filtered against the URLs that were really fetched, so
it cannot cite a page that does not exist.

With no fetched pages, the step short-circuits without a model call and returns an
explicitly empty brief.

### 5. `hiring-process`

Takes the hiring-intent pages and the discussion, and is told in the prompt that
company-published pages outrank anonymous discussion, that anecdote may be out of date,
and that two well-supported stages beat six invented ones. It returns `found`, a
summary, stages, the signals a candidate should prepare for, and a confidence.

With neither hiring pages nor discussion, it short-circuits to `found: false` and a
note, again without a model call.

### 6–9. Questions, one category at a time

Four calls. Four system prompts. Four requirement subsets.

| Category | Persona | Requirements it sees | Notes |
| --- | --- | --- | --- |
| `technical` | The engineer running the screen | `technical` | Answerable in five minutes of talking; trade-offs and failure modes, not trivia |
| `system-design` | The interviewer running the design round | `technical` + `domain` | Anchored in this company's domain; difficulty clamped to 2–3 |
| `behavioural` | The hiring manager | `behavioural` | A specific past situation, never a hypothetical |
| `company-fit` | The person checking they did their homework | `domain` + `behavioural`, plus the brief and hiring process | Must be unanswerable without knowing this company; difficulty clamped to 1–2 |

This is the assessment's "five years of React leads to technical questions while
mentoring junior engineers leads to behavioural ones; the two should not come from the
same call with the same instructions", implemented literally.

Counts scale with the requirements found: `technical` is `clamp(ceil(musts × 1.2) + 2,
3, 10)`, `behavioural` is `clamp(musts + 2, 2, 6)`, `system-design` is 2 (3 for senior
titles) and skipped entirely when there is nothing technical or domain-shaped,
`company-fit` is 3. A thin posting therefore produces a thin bank without anyone asking
for one.

Every returned `requirement_ids` entry is filtered against ids the application minted.
Near-duplicate prompts are dropped by a token fingerprint.

### 10. Coverage, and the loop

```ts
computeCoverage(requirements, questions)
// → { byRequirement, uncovered, uncoveredMust, uncoveredNice, orphanQuestionIds }
```

A set operation over explicit `requirement_ids`. Not similarity, not an opinion, not a
model call. Links to ids that do not exist are stripped first, so coverage cannot be
faked by a hallucinated id.

If any **must-have** is uncovered:

1. Group the uncovered requirements by kind, and route each group to the category that
   fits (`behavioural` → behavioural, `domain` → company-fit, otherwise technical).
2. Regenerate with the uncovered ids named explicitly in the prompt and every existing
   prompt listed as "do not repeat these".
3. Run coverage again.

**Three passes, then a deterministic backstop.** Two passes that both miss the same
requirement will usually miss it a third time, and the tokens are not free. After three,
`synthesizeQuestion` writes a real question from a template keyed on the requirement's
kind, and the kit's notes record that it happened. `coverage.passes` counts every
evaluation, so the number in the kit is the number that actually ran.

Nice-to-haves are allowed to stay uncovered and are reported as such.

### 11. `flashcards`

One card, one retrievable answer, must-haves first. If the call fails, or returns
nothing while requirements exist, `synthesizeFlashcards` produces a card per must-have
so practice mode is never empty for no reason.

### 12. `schedule`

Pure arithmetic — see the README's *How the schedule is allocated* for the algorithm and
its guarantees.

### 13. `validate`

`validateKit` runs the full Zod schema plus the cross-field rules. A kit that fails is
never returned and never saved; the orchestrator throws `KIT_INVALID` with the issues
attached.

## Failure policy

| What failed | What happens |
| --- | --- |
| The posting is empty or under twenty characters | `EMPTY_JOB_DESCRIPTION`. There is nothing to build from. |
| `extract-requirements` | `LLM_UNAVAILABLE`. Everything downstream depends on it. |
| The company site is unreachable | Recorded in `research.pages_failed` and `notes`. **The run continues.** |
| Search | Recorded. The run continues without outside evidence. |
| `company-brief` or `hiring-process` | Recorded, an empty result substituted, the run continues. |
| One question category | Recorded, the other three still run. |
| Flashcards | The deterministic fallback runs. |
| Validation | `KIT_INVALID` with the failing paths. |

The rule: a case fails only when no kit could be produced at all. An unreachable
company site is a gap in a kit, not the absence of one.

## Progress events

Every transition is reported:

```ts
{ step: "crawl-company-site", status: "completed",
  message: "4 page(s) read, 3 skipped",
  at: "2026-09-21T09:20:56.882Z", index: 2, total: 10 }
```

`status` is `started`, `completed`, `skipped`, `failed` or `retrying`. Sub-steps use a
`parent:child` name (`questions:technical`), which is how the interface nests them and
how the batch command's stderr log stays readable.

# Operations

## Environment

One `.env` at the repository root serves all three packages. The API loads it with
`--env-file-if-exists`, the batch command loads it explicitly, and the web app loads it
from `next.config.ts` — Next would otherwise only look inside `apps/web`.

`.env.example` documents every variable inline. Copy it and fill in three things to get
running: `GEMINI_API_KEY`, `MONGODB_URI` and `AUTH_SECRET`.

### Required

| Variable | Used by | Notes |
| --- | --- | --- |
| `GEMINI_API_KEY` | api, batch | <https://aistudio.google.com/apikey>. Free, no card. |
| `MONGODB_URI` | api | Atlas free tier is fine. |
| `JWT_SECRET` | api | ≥ 16 characters. `openssl rand -base64 48`. |
| `AUTH_SECRET` | web | `npx auth secret`. |
| `API_JWT_SECRET` | web | Must equal the API's `JWT_SECRET`. |
| `API_ORIGIN` | web | The API's base URL. |

### Optional, with defaults

| Variable | Default | Notes |
| --- | --- | --- |
| `LLM_PROVIDER` | `gemini` | Anything else uses the OpenAI-compatible adapter |
| `LLM_MODEL` | `gemini-2.5-flash` | |
| `LLM_API_KEY`, `LLM_BASE_URL` | — | Required for an OpenAI-compatible provider |
| `LLM_REQUESTS_PER_MINUTE` | `10` | |
| `LLM_TOKENS_PER_MINUTE` | `200000` | The limit free tiers actually enforce |
| `LLM_CONCURRENCY` | `2` | |
| `LLM_MAX_ATTEMPTS` | `4` | |
| `SEARCH_PROVIDER` | — | `none` skips the search step entirely |
| `BRAVE_API_KEY`, `TAVILY_API_KEY` | — | Without either, DuckDuckGo's HTML endpoint is used |
| `ALLOW_PRIVATE_URLS` | off in production | Needed for local fixture sites |
| `FETCH_TIMEOUT_MS` | `12000` | |
| `FETCH_MAX_BYTES` | `2000000` | |
| `CRAWL_MAX_PAGES` | `12` | |
| `PORT` | `4000` | |
| `SESSION_TTL_DAYS` | `7` | |
| `CORS_ORIGIN` | `http://localhost:3000` | Comma-separated |
| `GENERATION_CONCURRENCY` | `2` | Per instance |
| `AUTH_ATTEMPTS_PER_WINDOW` | `20` | Per ten minutes |
| `API_REQUESTS_PER_MINUTE` | `300` | |

## Running locally

```bash
npm install
cp .env.example .env     # then fill it in
npm run dev              # api on :4000, web on :3000
```

Without MongoDB installed:

```bash
npm run dev:db           # ephemeral MongoDB on :27017, discarded on exit
```

Local fixture company sites, for exercising the crawler offline:

```bash
npm run fixtures
# /acme/       hiring page buried at /company/handbook/how-we-hire/
# /northwind/  no hiring page anywhere
# /missing/    always 404
```

Set `ALLOW_PRIVATE_URLS=true` to point a kit at them.

## Deployment

### API on Render

`render.yaml` is a blueprint: `npm ci`, `npm run start:api`, health check on `/health`,
`JWT_SECRET` generated at deploy time, and `MONGODB_URI`, `GEMINI_API_KEY`,
`CORS_ORIGIN` and `BRAVE_API_KEY` marked `sync: false` so they are entered in the
dashboard.

`NODE_ENV=production` is what turns on the private-address block, `secure` cookies and
`trust proxy`. It also makes `npm ci` skip devDependencies, which is why `tsx` is a
runtime dependency of `@prepkit/api` rather than a dev one.

### Web on Vercel

Import the repository, set **Root Directory** to `apps/web`, and set `API_ORIGIN`,
`AUTH_SECRET` and `API_JWT_SECRET`. Vercel handles the npm workspace itself.

### Database

MongoDB Atlas free tier. Network access must allow the API's egress; on Render's free
plan that means allowing all addresses, since it has no static egress IP.

### Order

1. Atlas cluster, user, connection string.
2. Deploy the API with `CORS_ORIGIN` set to a placeholder.
3. Deploy the web app with `API_ORIGIN` pointed at the API.
4. Update the API's `CORS_ORIGIN` to the real web URL.
5. Check `GET <api>/health`, then register an account on the web URL.

## Runbook

### A kit is stuck at `queued` or `running`

The queue is in-process, so the usual cause is a restart mid-generation. `releaseInterruptedKits`
marks anything left `queued` or `running` as `failed` with code `INTERRUPTED` on boot, so
a restart clears it and the kit gets a retry button. If it is genuinely still running,
`GET /health` reports `activeGenerations`.

### Every kit fails with `LLM_NOT_CONFIGURED`

`GEMINI_API_KEY` is missing or empty in the environment the API actually sees. On Render
that means the dashboard, not `.env`.

### Every kit fails with `LLM_UNAVAILABLE`

The key is wrong, the quota is exhausted, or the model name does not exist. The message
carries the provider's own response.

### Generation is very slow

Expected: ninety seconds to two minutes. Slower usually means rate limiting — the client
throttles before sending, so a low `LLM_REQUESTS_PER_MINUTE` or `LLM_TOKENS_PER_MINUTE`
shows up as waiting rather than as errors. Raise them to your tier's real limits.

### The company site is never reached

Check `research.pages_failed` in the kit — every attempt is there with its reason.
`BLOCKED_ADDRESS` means the host resolved to a private address; `ROBOTS_DISALLOWED`
means their `robots.txt` forbids it; `TIMEOUT` and `HTTP_ERROR` mean what they say.

### The first request after a quiet period takes a minute

Render's free plan spins an idle service down. The web app shows the request as pending;
it is not stuck.

### Sign-in returns a configuration error

`AUTH_SECRET` is not set for the web app, or the web app cannot read the root `.env`.
The server log carries the Auth.js error.

### Sign-in works but every API call is 401

`API_JWT_SECRET` on the web app does not match `JWT_SECRET` on the API.

## Cost

Everything is on a free tier. Roughly ten to fourteen model calls per kit, on the order
of forty to sixty thousand input tokens and eight to fifteen thousand output tokens.
Gemini's free tier absorbs a batch of five comfortably. `usage` on the kit record and the
batch command's final log line report the real numbers.

## Scaling notes

The one thing that does not scale horizontally is the generation queue: it is
in-process, so several instances would each keep their own, and the event stream only
reaches clients connected to the instance running that kit. A shared queue (Redis,
BullMQ, or a hosted equivalent) and a shared pub/sub for progress is the fix. Everything
else — the API, the web app — is stateless and scales by adding instances.

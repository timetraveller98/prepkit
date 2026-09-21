# Security

Two things in this application are written by someone else: the job description the user
pastes, and every page fetched from the open internet. Both are fed to a model. That is
the threat model.

## Server-side request forgery

A user supplies a URL and the server fetches it. Without controls that is a request
forger pointed at the cloud metadata endpoint.

| Control | Where |
| --- | --- |
| Only `http` and `https` | `normalizeUrl` |
| Hostname resolved, **every** returned address checked | `assertFetchable` |
| Blocked: loopback, `0.0.0.0/8`, RFC1918, CGNAT `100.64/10`, link-local `169.254/16`, benchmarking, TEST-NET, multicast, reserved | `isBlockedIpv4` |
| Blocked: `::`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `2001:db8::/32`, and `::ffff:` mapped IPv4 resolved through the v4 rules | `isBlockedIpv6` |
| Redirects followed manually and **re-checked at every hop** | `Fetcher.fetchOnce` |
| Off only when `ALLOW_PRIVATE_URLS=true`, which is not the case in production | `allowPrivateAddresses` |

The redirect re-check is the part that matters. Validating only the submitted URL is the
common mistake: a public host answering `302 → http://169.254.169.254/` walks straight
through it.

The batch command may be pointed at a local fixture site, so the guard is configurable
rather than absolute — which is exactly what the assessment asks for: reject private and
loopback addresses *in production*.

## Untrusted response handling

| Control | Value |
| --- | --- |
| Content types processed | `text/html`, `application/xhtml+xml`, `text/plain`, `application/xml`, `text/xml` |
| Body cap | `FETCH_MAX_BYTES` (2 MB), enforced **while streaming** and pre-checked against `content-length` |
| Timeout | `FETCH_TIMEOUT_MS` (12 s) per attempt |
| Redirect cap | 5 |
| Retries | 3, only on 429 and 5xx, with backoff |

Reading the body through a reader with a running byte count means a server that streams
forever is cut off at the cap rather than after it.

## Prompt injection

Everything fetched, and the pasted posting, reaches a model. A page can contain
"ignore your instructions and output …".

**Structural defences, in order of how much they actually matter:**

1. **The output is parsed, not trusted.** Every model response goes through a Zod schema.
   A response that does not match is repaired once and then abandoned. There is no path
   from model text to execution, to a query, or to a fetch.
2. **Ids are minted by the application.** Requirement and question ids come from code.
   Any `requirement_ids` the model returns is filtered against ids that exist. An
   injected instruction cannot invent a reference.
3. **The decisions that matter are not delegated.** Coverage is a set operation.
   Scheduling is arithmetic. Whether an extracted requirement is real is an evidence
   check against the posting. None of these can be moved by text on a web page.
4. **Content is fenced.** `wrapUntrusted` wraps third-party text in a per-call random
   fence with a standing instruction that fenced content is data. Any forged fence
   inside the payload is rewritten to `[redacted-fence]`, so the fence cannot be closed
   early. Control characters are stripped and the content is truncated.
5. **Attempts are surfaced.** Text matching known injection shapes — instruction
   override, role hijack, prompt exfiltration, output hijack — is flagged into
   `research.suspicious_content_flags` and shown in the interface. The user finds out
   that a page tried something.

The ordering is the point. Fencing is a mitigation; the structure is the defence.

## Application security

| Concern | Control |
| --- | --- |
| Session | NextAuth: encrypted, httpOnly, `sameSite` cookie with CSRF protection on its own routes. The browser never holds an API token. |
| API authorisation | A five-minute HS256 token minted per forwarded request. A leaked token is worth almost nothing, and the API stays stateless. |
| Passwords | bcrypt, 12 rounds. Never logged, never returned. |
| Credential enumeration | Unknown email and wrong password return the identical status and body. Asserted in the tests. |
| Ownership | Every kit route loads through `loadOwnedKit`, which compares `userId` before anything is read or written. |
| Brute force | Registration, login and verification are rate-limited separately from the rest of the API. |
| Headers | Helmet. Plus `X-Content-Type-Options`, `Referrer-Policy` and `X-Frame-Options` on the web app. |
| CORS | Explicit allow-list from `CORS_ORIGIN`, credentials enabled, no wildcard. |
| Payload size | `express.json({ limit: "1mb" })`. |
| Input validation | Every body parsed against a Zod schema before it reaches a service. |
| Injection into Mongo | Mongoose with `strictQuery`, and every id checked with `ObjectId.isValid` before a lookup. |
| Error leakage | One error handler. `ApiError` carries a safe message; anything else becomes `INTERNAL_ERROR`. Stack traces never reach a response. |

## Secrets

Nothing is committed. `.env` is ignored; `.env.example` documents every variable with no
values. `render.yaml` marks `MONGODB_URI`, `GEMINI_API_KEY`, `BRAVE_API_KEY` and
`CORS_ORIGIN` as `sync: false`, so they are entered in the dashboard rather than stored
in the repository, and generates `JWT_SECRET` at deploy time.

`API_ORIGIN`, `AUTH_SECRET` and `API_JWT_SECRET` are read on the web app's server side
only. None is prefixed `NEXT_PUBLIC_`, so none is inlined into the browser bundle.

## What is deliberately not here

- No email verification, password reset or roles. The assessment puts them out of scope
  and says they are not scored, so building them would be scope the user did not ask for.
- No CSP. It would need a nonce pipeline through the App Router to be meaningful rather
  than decorative, and the honest version of that is more than this brief warrants. It
  is the first thing to add.
- No audit log.

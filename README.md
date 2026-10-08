# VitalAI

A personalised nutrition and medication safety assistant. Photograph a food
label, a medicine strip or a supplement tub and get a verdict checked against
the active profile's allergies, conditions and current medications — grounded in
a retrieved corpus of nutrition and interaction sources, with citations.

**Stack** — React 18 · TypeScript · Express · MongoDB · Redis · Pinecone · Gemini
**Live** — https://REPLACE_WITH_YOUR_DOMAIN

---

## Features

| Feature | Description |
|---|---|
| **Food scan** | A safe / caution / avoid verdict from a photographed label, with the ingredients that triggered it and why they matter for this profile. |
| **Medicine & supplement checks** | OCR the pack and check interactions against the profile's medicines and conditions. |
| **VitalBot** | Retrieval-grounded chat with citations, in seven languages. |
| **Pantry and recipes** | Track what's in the kitchen; generate recipes that respect every dietary restriction on the profile. |
| **Family profiles** | One account, several people, with enforced isolation between them. |
| **Daily tracking** | Water, plate composition, streaks and a derived health score. |

A runtime architecture diagram is in
[`docs/diagrams/vitalai-runtime.html`](docs/diagrams/vitalai-runtime.html) —
nine components, one primary request path, and the trust boundaries.

---

## Engineering notes

Most of the work in this project is not visible from the interface. The
following sections describe the decisions behind it.

### Multi-tenant isolation

Every route resolves the requested profile through an ownership check before
touching data. `server/tests/ownership.test.ts` asserts that account A cannot
read, update or delete anything belonging to account B, across scans, pantry,
chat and saved recipes. It runs in CI on every push.

### Session management

Refresh tokens are stored SHA-256 hashed and rotate on every use
(`server/src/services/tokens.ts`). Each chain carries a `familyId`, and revoked
tokens are retained until expiry **so that reuse is detectable** — presenting an
already-rotated token is treated as theft and revokes the entire family.

On the client, concurrent refreshes are gated behind a single promise, and
serialised across browser tabs with a Web Locks lock: a dashboard can have nine
requests in flight when the access token expires, and two tabs waking together
would otherwise each present the same token and trip reuse detection.

### Prompt injection defence

Untrusted content — OCR output, a label, a community post, the profile's own
free-text fields — never enters the system prompt. It is wrapped in delimited
blocks inside a *user* turn, forged closing tags are stripped, and conversation
history is replayed as real multi-turn messages rather than concatenated text
(`server/src/services/promptSafety.ts`). The defence is structural rather than a
filter, because a filter can be rephrased around. `npm run test:injection` runs
a suite of attempted overrides against the live model.

### Encryption at rest

Conditions, medications and allergies are encrypted with AES-256-GCM through
transparent Mongoose hooks (`server/src/services/encryption.ts`), so no route
has to remember to do it. A failed decrypt throws rather than returning
ciphertext, and the structured logger drops those fields wholesale so health
data cannot reach a log line.

### A single error contract

Every handler runs through `asyncHandler` into one error middleware that maps
status, code, next action and a correlation ID. Nothing internal crosses the
boundary: the raw cause is logged server-side and the client receives a plain
sentence plus the reference. `describeError` on the client normalises anything
thrown — server body, timeout, offline, aborted — and `SectionBoundary`
guarantees that every data surface renders loading, error, empty *and* success,
so a failed request can never be mistaken for an empty one.

### Cost control

AI spend is metered in tokens rather than request counts: a per-user daily token
budget, per-user rate limits, and a global daily spend ceiling in integer
micro-dollars that degrades AI routes gracefully instead of billing without
bound. The budget is a reservation — an over-estimate is charged atomically
before the call and settled against actual usage afterwards — so two concurrent
requests cannot both pass the same check. Rate limits, budgets and cached
generations share one Redis-backed store, and retried AI mutations carry an
idempotency key so a flaky connection cannot bill a scan twice.

### Observability

Structured JSON logs with a correlation ID per request, propagated through
`AsyncLocalStorage` and surfaced to the user on any error. Server exceptions and
browser-side crashes both reach the same error tracker; the client reports
through `POST /api/telemetry/client-error` rather than a browser SDK, which
keeps the reporting credential server-side and adds nothing to the bundle.

### Design system

Documented in [`DESIGN-SYSTEM.md`](DESIGN-SYSTEM.md). Fraunces / Karla /
JetBrains Mono, a warm sand ground with deep forest-black used as structural
blocking, one brand hue and three semantic hues each carrying exactly one
meaning. Every colour pair is contrast-verified (body text ≥4.5:1, control
borders ≥3:1 per WCAG 1.4.11), controls are 44px minimum, and motion collapses
to nothing under `prefers-reduced-motion`.

---

## Getting started

**Prerequisites** — Node 22, a MongoDB instance, and API keys for Gemini and
Pinecone. Redis is optional in development and required in production.

```bash
# Install
cd server && npm ci
cd ../client && npm ci

# Configure. The server validates its environment at boot and refuses to start
# on an invalid one — see server/src/config/env.ts for the contract.
cp server/.env.example server/.env
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY (64 hex characters, distinct from both)

# Prepare the database and knowledge base
cd server
npm run migrate        # indexes and schema migrations
npm run ingest         # embed the corpus into Pinecone

# Run
npm run dev                     # API on :5000
cd ../client && npm run dev     # client on :5173
```

---

## Testing

```bash
cd server
npm run typecheck && npm run lint
npm test                 # integration tests need MongoDB at TEST_MONGODB_URI;
                         # the harness refuses to run against a non-test database
npm run test:llm         # provider smoke test — makes a real generation call
npm run test:injection   # prompt-injection suite against the live model

cd ../client
npm run typecheck && npm run lint && npm run build
```

Three server suites: `auth.test.ts` and `ownership.test.ts` boot the real
application and exercise the shipping middleware stack over HTTP; `pure.test.ts`
covers the logic that needs no database — streak arithmetic, profile
completion, score clamping and the model-output schemas. CI runs all of them
against a real MongoDB, typechecks and lints both packages, builds the client,
and fails the job if a credential-shaped string reaches the bundle.

---

## Deployment

The client proxies `/api/*` through its own origin (`client/vercel.json`) rather
than calling the API cross-site. This is deliberate: authentication cookies are
`SameSite=Lax`, Lax is what stands in for a CSRF token here, and a Lax cookie is
not sent on cross-site XHR — so a split-domain deployment would break every
authenticated request. Keeping the two same-origin preserves that protection and
removes CORS entirely.

The API deploys from `server/render.yaml`. The full runbook, including the
production-only requirements the environment contract enforces, is in
[`docs/deployment.md`](docs/deployment.md).

---

## Project structure

```
client/                     React 18 · Vite · Tailwind · TanStack Query · Zustand
  src/lib/errors.ts         one description for anything thrown
  src/components/shared/    SectionBoundary, ErrorState, CanvasPanel
  src/components/ui/        primitives — every state, every variant

server/                     Express · Mongoose · Node 22 ESM
  src/config/env.ts         Zod environment contract, no fallbacks for secrets
  src/middleware/           auth · validate · rateLimiter · idempotency · errors
  src/services/             tokens · encryption · llm · promptSafety · usage
  src/routes/               50 endpoints, each validated at the boundary
  tests/                    auth, cross-account ownership, and pure logic
```

Retrieval pipeline: `gemini-embedding-001` → Pinecone serverless (1536
dimensions, cosine) → `gemini-2.5-flash`, with the retrieved passages supplied
as cited context and the response validated against a schema before it is
stored or shown.

---

## Licence

MIT.

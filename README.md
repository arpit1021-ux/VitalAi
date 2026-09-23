# VitalAI

Scan a food label and find out what it means **for you** — your allergies, your
conditions, the medicines you take. Answers are grounded in a retrieved corpus
of nutrition and interaction sources and carry their citations.

**Live:** https://REPLACE_WITH_YOUR_DOMAIN · **Stack:** React 18 · TypeScript ·
Express · MongoDB · Redis · Pinecone · Gemini

---

## What it does

| | |
|---|---|
| **Food scan** | Photograph a label; get a safe / caution / avoid verdict checked against the active profile, with the ingredients that triggered it. |
| **Medicine & supplement checks** | OCR the pack, check interactions against the profile's medicines and conditions. |
| **VitalBot** | Chat, grounded in retrieved sources, in seven languages. |
| **Pantry → recipes** | Track what's in, generate recipes that respect the profile's restrictions. |
| **Family profiles** | One account, several people, strict isolation between them. |

---

## The parts worth reading

Most of the engineering here is invisible from the UI. These are the bits I'd
point at.

### Multi-tenant isolation is tested, not assumed
Every route resolves the profile through an ownership check before touching
data. `server/tests/ownership.test.ts` asserts that account A cannot read,
update or delete anything belonging to account B — across scans, pantry, chat
and saved recipes. It runs in CI on every push.

### Refresh-token rotation with reuse detection
`server/src/services/tokens.ts`. Tokens are stored SHA-256 hashed and rotate on
every refresh. Each chain carries a `familyId`, and revoked tokens are retained
until TTL **so that reuse is detectable** — presenting an already-rotated token
is treated as theft and invalidates the whole family. A `jti` per token stops
two refreshes inside the same second from colliding.

On the client, `lib/api.ts` gates concurrent refreshes behind a single promise:
a dashboard can have nine requests in flight when the access token expires, and
without the gate the second one to arrive would present a rotated token and log
the user out of every device.

### Prompt injection defence is structural, not a filter
`server/src/services/promptSafety.ts`. Untrusted content — OCR text, a label, a
community post — never enters the system prompt. It is wrapped in delimited
blocks inside a *user* turn, forged closing tags are stripped, and conversation
history is replayed as real multi-turn messages rather than concatenated text.
`npm run test:injection` runs a suite of attempted overrides against the live
model.

### Field-level encryption for health data
AES-256-GCM via transparent Mongoose hooks (`services/encryption.ts`).
Conditions, medications and allergies are encrypted at rest. A failed decrypt
throws rather than returning ciphertext, and the structured logger drops those
fields wholesale so health data cannot reach a log line.

### One error contract, end to end
Every handler runs through `asyncHandler` into a single error middleware that
maps status, code, next action and a correlation ID. Nothing internal crosses
the boundary: the raw cause is logged server-side, the user gets a plain
sentence and the reference. On the client, `describeError` turns any failure —
server body, timeout, offline, aborted — into something renderable, and
`SectionBoundary` guarantees every data surface renders loading, error, empty
*and* success. One failing section never blanks a page.

### Cost control that actually binds
AI spend is metered in tokens, not request counts: a per-user daily token
budget, a per-user rate limit, and a **global daily spend ceiling in integer
micro-dollars** that degrades AI routes gracefully rather than billing without
limit. Budgets are checked *before* the call. Retried AI mutations carry an
idempotency key so a flaky connection cannot bill a scan twice.

### A design system, not a component library
`DESIGN-SYSTEM.md`. Fraunces / Karla / JetBrains Mono, a warm sand ground with
deep forest-black used as structural blocking, one brand hue and three semantic
hues each with exactly one meaning. Every colour pair is contrast-verified
(body text ≥4.5:1, control borders ≥3:1 per WCAG 1.4.11). Motion is centralised
and collapses to nothing under `prefers-reduced-motion`.

---

## Running it

```bash
# 1. Dependencies
cd server && npm ci
cd ../client && npm ci

# 2. Configure. The server refuses to boot on an invalid environment rather
#    than failing later — see server/src/config/env.ts for the contract.
cp server/.env.example server/.env
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY (64 hex chars, must differ from both)

# 3. Database and knowledge base
cd server
npm run migrate        # indexes and schema migrations
npm run ingest         # embed the corpus into Pinecone

# 4. Run
npm run dev            # API on :5000
cd ../client && npm run dev   # client on :5173
```

### Checks

```bash
cd server
npm run typecheck && npm run lint
npm test               # needs a MongoDB at TEST_MONGODB_URI; the harness
                       # refuses to run against a database that is not a test one
npm run test:llm       # provider smoke test — a real generation call
npm run test:injection # prompt-injection suite

cd ../client
npm run typecheck && npm run lint && npm run build
```

---

## Deployment

The client proxies `/api/*` through its own origin (`client/vercel.json`) rather
than calling the API cross-site. This is deliberate: auth cookies are
`SameSite=Lax`, Lax is what stands in for a CSRF token, and a Lax cookie is not
sent on cross-site XHR — so a split-domain deployment would break every
authenticated request. Same-origin also removes CORS entirely.

The API deploys from `server/render.yaml`. Full runbook, including the
production-only requirements the environment contract enforces (Redis, real
SMTP, https URLs), is in `docs/deployment.md`.

---

## Architecture

```
client/                     React 18 · Vite · Tailwind · TanStack Query · Zustand
  src/lib/errors.ts         one description for any thrown thing
  src/components/shared/    SectionBoundary, ErrorState, CanvasPanel, splash
  src/components/ui/        primitives — every state, every variant

server/                     Express · Mongoose · Node 22 ESM
  src/config/env.ts         Zod environment contract, no fallbacks for secrets
  src/middleware/           auth · validate · rateLimiter · idempotency · errors
  src/services/             tokens · encryption · llm · promptSafety · usage
  src/routes/               50 endpoints, each validated at the boundary
  tests/                    auth and cross-account ownership, run in CI
```

Retrieval: `gemini-embedding-001` → Pinecone serverless (1536-dim, cosine) →
`gemini-2.5-flash` with the retrieved passages as cited context.

---

## Licence

MIT.

<div align="center">

# VitalAI

**A personalised nutrition and medication-safety assistant: scan a label, get a verdict checked against your family's allergies, conditions, and medications, with citations.**

![React](https://img.shields.io/badge/React_18-20232A?style=flat-square&logo=react&logoColor=61DAFB)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js_22-339933?style=flat-square&logo=nodedotjs&logoColor=white)
![MongoDB](https://img.shields.io/badge/MongoDB-47A248?style=flat-square&logo=mongodb&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)

[Features](#features) · [How it works](#how-it-works) · [Engineering highlights](#engineering-highlights) · [Getting started](#getting-started) · [Testing](#testing)

</div>

<!-- Add a live link if you have one, and 2-3 screenshots (scan result, VitalBot chat, family profiles).
Save images in /docs and uncomment:
[Live Demo](https://your-domain-here)
<p align="center">
  <img src="docs/scan-result.png" alt="Safe / caution / avoid verdict" width="85%">
</p>
-->

## Overview

Food labels and medicine packs are hard to read against your own allergies, health conditions, and current medications, and harder still for a whole family. VitalAI lets you photograph a food label, a medicine strip, or a supplement tub and get a clear verdict for the active family member, grounded in a retrieved corpus of nutrition and interaction sources and shown with citations.

## Features

| Feature | What it does |
|---|---|
| **Food scan** | A safe / caution / avoid verdict from a photographed label, with the ingredients that triggered it and why they matter for this profile. |
| **Medicine and supplement checks** | OCR on the pack, then interaction checks against the profile's medicines and conditions. |
| **VitalBot** | Retrieval-grounded chat with citations, in seven languages. |
| **Pantry and recipes** | Track what's in the kitchen and generate recipes that respect every dietary restriction on the profile. |
| **Family profiles** | One account, several people, with enforced data isolation between them. |
| **Daily tracking** | Water, plate composition, streaks, and a derived health score. |

## How it works

```
Photo of a label or pack
          ↓
   OCR text extraction
          ↓
Retrieve relevant nutrition and interaction sources (Pinecone)
          ↓
Gemini generates a verdict using the retrieved passages and the active profile
          ↓
Output validated against a schema, then shown with citations
```

Retrieval pipeline: `gemini-embedding-001` → Pinecone serverless (1536 dimensions, cosine) → `gemini-2.5-flash`. A runtime architecture diagram (nine components, one primary request path, and the trust boundaries) is in [`docs/diagrams/vitalai-runtime.html`](docs/diagrams/vitalai-runtime.html).

## Engineering highlights

Because the app handles health data and calls a paid LLM, most of the work is in safety, security, and cost control.

- **Multi-tenant isolation:** every route resolves the requested profile through an ownership check before touching data. `server/tests/ownership.test.ts` asserts that account A cannot read, update, or delete anything belonging to account B, and it runs in CI on every push.
- **Session security:** refresh tokens are stored SHA-256 hashed and rotate on every use. Revoked tokens are kept until expiry so that reuse is detectable, and presenting a rotated token revokes the whole token family. On the client, concurrent refreshes are gated behind one promise and a Web Locks lock across tabs.
- **Prompt-injection defence:** untrusted content (OCR output, labels, free-text profile fields) never enters the system prompt. It is wrapped in delimited blocks inside a user turn, and forged closing tags are stripped. The defence is structural rather than a filter, and `npm run test:injection` runs attempted overrides against the live model.
- **Encryption at rest:** conditions, medications, and allergies are encrypted with AES-256-GCM through transparent Mongoose hooks, so no route has to remember to do it. The structured logger drops those fields so health data cannot reach a log line.
- **Cost control:** AI spend is metered in tokens, with per-user daily budgets, per-user rate limits, and a global daily spend ceiling that degrades AI routes gracefully. Budgets are reserved atomically before a call and settled afterwards, and retried AI mutations carry an idempotency key so a flaky connection cannot bill a scan twice.
- **One error contract:** every handler flows into a single error middleware that returns a plain message plus a correlation ID, never internals. On the client, every data surface renders loading, error, empty, and success states, so a failed request is never mistaken for an empty one.
- **Observability:** structured JSON logs with a correlation ID per request, and a client error endpoint (`POST /api/telemetry/client-error`) that keeps the reporting credential server-side.
- **Accessibility:** colour pairs are contrast-verified (body text at least 4.5:1, control borders at least 3:1), controls are at least 44px, and motion is removed under `prefers-reduced-motion`.

## Tech stack

| Layer | Technology |
|---|---|
| Client | React 18, Vite, TypeScript, Tailwind CSS, TanStack Query, Zustand |
| Server | Node.js 22, Express, Mongoose, Zod (environment and request validation) |
| Data | MongoDB, Redis (rate limits, budgets, cached generations), Pinecone |
| AI | Gemini (`gemini-2.5-flash`), `gemini-embedding-001`, RAG with citations |
| Quality | ESLint, TypeScript, automated tests, GitHub Actions CI |
| Deployment | Vercel (client), Render (API) |

## Getting started

**Prerequisites:** Node 22, a MongoDB instance, and API keys for Gemini and Pinecone. Redis is optional in development and required in production.

```bash
# Install
cd server && npm ci
cd ../client && npm ci

# Configure. The server validates its environment at boot and refuses to start
# on an invalid one (see server/src/config/env.ts).
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

## Testing

```bash
cd server
npm run typecheck && npm run lint
npm test                 # integration tests need MongoDB at TEST_MONGODB_URI;
                         # the harness refuses to run against a non-test database
npm run test:llm         # provider smoke test (makes a real generation call)
npm run test:injection   # prompt-injection suite against the live model

cd ../client
npm run typecheck && npm run lint && npm run build
```

Three server suites: `auth.test.ts` and `ownership.test.ts` boot the real application and exercise the shipping middleware stack over HTTP, and `pure.test.ts` covers logic that needs no database (streak arithmetic, profile completion, score clamping, and the model-output schemas). CI runs all of them against a real MongoDB, typechecks and lints both packages, builds the client, and fails the job if a credential-shaped string reaches the bundle.

## Deployment

The client proxies `/api/*` through its own origin (`client/vercel.json`) instead of calling the API cross-site. Auth cookies are `SameSite=Lax`, which stands in for a CSRF token here, and a Lax cookie is not sent on cross-site requests, so keeping client and API same-origin preserves that protection and removes CORS entirely. The API deploys from `server/render.yaml`; the full runbook is in [`docs/deployment.md`](docs/deployment.md).

## More documentation

- [`PRODUCTION_BLUEPRINT.md`](PRODUCTION_BLUEPRINT.md): production requirements and architecture decisions
- [`PRIVACY.md`](PRIVACY.md): how health data is handled
- [`docs/diagrams/vitalai-runtime.html`](docs/diagrams/vitalai-runtime.html): runtime architecture diagram

## Author

Built by **Arpit Singh**, final-year B.Tech (CCE) student at LNMIIT Jaipur.
[LinkedIn](https://www.linkedin.com/in/arpitsingh05) · [Portfolio](https://arpitdev-mu.vercel.app/) · [GitHub](https://github.com/arpit1021-ux)

## Licence

MIT.

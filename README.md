# VitalAI

A nutrition assistant built around families rather than individuals. One
account holds several profiles — a diabetic parent, a vegetarian sibling, a
child with a nut allergy — and every answer the app gives is checked against
the profile it is for.

Photograph a food label and it reads the ingredients and tells you whether that
product is a problem for that specific person. Ask it a nutrition question and
it answers from a curated knowledge base rather than from the model's memory,
and shows you which sources it used.

## Stack

| Layer | What |
|---|---|
| Client | React 18, Vite, TypeScript, Tailwind, Radix UI, TanStack Query, Zustand |
| Server | Node 20, Express, TypeScript (ESM), Mongoose |
| Database | MongoDB |
| Retrieval | Pinecone serverless, `gemini-embedding-001` at 1536 dimensions |
| Generation | Gemini 2.5 Flash (Anthropic supported via `LLM_PROVIDER=claude`) |
| OCR | Tesseract.js, in the browser |
| Images | Sharp for compression, Cloudinary for storage (optional) |
| Auth | JWT in httpOnly cookies, bcrypt, optional Google OAuth |

## How a scan works

```
photo → browser OCR → POST /api/scans/food
                        ├─ verify the profile belongs to the caller
                        ├─ embed the query, retrieve from Pinecone (8s budget,
                        │  degrades to an ungrounded answer on timeout)
                        ├─ compress to 800px, strip EXIF, send to Gemini vision
                        ├─ parse the JSON verdict
                        └─ store the scan, return verdict + cited sources
```

Retrieval never blocks a scan. If Pinecone is slow or down the analysis still
runs, and the response says it was not grounded.

## Running it locally

Requires Node 20.11 or newer and a MongoDB instance.

```bash
git clone <repo> && cd VitalAI
npm install
npm --prefix server install
npm --prefix client install

cp .env.example server/.env      # fill in every value
cp .env.example client/.env      # only VITE_API_URL is read here

# secrets must be at least 32 characters
openssl rand -hex 32             # JWT_SECRET
openssl rand -hex 32             # JWT_REFRESH_SECRET
```

On Windows PowerShell, without openssl:

```powershell
-join ((1..32) | ForEach-Object { '{0:x2}' -f (Get-Random -Max 256) })
```

```bash

npm run migrate                  # indexes and backfills, idempotent
npm run ingest                   # loads the knowledge base into Pinecone
npm run dev                      # server on :5000, client on :5173
```

The server validates its entire environment at boot and exits with a list of
what is wrong rather than starting with insecure defaults. If it will not
start, the message tells you which variables to fix.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Server and client together, both watching |
| `npm run build` | Production client build |
| `npm run typecheck` | TypeScript across both packages |
| `npm run migrate` | Apply pending migrations (safe to re-run) |
| `npm run ingest` | Rebuild the Pinecone knowledge base |

## Knowledge base

110 curated passages across 14 nutrition topics live in
`server/src/scripts/ingestKnowledge.ts`. `npm run ingest` embeds and upserts
them. Retrieval returns the top 5 matches above a cosine score of 0.3, and the
sources are shown in the UI alongside the answer.

## What this is not

VitalAI gives general nutrition information. It does not diagnose, prescribe,
or replace a clinician, and every response says so. Medication interaction
checks are a prompt to ask a pharmacist, not an answer.

---

Built by [Arpit Singh](https://linkedin.com/in/arpitsingh05)

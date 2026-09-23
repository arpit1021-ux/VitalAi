# Deploying VitalAI

The stack below is chosen to be free or near-free at demo scale, and to avoid
the one arrangement that silently breaks authentication.

| Piece | Service | Tier |
|---|---|---|
| Client | Vercel | Hobby (free) |
| API | Render web service | Free |
| Database | MongoDB Atlas | M0 (free) |
| Redis | Upstash | Free |
| Vectors | Pinecone serverless | Free |
| Mail | Resend | Free (3k/month) |
| Errors | Sentry | Developer (free) |

---

## 1. The arrangement, and why

**The client proxies `/api/*` through its own origin. The API is never called
cross-site.**

Auth cookies are `SameSite=Lax`, and in this codebase Lax is what stands in for
a CSRF token — see the comment in `server/src/services/tokens.ts`. A Lax cookie
is **not sent on cross-site XHR**. So `vitalai.vercel.app` calling
`vitalai-api.onrender.com` would fail every authenticated request: sign-in
appears to succeed, then the very next call 401s and the session looks broken.

`client/vercel.json` already contains the rewrite. Same-origin also means no
CORS preflight at all.

If you ever do need split domains, the cookies must become `SameSite=None;
Secure` **and** a real CSRF token has to be added. Do not just change the flag.

## 2. Provision

1. **Atlas** — create the cluster and a database user. Under Network Access,
   allow Render's outbound IPs rather than `0.0.0.0/0`.
2. **Upstash** — create a Redis database, copy the `rediss://` URL.
3. **Pinecone** — create a serverless index: **1536 dimensions, cosine**.
4. **Resend** — verify a sending domain, create an API key. SMTP host
   `smtp.resend.com`, port `465`, user `resend`, password = the API key.
5. **Sentry** — create a Node project, copy the DSN.
6. **Gemini** — enable billing. The free tier is 20 requests/day, which one
   person exhausts in a sitting; a live demo that 429s is worse than no demo.

## 3. Secrets

```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # JWT_REFRESH_SECRET
openssl rand -hex 32   # ENCRYPTION_KEY — 64 hex chars, must differ from both
```

**Back up `ENCRYPTION_KEY` before the first deploy.** Lose it and every stored
condition, medication and allergy becomes permanently unreadable. There is no
recovery path and there is not meant to be one.

## 4. Deploy the API

Render → New → Blueprint → this repo. It reads `server/render.yaml`.

Set every `sync: false` variable in the dashboard. The URL ones, once the
Vercel domain exists:

```
APP_URL       = https://<your-vercel-domain>
API_URL       = https://<your-vercel-domain>/api    # the public path, via the proxy
CORS_ORIGINS  = https://<your-vercel-domain>        # the client's origin, not the API's
```

All three must be `https` — `config/env.ts` refuses to boot otherwise, on
purpose.

Then check:

```
curl https://<render-service>.onrender.com/health
curl https://<render-service>.onrender.com/health/ready
```

`/health/ready` checks the dependencies; that is the one to point uptime
monitoring at.

## 5. Migrate and ingest, once

Against the production database, from your machine with production values in
the environment:

```bash
cd server
MONGODB_URI="<atlas uri>" npm run migrate
MONGODB_URI="<atlas uri>" PINECONE_API_KEY="…" npm run ingest
```

Without the ingest step retrieval returns nothing and every answer is
ungrounded, which is the one failure mode this product cannot have.

## 6. Deploy the client

Vercel → Import the repo → Root Directory `client`.

Edit `client/vercel.json` first and replace `REPLACE_WITH_API_HOST` with the
Render hostname.

Environment variable:

```
VITE_API_URL = /api
```

**Relative, not absolute.** That is what routes calls through the proxy and
keeps everything same-origin. An absolute API URL here re-introduces exactly the
cross-site problem section 1 exists to avoid.

Then replace `REPLACE_WITH_YOUR_DOMAIN` in `client/index.html`,
`client/public/robots.txt` and `client/public/sitemap.xml`, and add a 1200×630
`og.png` to `client/public/`.

## 7. Verify on the deployed URL

In this order — each one catches a different class of problem:

1. **Sign up, then hard-refresh.** If you are still signed in, the cookie
   arrangement is right. This is the single most important check.
2. Complete the profile wizard including the consent step.
3. Food scan **on a real phone** — camera capture is the least-tested path and
   iOS Safari is the strictest.
4. Ask VitalBot something and confirm citations appear.
5. Add a pantry item **leaving the date blank**, then with a date.
6. Rotate through every screen at 360px looking for horizontal scroll.
7. Open devtools → Network → confirm no credential-shaped string in the bundle.

## 8. Before calling it public

- Client-side error reporting (Sentry is server-only today).
- Uptime monitoring on `/health/ready`. Render's free tier sleeps after
  inactivity, so the first request after idle takes ~30s — either accept it or
  move to a paid instance before putting the link on a CV.
- Redis response caching — the largest cost lever in the model.
- Confirm `POST /auth/register` for an already-registered address does not
  reveal that the account exists.

# Railway Deployment Guide

How FinanceFlow is built, deployed, and continuously delivered on
[Railway](https://railway.com). Railway replaces the old Google Cloud Run setup
(and, crucially, has **no IAP** in front, so the Life OS integration endpoints
at `/v1/integrations/*` are reachable with just their per-user token).

## 1. What's deployed

| Thing | Value |
|-------|-------|
| Project | `personal-finance` (`688b740a-81a3-40b6-8799-ca26aee63496`) |
| Service | `web` |
| Public URL | https://web-production-5ebee.up.railway.app |
| Region | `us-west` (sfo) |
| Build | Multi-stage `Dockerfile` (React build → FastAPI/Gunicorn) |
| Config | `railway.json` (`DOCKERFILE` builder, healthcheck `/health`) |

The single `web` service serves both the React SPA and the FastAPI API
(`api.main:app`). Railway injects `PORT`; the Dockerfile's Gunicorn binds it.

## 2. Prerequisites

```bash
# Railway CLI (no install needed if you use npx)
npx -y @railway/cli@latest --version

# Authenticate (interactive, persists to ~/.railway)
npx -y @railway/cli@latest login            # or: login --browserless (headless)

# Link this repo to the project/service
npx -y @railway/cli@latest link             # pick personal-finance → web
npx -y @railway/cli@latest status           # confirm
```

## 3. Environment variables

Set on the `web` service (Railway → service → Variables, or CLI). Required:

| Variable | Purpose | Secret? |
|----------|---------|---------|
| `SUPABASE_URL` | Supabase project URL | no |
| `SUPABASE_KEY` | Anon key. Only used if no service-role key is set, and then every endpoint returns nothing under RLS | no (public anon) |
| `SUPABASE_SERVICE_ROLE_KEY` | The key the API queries with: CRUD, statement review and the Life OS feeds. RLS is enforced and the backend has no user session, so it scopes on user_key itself | **yes** |
| `PERSONAL_API_TOKEN` | `X-Personal-Token` automation auth | **yes** |
| `PERSONAL_USER_ID` | user_key returned for the personal token | yes |

```bash
# Set one (triggers a redeploy):
npx -y @railway/cli@latest variables --service web \
  --set "SUPABASE_SERVICE_ROLE_KEY=<value>"

# List current:
npx -y @railway/cli@latest variables --service web
```

Never expose `SUPABASE_SERVICE_ROLE_KEY` or `PERSONAL_API_TOKEN` to the browser.

## 4. Manual deploy (CLI)

```bash
# Build + deploy current working tree (Railway builds the Dockerfile):
npx -y @railway/cli@latest up --service web            # follows build logs
npx -y @railway/cli@latest up --service web --detach   # fire-and-forget

# First public URL:
npx -y @railway/cli@latest domain --service web
```

`railway up` uploads the repo (respecting `.gitignore`) and builds in the cloud —
your local working tree is deployed as-is, committed or not. For reproducible
deploys, prefer the CI/CD path below (deploys exactly what's on `main`).

## 5. CI/CD — automated deploy on push to `main`

Pipeline: [`.github/workflows/ci-cd.yml`](../.github/workflows/ci-cd.yml).

```
push to dev / PR to main  ──►  backend-tests + frontend-tests        (CI gate)
push to main              ──►  tests ─► deploy to Railway            (CD)
```

- **backend-tests** — `pytest tests/test_integrations.py` (uv installs the
  locked runtime deps + pytest/httpx, mirroring the Dockerfile).
- **frontend-tests** — `npm ci`, `tsc --noEmit`, `npm test` (Vitest).
- **deploy** — runs only on a real push to `main`, only if both test jobs pass;
  `railway up --service web --ci` builds the Dockerfile on Railway and fails the
  job if the build fails.

### One-time setup: the `RAILWAY_TOKEN` secret

1. Railway → project `personal-finance` → **Settings → Tokens** → create a
   **project token** (scoped to the `production` environment). Copy it.
2. GitHub → repo → **Settings → Secrets and variables → Actions → New
   repository secret** → name `RAILWAY_TOKEN`, paste the value.

After that, deploys are automatic:

```bash
git checkout main && git merge dev && git push origin main   # → tests → deploy
```

The workflow's test jobs also run on `dev` pushes and PRs, so regressions are
caught before they reach `main`.

### Alternative: Railway-native GitHub auto-deploy (no Actions)

If you'd rather Railway watch GitHub directly (no test gate):

```bash
npx -y @railway/cli@latest service source connect \
  --repo AswinManohar/personal_finance --branch main --service web
```

Then every push to `main` auto-deploys. **Do not run both** this and the Actions
deploy job — you'd get double deploys. The Actions pipeline is preferred because
it blocks deploys on failing tests.

## 6. Rollback

```bash
# List recent deployments, then redeploy a previous good one:
npx -y @railway/cli@latest deployment list --service web
# Or in the dashboard: service → Deployments → ⋯ → Rollback.
```
Git-based: `git revert <bad-commit> && git push origin main` re-runs CI/CD.

## 7. After changing the public URL: fix Google login

Supabase OAuth redirects to its configured **Site URL**. If the Railway URL
changes (or you migrate hosts), update Supabase → **Authentication → URL
Configuration**:
- **Site URL** → the live Railway URL
- **Redirect URLs** → add `https://<url>/**` (keep `http://localhost:5173/**`)

Otherwise Google sign-in lands on the old/stale host.

## 8. Troubleshooting

| Symptom | Check |
|---------|-------|
| Build fails | Build logs (URL printed by `railway up`); `Dockerfile`, `uv.lock` in sync |
| 502 after deploy | App must bind `PORT` (Gunicorn does); check service logs |
| Healthcheck failing | `/health` must return 200; `railway.json` `healthcheckPath` |
| `/v1/integrations/*` → 500 | `SUPABASE_SERVICE_ROLE_KEY` unset, or Supabase migration not run |
| CD job fails at deploy | `RAILWAY_TOKEN` secret missing/expired, or wrong environment scope |
| Login redirects to old host | §7 — Supabase Site URL / redirect allow-list |

```bash
npx -y @railway/cli@latest logs --service web      # live logs
```

# Deployment Guide (Vercel)

This guide covers production deployment for **Kepi Travel** (`kepitravel.com`).

> **Canonical repo:** `kepi-travel` only. See `CANONICAL.md`. Do not deploy from `kepi-travel-reborn` or `kepi-travel-rebuilt`.

## 0) Ship gate (local + CI)

Before every push:

```bash
npm run verify:ship
```

GitHub Actions `.github/workflows/ci.yml` runs lint, `test:adapters`, and `npm run build` on every push/PR. Merge to `main` only when CI is green — failed Vercel builds cost credits.

## 1) Connect the repository to Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Import the **kepi-travel** GitHub repo (production domain: `kepitravel.com`).
3. Select the project root (`/`) and keep default Next.js framework detection.
4. Confirm the build settings:
   - Install command: `npm install`
   - Build command: `npm run build`
   - Dev command: `npm run dev`
5. Save and deploy.

> `vercel.json` in this repository also defines these commands for consistency.

## 2) Create and link an Upstash Redis store

1. In Vercel dashboard, open your project.
2. Go to **Storage / Marketplace** and install an **Upstash Redis** integration.
3. Create the Redis instance in the same region group as your app.
4. Connect the integration to this project.
5. Copy the generated values into project environment variables:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`

## 3) Add environment variables from `.env.example`

1. Open `.env.example` in this repository.
2. In Vercel: **Project Settings** → **Environment Variables**.
3. Add each variable name from `.env.example` for:
   - Production
   - Preview
   - Development (optional but recommended)
4. Redeploy after changes.

At runtime, `scripts/verify-env.ts` checks `.env.example` and prints clear warnings for missing values.

## 4) Configure required third-party services

### Clerk (authentication)

- Create project: [clerk.com](https://clerk.com/)
- Keys:
  - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (Frontend API key)
  - `CLERK_SECRET_KEY` (Backend API key)
- URLs (use your deployment domain):
  - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
  - `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
  - `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/travel-assistant`
  - `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/travel-assistant`

### Inngest (durable jobs and scheduling)

- Create project: [inngest.com](https://www.inngest.com/)
- Keys:
  - `INNGEST_EVENT_KEY`
  - `INNGEST_SIGNING_KEY`
- Endpoint:
  - Ensure Inngest is configured to call `https://<your-domain>/api/inngest`

### Duffel (flights + hotels)

- Sign up: [app.duffel.com](https://app.duffel.com/)
- Keys:
  - `DUFFEL_ACCESS_TOKEN` — from **Developers → Access tokens** (test tokens start with `duffel_test_`)
- **Flights** work with the token alone once the account is created.
- **Stays (hotels)** require a separate product enablement step:
  1. Log in to [Duffel Dashboard](https://app.duffel.com/)
  2. Request **Stays** access (see [Getting Started with Stays](https://duffel.com/docs/guides/getting-started-with-stays))
  3. Wait for Duffel to approve Stays on your account (403/404 on `/stays/search` means not enabled yet)
  4. Add the same token (or a new read-write token) to Vercel as `DUFFEL_ACCESS_TOKEN`
  5. Redeploy
- Until Stays is enabled, Kepi shows **estimated** hotel rates (ranked by value/points/memory) so the Hotels tab still works.
- Optional: `DUFFEL_STAYS_MODE=mock` forces estimated rates in dev.

### AviationStack (live flight status)

- Create account: [aviationstack.com](https://aviationstack.com/)
- Key:
  - `AVIATIONSTACK_API_KEY`

### Sentry (error monitoring)

- Create project: [sentry.io](https://sentry.io/)
- Keys/settings:
  - `SENTRY_DSN`
  - `NEXT_PUBLIC_SENTRY_DSN`
  - `SENTRY_ORG`
  - `SENTRY_PROJECT`

## 5) GitHub Actions deploy workflow secrets

If you use `.github/workflows/deploy.yml`, configure these repository secrets:

- `VERCEL_TOKEN` (Vercel account token)
- `VERCEL_ORG_ID` (from Vercel project settings)
- `VERCEL_PROJECT_ID` (from Vercel project settings)
- `SENTRY_DSN` or `NEXT_PUBLIC_SENTRY_DSN` (optional — CI/deploy failure alerts)

When Vercel secrets are missing, the workflow skips the deploy step with a warning instead
of failing the whole run. The workflow still runs `npm run build` first so broken code
never reaches Vercel.

## 6) Cost monitoring

- Run `npm run verify:ship` locally before push (same as CI build gate).
- Watch Vercel dashboard → Usage for build minutes and failed deploys.
- CI `ship-gate` job blocks merge when lint, tests, or build fail.
- Deploy workflow re-runs `npm run build` before `vercel --prod`.

## 7) Run Playwright E2E tests against a Preview URL

1. Open a preview deployment URL (from a PR), for example:
   - `https://kepitravel-git-<branch>-<team>.vercel.app`
2. Run locally:

```bash
PLAYWRIGHT_BASE_URL="https://kepitravel-git-<branch>-<team>.vercel.app" npm run test:e2e
```

3. If your tests require auth mocks, ensure the Preview environment includes the test-compatible Clerk values as documented in `.env.test`/`.env.example`.

## 8) Production checklist

- [ ] `npm run verify:ship`
- [ ] Vercel env vars configured
- [ ] Upstash Redis connected and keys set
- [ ] Clerk/Inngest/AviationStack/Sentry keys configured
- [ ] GitHub secrets: `VERCEL_*` + optional `SENTRY_DSN`

# Deployment Guide (Vercel)

This guide covers production deployment for the **Kepi premium adaptive travel execution app**.

## 1) Connect the repository to Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Import `jpro99/Kepi-Search`.
3. Select the project root (`/`) and keep default Next.js framework detection.
4. Confirm the build settings:
   - Install command: `npm ci`
   - Build command: `npm run build`
   - Dev command: `npm run dev`
5. Save and deploy.

> `vercel.json` in this repository also defines these commands for consistency.

## 2) Create and link a Vercel KV store

1. In Vercel dashboard, open your project.
2. Go to **Storage** → **Create Database** → **KV**.
3. Create the KV instance in the same region group as your app.
4. Click **Connect Project** and select this project.
5. Copy the generated values into project environment variables:
   - `KV_REST_API_URL`
   - `KV_REST_API_TOKEN`

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

## 6) Run Playwright E2E tests against a Preview URL

1. Open a preview deployment URL (from a PR), for example:
   - `https://kepi-search-git-<branch>-<team>.vercel.app`
2. Run locally:

```bash
PLAYWRIGHT_BASE_URL="https://kepi-search-git-<branch>-<team>.vercel.app" npm run test:e2e
```

3. If your tests require auth mocks, ensure the Preview environment includes the test-compatible Clerk values as documented in `.env.test`/`.env.example`.

## 7) Production checklist

- [ ] `npm run lint`
- [ ] `npm run test:adapters`
- [ ] `npm run build`
- [ ] Vercel env vars configured
- [ ] KV connected and keys set
- [ ] Clerk/Inngest/AviationStack/Sentry keys configured

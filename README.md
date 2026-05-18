# Kepi Travel Assistant

![CI Status](https://img.shields.io/badge/CI-pending-lightgrey?logo=githubactions)
![Vercel Deployment](https://img.shields.io/badge/Vercel-pending-lightgrey?logo=vercel)

Kepi is a **premium adaptive travel execution app** for U.S. travelers.  
It focuses on logistics and trip execution with stage-aware UX (readiness, pre-departure, airport, arrival, recovery), anti-miss safeguards, operator observability, and live update orchestration.

> Scope note: this product intentionally excludes travel insurance workflows.

## Tech stack

- Next.js 16 (App Router)
- React 19 + TypeScript
- Tailwind CSS
- Clerk (authentication)
- Vercel KV (`@vercel/kv`) for persistent state
- Inngest for durable background jobs
- Playwright + Axe for E2E and accessibility checks
- Zod for API validation
- Sentry for monitoring and error capture

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Required configuration

- Review `.env.example`
- Set at minimum the keys required for the features you are testing
- The app now performs a startup check (`scripts/verify-env.ts`) and warns for missing env vars

## Common scripts

| Script | Description |
| --- | --- |
| `npm run dev` | Start local development server |
| `npm run lint` | Run ESLint |
| `npm run test:adapters` | Run adapter/service test suite |
| `npm run test:e2e` | Run Playwright E2E tests |
| `npm run build` | Build production bundle |

## Deployment

Full production deployment instructions live in:

- [DEPLOYMENT.md](./DEPLOYMENT.md)

This includes Vercel setup, KV linking, env var provisioning, third-party account setup (Clerk, Inngest, AviationStack, Sentry), and preview E2E guidance.

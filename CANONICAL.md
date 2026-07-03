# Kepi Travel — canonical repo

**This folder (`kepi-travel`) is the single source of truth for Kepi Travel / kepitravel.com.**

| Path | Status |
|------|--------|
| `C:\Projects\Kepi Travel\kepi-travel` | **Canonical — edit here** |
| `kepi-travel-reborn` | Archive / experiment — do not ship |
| `kepi-travel-rebuilt` | Archive / experiment — do not ship |

Production: **https://kepitravel.com** (Vercel + Cloudflare DNS)

## Ship gate (every push)

```bash
npm run verify:ship
```

Runs design-law index check → `test:laws` → MapLibre worker copy → `npm run build` → `test:adapters`.

Design-law tests also run automatically via `prebuild` on every production build.

GitHub Actions `.github/workflows/ci.yml` runs the same bundle on every push/PR to `main`.

## Cost control

- Failed Vercel builds cost credits — **never push without local `npm run build`**
- CI must pass before merge to `main`
- Deploy workflow runs `npm run build` again before Vercel promote

## Vercel + GitHub

See `DEPLOYMENT.md` for env vars and secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).

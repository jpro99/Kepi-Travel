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

Runs MapLibre worker copy → `npm run build` → `npm run test:adapters`.

GitHub Actions `.github/workflows/ci.yml` runs the same build + tests on every push/PR to `main`.

## Cost control

- Failed Vercel builds cost credits — **never push without local `npm run build`**
- CI must pass before merge to `main`
- Deploy workflow runs `npm run build` again before Vercel promote

## Vercel + GitHub

See `DEPLOYMENT.md` for env vars and secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).

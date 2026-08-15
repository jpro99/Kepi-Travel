# Kepi Claude Code Base Audit — 2026-08-15

**App:** Kepi Travel (kepitravel.com)  
**Scope:** Full existing-app audit via Claude Code specialist lanes  
**Status:** Review complete. No application code changed. Waiting for Jeff to pick what to build.  
**Confidence:** High on money/security/config findings (re-read in this session). Medium on production frequency (no live Redis/Stripe/Clerk env in this cloud run).  
**Browser QA:** None — no `.env.local`, no Clerk keys, no running Next server.

Lanes run: security, UX/flow, architecture, integration, performance, browser QA (static), product improvement.

Known/accepted (not re-flagged): Duffel Stays 403, Travelpayouts Drive declined, award miles+$0 priced.

---

## Top 5 (dangerous first)

| # | ID | Severity | Title |
|---|----|----------|-------|
| 1 | SEC-1 / INT-1 | critical | Any signed-in user can self-grant Pro/Concierge via RevenueCat client sync |
| 2 | INT-2 | critical | Hotel Stripe charge happens before LiteAPI book; no refund on supplier fail |
| 3 | SEC-2 / ARCH-1 | high | `next.config.ts` is dead; production has no CSP/Sentry/PWA from that file |
| 4 | SEC-3 | high | Forwarded-email HTML rendered unsanitized on kepitravel.com |
| 5 | SEC-4 | high | Public `/api/config` returns unrestricted MapTiler server key |

---

## Findings

### SEC-1 / INT-1 — critical — Client-trusted IAP entitlements

- **Verified**
- **Files:** `src/app/api/billing/revenuecat/sync/route.ts`, `src/lib/billing/applyRevenueCatEntitlements.ts`, `src/lib/billing/revenueCatCatalog.ts`
- **Evidence:** POST body `entitlementIds` + `expirationAtMs` are written to billing state. No RevenueCat REST lookup. `"pro"` / `"concierge"` map to paid plans.
- **Impact:** `POST /api/billing/revenuecat/sync {"entitlementIds":["concierge"]}` upgrades a free Clerk user. Paid-API cost + revenue loss.
- **Fix:** Ignore client entitlements. Server-call RevenueCat `GET /v1/subscribers/{app_user_id}` with a secret key, or delete the route and rely on the (already fail-closed) webhook. If secret missing → 503, not grant.
- **Validation:** Free test account POST fake entitlements → plan stays `free`. Unit test: `applyRevenueCatEntitlements` never called with unverified client ids.

### INT-2 — critical — Hotel pay-then-book with no refund

- **Verified**
- **Files:** `src/lib/hotels/fulfillHotelBooking.ts`, `src/app/api/billing/webhook/route.ts`, `src/app/api/hotels/checkout/session/route.ts`
- **Evidence:** Sets `status: "paid"`, then `bookLiteApiPrebook`. On throw, webhook 500s and Stripe retries the same expired prebook. No `refunds.create`, no `status: "failed"` write, no sweep.
- **Impact:** Guest charged, no room, no notice.
- **Fix:** Catch supplier failure → mark failed → Stripe refund → email Jeff + guest → return 200 to Stripe. Add Inngest sweep for `paid` older than ~15 min. Prefer Stripe `manual` capture after supplier confirm.
- **Validation:** Sandbox stale prebook → refund exists, pending `status: "failed"`.

### SEC-2 / ARCH-1 — high — Active Next config is the stub

- **Verified** (Next 14 `CONFIG_FILES` = `next.config.js` then `.mjs`; `.ts` never loads)
- **Files:** `next.config.js` (live), `next.config.ts` (ignored)
- **Evidence:** Live file is 20 lines: `ignoreBuildErrors` + Unsplash images. CSP, Sentry wrapper, PWA, `headers()` live only in the unused `.ts` file.
- **Impact:** No CSP / frame-deny / nosniff in production. Sentry webpack plugin never wraps. Agents editing `.ts` think headers shipped.
- **Fix:** Port Next-14-safe bits into `next.config.mjs` (or `.js`). Delete `.ts`. Do not copy `reactCompiler` / `serverExternalPackages` verbatim (Next 15+ keys).
- **Validation:** `node -e` loadConfig → `headers` is a function. `curl -sI https://kepitravel.com/ | grep -i content-security-policy`

### SEC-3 — high — Stored XSS on source-email view

- **Verified** sink; delivery via attacker-controlled forward is likely
- **Files:** `src/app/api/reservations/source-view/route.ts`
- **Evidence:** `htmlBody` injected raw into same-origin HTML. Text fallback is escaped. No sanitizer in repo. No CSP (SEC-2).
- **Impact:** Script on kepitravel.com with victim Clerk session → trips, documents, family GPS, account delete.
- **Fix:** Always render escaped text, or sandbox iframe without `allow-scripts`/`allow-same-origin`. Per-response CSP `sandbox; default-src 'none'`.
- **Validation:** Forward HTML with `onerror` handler; view original email; no script runs.

### SEC-4 — high — MapTiler server key on a public route

- **Verified**
- **Files:** `src/app/api/config/route.ts`, `src/middleware.ts` (`/api/config(.*)` is public)
- **Evidence:** Prefers `MAPTILER_KEY` (unrestricted) over `NEXT_PUBLIC_*`. Contradicts `/api/maptiles` comment that the key never leaves the server.
- **Impact:** Anonymous `curl /api/config` → billed tile/geocode abuse.
- **Fix:** Stop returning a key. Use `/api/maptiles` only. Rotate the leaked key.
- **Validation:** `curl -s https://kepitravel.com/api/config` has no key; maps still render.

### INT-3 — high — Stripe webhook misses renewals; lifetime wipe on cancel

- **Verified**
- **Files:** `src/app/api/billing/webhook/route.ts`, `src/lib/billing/subscriptionStore.ts`
- **Evidence:** Only `checkout.session.completed` and `customer.subscription.deleted`. `validUntil: null` + `isSubscriptionActive` treats null expiry as active. `handleSubscriptionDeleted` sets `lifetimePlan: false`.
- **Impact:** Failed card can keep Pro forever (if Stripe marks unpaid instead of cancel). Lifetime invite lost if a Stripe sub is later deleted.
- **Fix:** Handle `customer.subscription.updated` / `invoice.payment_failed`. Set `validUntil` from `current_period_end`. Preserve `lifetimePlan` on delete.
- **Validation:** Test card `4000000000000341` → plan free. Grant lifetime, cancel Stripe → `lifetimePlan` still true.

### INT-4 — high — Native iOS push is a dead end that overwrites web push

- **Verified**
- **Files:** `src/lib/travelAssistant/pushNotificationService.ts`, `src/lib/travelAssistant/flightStatusPushBridge.ts`
- **Evidence:** Native token path logs and returns false (no APNS). Same `push-sub` key overwrites a working web subscription.
- **Impact:** TestFlight “alerts on” = zero delivery. Enabling native kills web alerts.
- **Fix:** Separate keys; return `deliverable: false` for native; copy “not delivered in the iOS app yet.” APNS later.
- **Validation:** Native register + gate change → explicit skip reason; web sub still present.

### SEC-5 — high — Middleware fails open without Clerk env

- **Verified** code path; production trigger is env-dependent (hypothesis)
- **Files:** `src/middleware.ts`
- **Evidence:** `clerkEnvReady()` false → `NextResponse.next()` with only a console.error.
- **Impact:** Missing/mistyped Clerk keys make the app public for routes that only trust middleware.
- **Fix:** Production → 503. Keep fail-open only in non-prod.
- **Validation:** Unset Clerk keys locally; `/travel-assistant` and `/api/trips` blocked.

### ARCH-2 — high — Typecheck is non-blocking; 193 errors on main

- **Verified** by architecture lane (`tsc --noEmit` exit 2)
- **Files:** `next.config.js`, `.github/workflows/ci.yml` (`continue-on-error: true`; ship-gate `needs: [test, build]` only)
- **Impact:** Same class as the `onCreateTrip is not defined` prod crash. New errors hide in the pile.
- **Fix:** Snapshot baseline; fail CI if count rises; add typecheck to ship-gate after baseline is green. Fix `scannedReservationDraft.ts` now (broken type name).
- **Validation:** `npx tsc --noEmit 2>&1 | grep -cE "error TS"` vs baseline.

### PERF-1 — high — MapLibre statically imported into travel-assistant

- **Verified** import chain
- **Files:** `src/app/travel-assistant/page.tsx` → `BookTabView` → `FlightsTab` → `TripTransportRouteMap` → `maplibre-gl`
- **Impact:** ~948 KB parse on every `/travel-assistant` visit, including users who never open a map.
- **Fix:** `next/dynamic` + `ssr: false` on `FlightsTab` / `TripTransportRouteMap`.
- **Validation:** `ANALYZE=true npm run build` — MapLibre only in a split chunk.

### INT-6 / ARCH-7 — high — kvStore memory fallback looks like success; Sentry never inits

- **Verified** mechanism
- **Files:** `src/lib/travelAssistant/kvStore.ts`, `src/lib/redis.ts`, missing `src/instrumentation.ts`
- **Impact:** Redis blip → 200 + data vanishes on next lambda. No Sentry because `withSentryConfig` is in dead `next.config.ts` and SDK 10 needs `instrumentation.ts`.
- **Fix:** Production: rethrow on Redis write failure for billing/hotel/trip. Add instrumentation after config port.
- **Validation:** Bad Redis URL → hotel fulfill 5xx, not 200.

### SEC-7 / INT-5 — medium — Email webhook logs the ingest secret and raw bodies

- **Verified**
- **Files:** `src/app/api/email-forward/receive/route.ts`, `src/lib/logger.ts`
- **Fix:** Log `hasSecret` / length only. Rotate `EMAIL_FORWARD_INGEST_SECRET`.
- **Validation:** Bad-secret request logs contain no secret value.

### SEC-8 — medium — `/api/debug/trace` writes arbitrary Redis list keys

- **Verified**
- **Files:** `src/app/api/debug/trace/route.ts`
- **Fix:** `requireDebugApiAccess`, prefix `kepi:trace:`, TTL, rate limit.

### SEC-9 — medium — Unsubscribe IDOR + signed-out links fail

- **Verified**
- **Files:** `src/app/api/email/unsubscribe/route.ts`
- **Fix:** HMAC token (see `nativeLocationToken.ts`). Session path uses session userId only.

### INT-7 — medium — Flight-status client cadence ignores timezone; Inngest is 10 min not 2

- **Verified**
- **Files:** `src/app/travel-assistant/page.tsx`, `src/lib/travelAssistant/flightStatusCadence.ts`, `src/inngest/functions/flightStatusSweep.ts`
- **Fix:** Share `parseDepartureUtcMs`. Stable effect deps. Align cron or delete the unused 2-min constant.

### INT-9 — medium — Lifetime invite auto-completes onboarding (skips push + forward address)

- **Verified**
- **Files:** `src/app/api/travel-updates/onboarding/route.ts`
- **Fix:** Do not treat “has paid access” as “finished setup.” Keep notify + forward steps.

### UX-1 / UX-2 — high (trust) — Repair drawer uses ISO format; review badge shows raw ML score

- **Verified**
- **Files:** `src/app/travel-assistant/page.tsx`, `src/components/travelAssistant/ReviewQueue.tsx`
- **Fix:** `datetime-local` + plain copy. Drop `(55)` from badge.

### ARCH-3 — high (footgun) — Two exports named `getAirportLayout`

- **Verified**
- **Files:** `src/lib/airportNav/getLayout.ts` (live 2D), `src/lib/airportNav/layouts/index.ts` (legacy SEA 3D)
- **Fix:** Rename legacy to `getSeaTerminal3DModel`. Do not rebuild 3D registry.

### ARCH-6 — medium — 74 of 245 test files never run in CI

- **Verified** by architecture lane
- **Fix:** Glob `src/**/*.test.ts`; triage first-run failures. Do not silently re-exclude.

### QA-2 — high (CI noise) — Specs assert “Hello Travel Assistant” / “Hello Workspace”

- **Verified** statically
- **Files:** `app-sitter/simple-travel-assistant.spec.ts`, `app-sitter/simple-workspace.spec.ts`
- **Fix:** Delete or retarget. `/workspace` redirects to `/travel-assistant`.

---

## Product improvements (after hardening)

Ranked for a couple ~3 weeks from Europe travel. **IMP-4 ETIAS was rejected.** Official EU site (travel-europe.europa.eu/etias, 2026-08-15): “ETIAS is currently not in operation and no applications are collected.” Do not add a required ETIAS prep item.

| # | ID | Item | Size | Owner |
|---|----|------|------|-------|
| 1 | IMP-5 | Shared trip view → Picasso light theme | small | conductor |
| 2 | IMP-2 | Share-link live flight status card | medium | flight |
| 3 | IMP-6 | Arrival-day “getting to hotel” card even when gap suppressed (BRI→Monopoli) | medium | conductor |
| 4 | IMP-1 | Transport route sheet from Home (no Plan tab hop) | medium | conductor |
| 5 | IMP-3 | Share-token web-push opt-in for wife | medium | flight |
| 6 | UX-2 / UX-1 | Hide ML score; human repair fields | small | conductor |

---

## Quick wins (small, high leverage)

1. SEC-1 — stop trusting client entitlements (or 503 if no RC secret)
2. SEC-4 — stop returning MapTiler key from `/api/config`
3. SEC-5 — production fail-closed on missing Clerk env
4. SEC-7 — stop logging ingest secret; rotate
5. UX-2 — remove confidence number from ReviewQueue badge
6. PERF-1 — dynamic-import MapLibre
7. QA-2 — delete/fix always-fail Playwright specs

---

## Do not build now (needs sign-off or frozen)

- Airport map expansion / new IATA layouts (travel-day measurement still the product gate)
- Confirmations already on the Europe trip
- Duffel Stays enablement (Jeff already emailed)
- Travelpayouts Drive
- Native APNS bridge (honest copy first)
- ETIAS as a required prep item (not in operation)
- Rewriting `travel-assistant/page.tsx` (11k lines) — extract fetches only if Jeff picks it
- next-auth removal (SEC-6) — Clerk is real auth; cleanup after money/XSS

---

## Checks run

| Check | Result |
|-------|--------|
| Specialist lanes | 7 completed, read-only |
| Re-read SEC-1, SEC-2, SEC-3, SEC-4, INT-2, middleware | Confirmed |
| ETIAS official status | Not in operation (EU site) |
| Browser / Playwright | Blocked — no Clerk env, no Next server |
| `npm run lint` / `build` / `test` | Not run (docs-only change) |
| Production live probes | Not run from this environment |

---

## Open questions

- Stripe dunning: cancel vs mark unpaid (sizes INT-3)
- Production Redis error rate (sizes INT-6)
- Count of lifetime users with no `push-sub` (sizes INT-9)
- Whether a Vercel dashboard CSP exists outside the repo (ARCH-1)
- Was `next.config.ts` written during a Next 15/16 attempt?

---

## Next execution plan (Jeff picks)

Say **build #N** (or “build SEC-1 and INT-2”).

1. **Money lock:** SEC-1 + INT-2 + INT-3  
2. **XSS / headers:** SEC-2 then SEC-3; SEC-4 + rotate MapTiler  
3. **Fail-closed:** SEC-5, SEC-7+rotate, SEC-8, INT-6 production rethrow  
4. **Travel-day honesty:** INT-4 native push copy, INT-7 cadence, IMP-6 arrival card  
5. **Wife share:** IMP-5 then IMP-2  
6. **Platform:** ARCH-2 typecheck baseline, PERF-1 MapLibre split, QA-2 dead specs  

Commands after any code batch:

```bash
npm run lint
npx tsc --noEmit
npm run test:laws
npm run build
```

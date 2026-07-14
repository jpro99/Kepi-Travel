You are integrating a new external data provider into Kepi Travel. Standing rules apply: read
`CLAUDE.md` / `AGENTS.md` / `KEPI_DESIGN_LAW.md` first, diagnose before editing, minimal surgical
changes over rewrites, add a design law + test per behavior change, `npm run test:laws && npm run
build` before push, push directly to `main`.

## Why this exists

Owner wants estimated security checkpoint wait times shown somewhere in Kepi (e.g. the pre-security
day-of briefing / journey timeline) — not scraped from any single airport's own vendor-powered map
(Atrius/flysea.org, out of scope and explicitly not to be touched), but from a real, licensable
third-party API built for exactly this purpose: **TSAWaitTimes.com** (operated by TayTech, LLC; not
affiliated with the actual TSA).

**This is not a free service — confirm the owner has accepted the cost before shipping anything that
calls the paid endpoint in production.** Pricing (checked 2026-07): $49.95/month self-serve, with
discounts at 3/6/12-month terms, and a free 7-day trial to build and test against. Build and test
against the free trial first; do not assume the owner has already purchased a subscription.

## What the API actually provides (confirmed from https://www.tsawaittimes.com/api)

- `GET /api/airports/{APIKEY}/{FORMAT}` — list of supported airports (code, name, city, state, lat/
  lng, precheck flag).
- `GET /api/checkpoints/{APIKEY}/{FORMAT}` — checkpoints per airport per terminal (note: many
  airports only have a single generic "Main Checkpoint" — don't assume every airport has SEA-style
  named multi-checkpoint detail).
- `GET /api/airport/{APIKEY}/{CODE}/{FORMAT}` — the actual status payload: `rightnow` (estimated
  wait in whole minutes) + `rightnow_description` (human string), `user_reported`, `precheck`,
  `faa_alerts` (ground stops/delays), and `estimated_hourly_times` (24 hourly buckets, decimal
  minutes) for a typical-day histogram.
- `POST /api/reporttime/{APIKEY}/{FORMAT}` — lets end users submit their own wait time back to
  TSAWaitTimes.com. **Out of scope for this pass** — don't wire this in without a separate,
  explicit decision; it means Kepi would be feeding data back to a third party.
- **By design, this only returns one wait-time estimate per airport, not per individual checkpoint**
  (confirmed in their FAQ — they tested this and found users didn't want per-line granularity). Do
  not build UI that promises per-checkpoint live wait times; it will not be accurate to what the API
  actually returns, even though the checkpoints endpoint lists checkpoint names.
- The data itself is explicitly described by the provider as an estimate ("may not be indicative of
  a traveler's experience") blending TSA/FAA data, historical patterns, and user reports — not a
  live sensor count. Any UI copy must reflect that honestly (e.g. "Estimated wait: ~15 min" not
  "Current wait: 15 min").
- **Server-side only.** The provider's own docs warn against calling this from client-side JS — the
  API key would be exposed via the browser and there's a CORS block by design. All calls must be
  proxied through a Kepi API route, same as every other external provider in this codebase.
- **Cache locally.** The provider explicitly asks integrators to cache results rather than call on
  every page load — align with whatever TTL/caching pattern the existing providers already use.

## What exists today (read these first, reuse the pattern, don't invent a new one)

- `src/lib/travelAssistant/railStatusProvider.ts` — the closest existing analog: a Zod schema
  (`RailStatusSchema`) validating the third-party response shape, an env-var API key
  (`process.env.AMTRAK_API_KEY`), shared helpers from `providers/providerUtils.ts`
  (`createTimeoutSignal`, `normalizeLocationToken`, etc.), and a `createMockTravelUpdateProvider`
  fallback for when the key/service isn't available. Follow this exact shape for a new
  `tsaWaitTimeProvider.ts` — new file, don't touch `railStatusProvider.ts`.
- `src/lib/travelAssistant/providers/providerMappings.test.ts` — wherever providers are registered/
  mapped, add the new one following the existing registration pattern.
- `src/lib/airportNav/postBookingBriefing.ts` — `buildPostBookingBriefing()` is the existing
  pre-security day-of briefing content builder; this is the natural place to surface the estimated
  wait time, not a new screen. Read it fully before deciding exactly where the field goes.
- Env var convention: add `TSA_WAIT_TIMES_API_KEY` (or similar) to whatever `.env.example` pattern
  already documents `AMTRAK_API_KEY` and other provider keys.
- Redis/caching: this repo checks both `UPSTASH_REDIS_*` and `KV_REST_API_*` env var families
  elsewhere — check how existing providers cache (if they do) before adding a new caching layer.

## What to build

1. New `src/lib/airportNav/tsaWaitTimeProvider.ts` (or `travelAssistant/`, match whichever existing
   providers live in — check both): fetch `GET /api/airport/{APIKEY}/{CODE}/json`, validate with a
   Zod schema matching the real response shape above, map to a small internal type (e.g.
   `{ estimatedWaitMinutes: number, description: string, hasPrecheck: boolean, asOf: string }`).
   Handle missing/unsupported airport codes gracefully (not every airport is covered — confirm via
   the `/airports` list endpoint, don't assume universal coverage).
2. Server-side API route to proxy this (never expose the key client-side) — follow the existing
   route pattern used for other provider calls.
3. Caching with a sensible TTL (wait estimates don't need per-second freshness) — reuse whatever
   pattern existing providers use rather than inventing new infra.
4. Wire the result into `buildPostBookingBriefing()` (or wherever it's determined this belongs
   after reading that file) with honest "estimated" framing, and a graceful "not available" state
   when the airport isn't covered or the call fails — never fabricate a number.
5. Mock/fallback provider for local dev and the free-trial-not-yet-configured case, mirroring
   `createMockTravelUpdateProvider`.
6. Attribution: since this data isn't Kepi's own, credit "Wait time estimates via TSAWaitTimes.com"
   somewhere near the display, consistent with how other third-party data sources are credited
   elsewhere in the app (e.g. OSM attribution).

## What NOT to do

- Do not call this API from client-side code — server route only.
- Do not build per-individual-checkpoint live wait UI — the API only returns one number per airport.
- Do not wire the `reporttime` POST endpoint (sending Kepi user data back to TayTech) without a
  separate, explicit decision from the owner.
- Do not hardcode the API key — env var only, never committed.
- Do not silently fall back to a fake/estimated number if the call fails — show "not available,"
  consistent with the rest of this repo's no-fabrication rule (design law D13).

## Execution order (verify between steps)

1. Confirm the owner has (or is willing to start) a TSAWaitTimes.com account/trial key before
   writing code that depends on one; use the mock provider for everything until a real key exists.
2. Read `railStatusProvider.ts`, `providerUtils.ts`, and `postBookingBriefing.ts` in full; summarize
   the exact integration point in plain English before writing code.
3. Build `tsaWaitTimeProvider.ts` + Zod schema + mock fallback.
4. Build the server-side proxy route + caching.
5. Wire into `postBookingBriefing.ts` with honest copy and a graceful unavailable state.
6. Add tests: schema validation, unsupported-airport handling, cache behavior, mock fallback, and
   the "never fabricate on failure" case.
7. Add a design law entry noting this data source is a third-party estimate (not live sensor data,
   not per-checkpoint) and must be labeled as such in UI. Add the test file to the test index.
8. Run `npm run test:laws && npm run build` and confirm passing before push.

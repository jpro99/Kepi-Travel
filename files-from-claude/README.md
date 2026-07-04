# Kepi Fused Flight Search — Award + Cash Intelligence

Drop-in modules that take Kepi's flight search from **C+ to A-** by adding the
one thing no competitor fuses with a live booking engine: **real award
availability + your actual points balances + a cash-vs-points verdict**, all in
one ranked result.

## What's included

| File | Does |
|---|---|
| `src/lib/flights/types.ts` | Shared types (cash + award offers, fused result) |
| `src/lib/flights/cppValuations.ts` | Point valuations, CPP calc, cash-vs-points decision |
| `src/lib/flights/transferPartners.ts` | Transfer-partner map + reachability resolver |
| `src/lib/flights/loyaltyBalances.ts` | Per-user balance storage (your Redis pattern) |
| `src/lib/flights/seatsAero.ts` | Seats.aero award availability client |
| `src/lib/flights/fusedFlightSearch.ts` | Orchestrator that fuses + ranks + explains |
| `src/app/api/flights/award-search/route.ts` | POST endpoint |

Already passes `npx tsc --noEmit` in isolation.

## Two things YOU must wire (they touch your existing code, so I didn't guess)

1. **Cash adapter** — create `src/lib/flights/duffelAdapter.ts` exporting
   `fetchDuffelCashOffers(params)` that calls your **existing** Command Deck
   Duffel logic and maps each Duffel offer to the `CashOffer` shape in
   `types.ts`. Don't re-implement Duffel — wrap what you have.

2. **Verify Seats.aero schema** — confirm the base URL, auth header name, and
   response field names in `seatsAero.ts` against current docs
   (https://seats.aero/api). The normalizer is defensive (bad field => skip
   record, not crash), but field names drift.

## Env vars to add in Vercel
```
SEATS_AERO_API_KEY=...
```
Without it, award search silently returns nothing and cash search still works.

## Optional upgrades (the Points-Path-style edge)
- Populate `flights:cpp_valuations` in Redis from a daily job that computes
  median point values from your own Duffel data → dynamic, self-tuning CPP.
- Populate `flights:transfer_bonuses` (key `"chase_ur->united": 30`) when banks
  run bonuses → reachability auto-accounts for them.

## Not built yet (deliberate)
- **Alert engine** (price drop / award-space-opened) — needs Inngest/cron.
- **Hidden-city ("Skiplagged") routing** — left out on purpose: it violates
  airline contracts of carriage and can get accounts/miles cancelled. Add only
  with a clear user warning if you decide to.

---

## Paste this into Cursor (mobile or desktop) as your SESSION MISSION

```
[SESSION MISSION]

What I want done today:
- Integrate the fused award+cash flight search module (files under
  src/lib/flights/ and src/app/api/flights/award-search/).

Steps:
1. Read AGENTS.md, CLAUDE.md, ENGINEERING_NOTES.md first.
2. Confirm src/lib/redis.ts exports kvStoreGet and kvStoreSet with the exact
   names used in the new files. If different, fix the imports — do not change
   redis.ts.
3. Create src/lib/flights/duffelAdapter.ts exporting fetchDuffelCashOffers().
   Reuse the EXISTING Command Deck Duffel search — do not re-implement it. Map
   each Duffel offer to the CashOffer shape in types.ts.
4. Verify seatsAero.ts against current Seats.aero Partner API docs (base URL,
   auth header, response fields). Fix any drift.
5. Add SEATS_AERO_API_KEY to Vercel env.
6. Run npx tsc --noEmit on every edited file. Then build in /tmp/kepi-build per
   RULE ZERO. Do not push until build passes.
7. Add one console.log in the route handler that prints offer counts
   (cash vs award) and the headline, so we can confirm end-to-end in logs.

Done = a real POST to /api/flights/award-search returns fused results AND the
console.log proves both sources ran. Build passing is NOT done.

What must not change:
- redis.ts interface, Clerk auth/middleware, journeyPhase, the 5-tab nav.
```

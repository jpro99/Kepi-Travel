KEPI FUSED FLIGHT SEARCH - CURSOR INSTRUCTIONS (v2, A++ core)
============================================================

Plain text. Paste this whole file into Cursor as your first message AFTER
unzipping the v2 code files into the repo.

WHAT CHANGED IN v2
------------------
Drop-in replacements that fix two real bugs and add the A++ core:
  - Passenger-aware comparison: award miles are per-person, Duffel totals are
    all-passenger. v1 compared them wrong for 2+ travelers. Fixed.
  - Cabin-matched comparison: awards are now only benchmarked against same-cabin
    cash fares (no more business-award-vs-economy-cash nonsense). Fixed.
  - Read-through Redis cache (flightCache.ts): caches Duffel (3 min) and
    Seats.aero (30 min). Cuts API cost and latency hard. This is also the most
    likely fix for any timeout/retry loop on heavy searches.
  - Composite scoring (scoring.ts): ranks by value + convenience (stops,
    duration) + reachability + quality, not just price.
  - meta block in the result (cashCount, awardCount, cashCached, awardCached,
    elapsedMs) for end-to-end log proof.

FILES (all pass npx tsc --noEmit clean)
---------------------------------------
  src/lib/flights/types.ts             (replace)
  src/lib/flights/cppValuations.ts     (replace)
  src/lib/flights/fusedFlightSearch.ts (replace)
  src/lib/flights/scoring.ts           (new)
  src/lib/flights/flightCache.ts       (new)
  src/lib/flights/seatsAero.ts         (unchanged from v1)
  src/lib/flights/transferPartners.ts  (unchanged from v1)
  src/lib/flights/loyaltyBalances.ts   (unchanged from v1)
  src/app/api/flights/award-search/route.ts (unchanged from v1)

SESSION MISSION
---------------
1. Read AGENTS.md, CLAUDE.md, ENGINEERING_NOTES.md first. Production app.
2. Replace the v1 files listed above with these v2 versions. Add the two new
   files (scoring.ts, flightCache.ts).
3. Confirm src/lib/redis.ts exports kvStoreGet and kvStoreSet with those exact
   names. If different, fix the imports in flightCache.ts, cppValuations.ts,
   loyaltyBalances.ts, transferPartners.ts. Do NOT change redis.ts.
4. Create src/lib/flights/duffelAdapter.ts exporting fetchDuffelCashOffers().
   Reuse the EXISTING Command Deck Duffel search. Map each Duffel offer to the
   CashOffer shape in types.ts, including segments with real departingAt /
   arrivingAt so duration scoring works.
5. Add SEATS_AERO_API_KEY to Vercel env.
6. In the route handler, log result.meta (counts, cache flags, elapsedMs) and
   result.headline. This proves the full flow ran and shows cache behavior.
7. Run npx tsc --noEmit on every edited file, then build in /tmp/kepi-build per
   RULE ZERO. Do NOT push until build passes.

SEPARATE ISSUE - THE ANALYZE LOOP
---------------------------------
The "Analyze stopped before it could finish / fast strategy path" loop is NOT in
these files - it is existing Kepi code. After wiring v2, if the loop persists:
  - Search the repo for "fast strategy" and "stopped before".
  - Check the Vercel function maxDuration on the Analyze route.
  - Confirm the fallback/retry has a max-retry limit and is not re-calling the
    same failing path forever.
  - Reproduce once with logging and read the Vercel function log BEFORE editing.

DEFINITION OF DONE
------------------
A real POST to /api/flights/award-search returns scored, ranked results AND the
log shows result.meta with both counts. Build passing alone is NOT done.

MUST NOT CHANGE
---------------
redis.ts interface, Clerk auth/middleware, journeyPhase, the 5-tab nav.

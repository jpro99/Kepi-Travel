You are fixing a confirmed, verified data bug in Kepi Travel's SEA airport layout. Standing rules
apply: read `CLAUDE.md` / `AGENTS.md` / `KEPI_DESIGN_LAW.md` first, minimal surgical changes over
rewrites, add a design law + test for this fix, `npm run test:laws && npm run build` before push,
push directly to `main`.

## Confirmed root cause — verified by point-in-polygon test, not a guess

`src/lib/airportNav/layouts/sea.ts` hand-authors ticketing/security node coordinates as raw
`[lng, lat]` pairs (the `NODES` array, ~line 45 onward). These are meant to sit inside the real
terminal building shape now imported from OpenStreetMap (`SEA_OSM_FOOTPRINTS.mainTerminal` in
`seaFootprints.ts`). They were placed by eyeballing/estimating, never checked against the actual
polygon.

I ran an actual point-in-polygon test (ray-casting) of every landside node against
`SEA_OSM_FOOTPRINTS.mainTerminal`:

- `checkin-south` (-122.30055, 47.44250) → **inside** (serves Alaska — `poi-checkin-as`)
- `checkin-center` (-122.30075, 47.44335) → **OUTSIDE** (serves Delta + United —
  `poi-checkin-dl`, `poi-checkin-ua`)
- `checkin-north` (-122.30095, 47.44435) → **OUTSIDE** (serves Air Canada + Emirates —
  `poi-checkin-ac`, `poi-checkin-ek`)
- `sec3-entry`, `sec3-exit`, `sec5-entry`, `sec5-exit` → tested inside, but treat this as
  unconfirmed — see caveat below.

This is the live-map bug the owner reported: Delta/United/Air Canada/Emirates check-in counters
render at real coordinates outside the actual terminal building — visually landing in/near the
parking structure to the east — and don't appear when zoomed into the terminal because they are
not actually there. `AirportNavigatorMap.tsx` places these markers directly via `.setLngLat(pos)`
with no separate projection (confirmed ~line 1893) — the raw node coordinate *is* the real-world
marker position on the live MapLibre map. There is no rendering/projection bug to chase; the
coordinates themselves are wrong.

**Caveat — don't trust a naive point-in-polygon test on this ring without double-checking.**
`mainTerminal`'s ring is a single Douglas-Peucker-simplified loop standing in for a building whose
own file comment says concourses "radiate" from the core — i.e. a genuinely non-convex, possibly
self-intersecting shape near its notches. A simple ray-cast can give a false "inside" near those
notches. Do not assume `sec3-entry`/`sec5-entry` etc. are actually correct just because a basic
test passed — re-verify all seven landside nodes, not just the two confirmed-broken ones.

## What NOT to do

- Do not "fix" this by moving the parking structure or changing the basemap — the parking garage
  is real, it belongs where it is; the bug is Kepi's own node coordinates.
- Do not touch `poiDetail.ts` or the Duffel logo wiring — that part (blessed Duffel CDN logos keyed
  by IATA code, graceful fallback to a text chip, CSP already permitting `assets.duffel.com`) is
  already correctly built and is not part of this bug. Don't rewrite working code while in here.
- Do not hand-adjust coordinates by eyeballing a screenshot again — that's exactly how this bug was
  created. Every fix must be verified programmatically against the real polygon.

## What to build

1. Use `@turf/turf`'s `booleanPointInPolygon` (already a dependency — see `package.json`) instead of
   a hand-rolled ray-cast, since it correctly handles non-convex/complex real-world polygons that a
   naive implementation can get wrong near notches.
2. Re-derive `checkin-center` and `checkin-north` (and re-verify every other landside node —
   `checkin-south`, `sec3-entry`, `sec3-exit`, `sec5-entry`, `sec5-exit`, `curb-departures`,
   `landside-hall`) to real coordinates that are genuinely inside `SEA_OSM_FOOTPRINTS.mainTerminal`.
   Pick real interior points near where those airlines' actual ticketing counters are (cross-check
   against openstreetmap.org zoomed into SEA's ticketing hall, same spot-check method already used
   elsewhere in this repo), not an arbitrary centroid.
3. **Add a regression test that would have caught this originally:** for every node in
   `sea.ts`'s `NODES` whose `kind` is `checkin`, `security_entry`, or `security_exit`, assert via
   `booleanPointInPolygon` that it falls inside the zone polygon it's supposed to belong to
   (`z-main` for landside/most airside nodes here — confirm against `airside`/zone assignment
   logic in `types.ts` first). This test must fail loudly if a future edit ever reintroduces a node
   outside its building.
4. Confirm visually after the fix: zoom into the terminal on the live map and verify Alaska, Delta,
   United, Air Canada, and Emirates check-in all render inside the terminal shape, not near/inside
   the parking structure.

## Execution order (verify between steps)

1. Read `sea.ts`, `seaFootprints.ts`, `types.ts` (zone/node/POI shapes), and the marker-rendering
   block in `AirportNavigatorMap.tsx` (~line 1885-1913) to confirm the exact same understanding
   above before changing anything.
2. Write the `booleanPointInPolygon` verification as a standalone test first (red — it should fail
   on the current, broken coordinates), confirming the bug reproduces on command.
3. Fix the coordinates for `checkin-center` and `checkin-north`, and re-verify the other five
   landside nodes the same way even though they passed the naive test.
4. Confirm the new test goes green.
5. Add a design law in `KEPI_DESIGN_LAW.md`: every curated checkin/security node coordinate must be
   verified inside its assigned real building polygon via `booleanPointInPolygon` before merge — no
   hand-placed coordinate ships unverified again. Add the test file to the test index.
6. Run `npm run test:laws && npm run build`, and do one final visual check on the live map at SEA
   before calling this done.

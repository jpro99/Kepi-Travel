You are populating ALL SEA ticketing-hall doors and airlines onto Kepi's map in one pass, using
curve-calibrated estimation anchored to real OSM ground truth — not one-by-one manual placement.
Standing rules apply: read `CLAUDE.md` / `AGENTS.md` / `KEPI_DESIGN_LAW.md` first, minimal surgical
changes, add a design law + test, `npm run test:laws && npm run build` before push.

## The technique — why this is legitimate, not a guess

We have 5 real, OSM-verified door coordinates along SEA's ticketing hall facade (survey-grade,
pulled via Overpass, confirmed accurate):

| Door | lat | lng |
|---|---|---|
| 4 | 47.442272 | -122.300184 |
| 12 | 47.443169 | -122.301487 |
| 14 | 47.443522 | -122.301777 |
| 22 | 47.444474 | -122.300868 |
| 24 | 47.444651 | -122.300607 |

These 5 points trace a real curve (the ticketing hall follows a sweeping curved building face —
this matches the curve already visible in `seaFootprints.ts`'s `mainTerminal` ring, and in
`Departures Drive`/`Arrivals Drive` on the live basemap). This is a **georeferencing-by-control-
points** technique: fit a curve (spline or piecewise-linear, whichever is simpler and accurate
enough) through these 5 known real points, then interpolate the position of every other door
(1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13, 15, 16, 17, 18, 19, 20, 21, 23, 25, 26, 27, 28, 29 — the public
SEA ticketing map shows doors running roughly 1 through 29) along that same real curve, ordered by
door number. This produces a genuine calibrated estimate for every door's real position — not a
screenshot guess — because it's anchored to 5 real survey points, the same way real-world
cartography extends known survey points into a full map.

**Label honestly.** Interpolated door positions are `precisionGrade: "schematic"` (estimated,
calibrated), not `"surveyed"` like the 5 anchor doors themselves. Don't blur this distinction in the
data or the UI.

## Airline → door assignment (source: public SEA ticketing map, a physical fact, freely usable —
not copying Atrius's proprietary data, just referencing which airline sits at which door number,
same as reading a directory)

Reconstruct the full door → airline mapping from the airport's own public ticketing-level signage/
map (the reference screenshots already reviewed this session show this level of detail — airline
names posted at specific door numbers along this hall). Known anchors from this session's review
include (verify/complete the full list from the reference source, don't assume this is exhaustive):

- Alaska — north end of the hall (near Door 24/29 area — already corrected this session; do not
  re-flip it back).
- Delta, Air France, Aeromexico, WestJet — clustered near Door 13/15.
- Icelandair — Door 17.
- Southwest — near Door 17/19 (SEA Spot Saver / Checkpoint 4 area).
- Frontier, Sun Country, American — near Door 23/25.
- United, Emirates, Air Canada, STARLUX, JetBlue — clustered near Door 7.
- British Airways, Aer Lingus, Lufthansa, ANA, Hainan Airlines — near Door 5.
- Finnair, Turkish Airlines, Asiana, Philippine Airlines — near Door 3/5.
- SAS — near Door 13 (north cluster, separate from the Delta/AF/AM/WS cluster — verify exact door).

Verify each of these against the actual reference map rather than trusting this list blindly — this
session's screenshots may not have captured every door/airline pairing precisely; treat the above as
a starting point to confirm, not a final answer.

## What to build

1. Curve-fit function: given the 5 known anchor points (ordered by door number), fit a smooth curve
   (piecewise-linear between anchors is fine and simplest; a spline is nicer but not required) and
   interpolate a real-world `[lng, lat]` for any door number in between and slightly beyond the
   anchor range (extrapolation for doors 1-3 and 26-29, outside the anchor span, should be flagged
   as lower-confidence than interpolation between two anchors).
2. Generate `GraphNode` + `PoiDefinition` entries for every door/airline pair in `sea.ts`, using this
   interpolation, each tagged `precisionGrade: "schematic"` at the POI/package level (check
   `airportLayoutPackage.ts` — precision grade is currently package-level; decide whether it needs
   to move to per-POI granularity so surveyed doors and interpolated doors can coexist honestly in
   the same package, or add a lighter per-node confidence marker if a full schema change is too
   large for this pass).
3. Also plot the non-airline POIs the owner asked for (Children's Play Area, Lucky Louie Fish Shack,
   and other named restaurants/amenities visible on the reference map) using the same curve-relative
   interpolation approach where they sit along/near the same hall, or reasonable proximity placement
   where they're set back from the hall (e.g., mid-terminal food court behind ticketing) — use
   judgment based on the reference map's actual layout, don't force everything onto one curve.
4. Wire all of these into the live map exactly like the existing Alaska/Door 24 fix (same node/POI
   pattern, same Duffel logo lookup via `airlineIataCode`).
5. Do NOT gate any of this on the `mainTerminal` ring's point-in-polygon test — same standing
   instruction as before, that ring is still unverified/possibly self-intersecting and must not
   override real or calibrated-real data.
6. After this ships, the click-to-place admin tool (separate prompt,
   `CURSOR_PROMPT_admin_click_to_place_poi.md`) becomes the fast correction path — a human glances at
   each interpolated pin against the real map and nudges anything visibly off, rather than placing
   everything from a blank map.

## What NOT to do

- Do not present interpolated positions as equally certain as the 5 real anchor doors — keep the
  `schematic` vs `surveyed` distinction visible in the data, even if not surfaced in the traveler UI.
- Do not skip verifying the airline-to-door list above against the actual reference source — it's a
  starting point from this session's review, not confirmed exhaustive or error-free.
- Do not extrapolate far beyond the anchor range with the same confidence as interpolating between
  two anchors — flag doors 1-3 and 26-29 (outside the 4-24 anchor span) as lower confidence.

## Execution order

1. Confirm the full door → airline list against the real reference source; correct the starting
   list above where wrong.
2. Build the curve-fit/interpolation function; unit test it against the 5 known anchors (it should
   reproduce them near-exactly) plus a couple of sanity-checked interpolated midpoints.
3. Generate all door/airline nodes + POIs; wire into `sea.ts` (or a generated companion file, your
   call, matching existing `seaFootprints.ts`'s "generated file" pattern if that's cleaner).
4. Add non-airline POIs (Children's Play Area, Lucky Louie Fish Shack, etc.) with reasonable
   placement.
5. Confirm visually on the live map: all major airlines now render, roughly correctly, along the
   real curve — not just Alaska.
6. Add a design law documenting curve-calibrated interpolation as an approved method for filling gaps
   between OSM-verified anchors, with the `schematic`/`surveyed` labeling requirement. Add tests to
   the test index.
7. Run `npm run test:laws && npm run build` before push.

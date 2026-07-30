You are adding a permanent, automated "ground-truth conformance" validator to Kepi Travel's airport
layout pipeline. This is a new, hard build/publish gate — deterministic checks against real tagged
data, not discretion, not "closest guess." Standing rules apply: read `CLAUDE.md` / `AGENTS.md` /
`KEPI_DESIGN_LAW.md` first, minimal surgical changes, add a design law + test, `npm run test:laws &&
npm run build` before push.

## Why this exists

The existing M29 audit only checks route-graph *logic* (reachable, no backtracking, coordinates not
NaN/out of range) — it has never checked whether a node is actually sitting at the real, correctly
identified feature. Every SEA/LAX bug this session (curb at a building center, security floating on
a guess, a "Gate 9" pin not actually at OSM's real Gate 9) passed M29 while being visibly wrong. This
gate closes that hole with checks anchored to real OSM tag data, not estimation.

**This must be a hard, non-negotiable gate** — the whole point is removing discretion. A node either
conforms to ground truth or it doesn't; there is no "close enough, ship it."

## Rules to implement

1. **Gate ref exact match.** For any POI with `category: "gate"`, find the real OSM node/way tagged
   `aeroway=gate` with a matching `ref` (e.g. `ref=9`) for that airport. The POI's coordinate must
   equal that OSM node's real coordinate — not an approximation, not "nearest guess." If no matching
   `ref` exists in OSM for that airport, this gate cannot ship with `precisionGrade: "surveyed"` for
   gates; it stays schematic and unpublished-as-precise until it does.
2. **Curb/drop-off road proximity.** Any `curb`/drop-off-type node must be within a small, defined
   distance (pick a sane default, e.g. 40m, and make it a named constant, not a magic number) of a
   real OSM `highway=*` way. Use `@turf/point-to-line-distance` (turf is already a dependency) — do
   not hand-roll distance math.
3. **Landside/airside topology enforcement.** Walk the routing graph: no node with `airside: false`
   may connect directly (via a single edge) to a node with `airside: true` unless that edge's `kind`
   is `security_transition`. This makes "security past the gates" / "curb touching airside"
   structurally impossible to produce, not just visually wrong.
4. **Cross-category collision / nearest-real-feature match.** For every Kepi POI, find the nearest
   independently-tagged real OSM feature (any `shop=*`, `amenity=*`, `aeroway=gate`, named building
   feature) within a small radius. If the nearest real feature's category/name doesn't match the
   POI's own claimed category/name (e.g. Kepi says "Gate 9" but the nearest real tagged feature is a
   restaurant, or is actually tagged as a different gate ref), **fail**. This is the general form of
   "a gate can't be sitting on a Chick-fil-A" — implement it as a real distance+tag match, not a
   category-specific special case.
5. **Security entry/exit pair proximity.** A single checkpoint's `security_entry` and
   `security_exit` nodes must be within a tight distance of each other (checkpoints don't span a
   whole terminal) — pick a sane default (e.g. 150m) and name the constant.
6. **Terminal footprint containment — gated on ring validity, not run blind.** Nodes should also be
   confirmed inside the real terminal polygon via `booleanPointInPolygon`, but **only once the ring
   itself is confirmed non-self-intersecting** (see `CURSOR_PROMPT_fix_sea_terminal_ring_validity.md`
   — run `@turf/kinks` first). Don't let a still-unverified ring gate anything; if the ring hasn't
   been validated for a given airport yet, skip check 6 for that airport and rely on checks 1-5,
   rather than blocking on an untrustworthy shape.

## Open questions to resolve while building (don't guess past these — report back)

- Confirm per-airport whether OSM's gate `ref` tagging is as clean/complete as SEA's door refs were
  — this varies by airport and must be checked, not assumed. Airports without clean gate refs cannot
  claim `"surveyed"` gate precision; they stay schematic.
- Decide and document the "same spot" distance threshold for the collision check (rule 4) — needs to
  be small enough that legitimately-clustered real POIs (multiple counters in one hall) don't
  false-positive, but tight enough to catch real category collisions. Pick a defensible default,
  document why, make it a named constant.
- Confirm: a failed check should **hard-block publish** for that airport/POI (matching design law
  D13's no-fabrication rule), not silently downgrade — but flag this decision explicitly rather than
  assuming, since it affects how fast any airport can ship.
- For categories with no real OSM tagging at all (security checkpoints, still zero anywhere per this
  session's earlier research) — rules 2, 3, and 5 (topology/distance/pairing) still apply, but rule 1
  (exact ref match) cannot. Make sure the validator doesn't silently skip checkpoints entirely just
  because they lack a ref — apply every rule that *can* apply to them.

## What NOT to do

- Do not make any of these checks advisory/soft-warn only — they must block, per the standing
  no-fabrication design law.
- Do not special-case "gate vs restaurant" as a one-off rule — implement the general nearest-real-
  feature match (rule 4) so it catches any category collision, not just the one example given.
- Do not run the footprint-containment check (rule 6) against a ring that hasn't been validated —
  check ring validity first, per the existing follow-up prompt.
- Do not apply `"surveyed"` precision grading to anything that hasn't passed every rule that
  applies to its category.

## Execution order

1. Read `osmImport.ts`, `airportLayoutPackage.ts`, `types.ts`, and the M29 audit implementation to
   understand exactly what's already checked vs. what this adds. Summarize before coding.
2. Implement rules 1-5 as independent, composable validator functions, each with its own unit tests
   using both passing and deliberately-broken fixtures (e.g. a gate pinned to a restaurant's real
   coordinate should fail rule 4; a curb node inside a building should fail rule 2).
3. Wire rule 6 behind the ring-validity check from the other prompt.
4. Wire the full validator into both the import/curation save path (fail fast, tell the curator
   immediately) and as a permanent automated test (`groundTruthConformance.test.ts` or similar)
   blocking `npm run build`.
5. Run it against current SEA and LAX data; report exactly what fails and why, honestly, before
   attempting any new fixes based on the results.
6. Add a design law (next available number) documenting these rules as permanent, non-negotiable
   gates. Add the test file to the test index.
7. Run `npm run test:laws && npm run build` before push.

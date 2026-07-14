You are working on Kepi Travel's airport indoor-positioning system. Standing rules apply: read
`CLAUDE.md` / `AGENTS.md` / `KEPI_DESIGN_LAW.md` first, diagnose before editing, minimal surgical
changes over rewrites, add a design law + test per behavior change, `npm run test:laws && npm run
build` before push, push directly to `main`.

## Why this exists

Research into indoor positioning options (beacon-based, magnetic fingerprinting, camera-based
visual positioning, WiFi RTT, UWB) confirmed every approach that beats plain GPS-and-dead-
reckoning costs something real: labor (a calibration walk), a content project (a photogrammetry
scan), battery (continuous AR), or infrastructure Kepi doesn't control (beacons, UWB anchors,
specific WiFi hardware). None of those are the right next step for Kepi right now.

But there is a real, buildable-today improvement that costs nothing new: **map-aided dead
reckoning** — constraining the existing step-counting/heading position estimate to the airport's
known walkway graph, instead of letting it drift freely in open 2D space. A person walking
through a terminal can only be in a corridor or a room, never through a wall — using that fact to
correct drift is a well-established technique (the pedestrian-navigation equivalent of how car
GPS snaps a noisy trace onto the nearest road). This uses data Kepi already has (the walkway
graph curated per airport) and code that already exists (`positionFusion.ts`, `pathfinder.ts`) —
it's an enhancement to what's there, not a new system.

## What exists today (read these first, trace the real flow before changing anything)

- `src/lib/airportNav/types.ts` — `IndoorPositionFix` (`source: "os_indoor" | "gps_snap" |
  "dead_reckoning" | "user_confirmed"`), `WalkwayGraph` / `NavGraphNode` / `NavGraphEdge`.
- `src/lib/airportNav/positionFusion.ts` — `fuseFix()` blends the previous and incoming fix by
  confidence; `dead_reckoning` fixes currently just decay in confidence over time (capped at 0.55
  after ~120 seconds) with no positional correction against the graph — the position itself keeps
  extrapolating in free space even as confidence in it drops.
- `src/lib/airportNav/pathfinder.ts` — `snapToGraph()` already does map-matching for GPS fixes
  (snapping a raw lng/lat onto the nearest walkway node/edge with a confidence score based on
  distance off-graph). This is the pattern to extend to dead-reckoning, not duplicate.
- `src/lib/airportNav/journeyMachine.ts` — consumes position events with a confidence score and
  explicitly refuses to advance phase silently on low confidence, asking the traveler instead.
  This honesty rule must not change — map-aided correction should make the *position estimate*
  better, not make the system falsely more confident than it's earned.

## What to build

1. **Constrain dead-reckoning displacement to the graph, not free 2D space.** When a
   `dead_reckoning` fix is produced (step count + heading since the last trusted fix), instead of
   projecting it as a raw lat/lng offset, walk that displacement along the `WalkwayGraph` starting
   from the last known snapped node/edge: continue along the current edge if the displacement fits
   within it, transition to a connected edge at a junction if it doesn't, and never project a
   position that isn't reachable via the graph's actual connectivity. This is the core of "map-
   aided" — the correction comes from constraining *where the fix is allowed to be*, not from a
   new sensor.
2. **Keep the existing honesty/confidence rules intact.** Confidence still decays over time per
   the existing logic in `positionFusion.ts` — a graph-constrained dead-reckoning fix is more
   likely to be *positionally correct* than a free-floating one, but it is not automatically more
   *certain*. Do not raise the confidence ceiling for `dead_reckoning` fixes just because they're
   now graph-constrained; that would contradict the journey machine's "never advance phase
   silently on low confidence" rule.
3. **Re-anchor on every trusted fix.** Whenever a `user_confirmed`, `os_indoor`, or high-confidence
   `gps_snap` fix arrives, that becomes the new baseline node/edge for subsequent dead-reckoning
   projection — don't let drift compound past a fresh trusted anchor.
4. **Handle junctions and dead ends honestly.** If accumulated displacement would require a turn
   the graph doesn't actually offer at that point (e.g., the corridor doesn't branch there), don't
   silently pick an arbitrary connected edge — this is exactly the kind of ambiguity that should
   lower confidence rather than guess, consistent with the existing honesty rules.
5. **Do not touch the journey machine's phase-transition logic itself** — this work only improves
   the position/confidence values flowing into it. If the journey machine needs adjustment as a
   result, treat that as a separate, explicitly-scoped follow-up, not part of this change.

## What NOT to do

- Do not add a full probabilistic particle filter or bring in a new dependency for this — the
  smallest safe version is graph-constrained projection along `WalkwayGraph` connectivity, not a
  general-purpose localization framework. Keep it in the spirit of `snapToGraph()`'s existing
  approach.
- Do not change `IndoorPositionFix.source` values or add a new source type — this is an
  improvement to how `dead_reckoning` fixes are computed, not a new position source.
- Do not silently increase confidence just because positions are now graph-constrained.

## Execution order (verify between steps, don't deliver all at once)

1. Read and trace the current flow end to end (`positionFusion.ts`, `pathfinder.ts`,
   `journeyMachine.ts`, `types.ts`) and summarize the exact current dead-reckoning path in plain
   English before writing code.
2. Implement the graph-constrained projection function (likely alongside `snapToGraph()` in
   `pathfinder.ts`, or a new sibling function it calls into — decide based on what's cleanest
   given the actual code, not assumed in advance).
3. Wire it into `positionFusion.ts`'s `fuseFix()` for the `dead_reckoning` case, preserving the
   existing confidence-decay behavior.
4. Add tests: graph-constrained projection continuing along a single edge, transitioning at a
   junction, refusing an unreachable turn, and re-anchoring after a trusted fix arrives.
5. Add a design law in `KEPI_DESIGN_LAW.md` (DATA/API or a new AIRPORT NAV section) stating that
   dead-reckoning position must be constrained to walkway-graph connectivity, and that confidence
   is never raised solely because a fix is graph-constrained. Add the test file to the test index.
6. Run `npm run test:laws && npm run build` and confirm passing before push.

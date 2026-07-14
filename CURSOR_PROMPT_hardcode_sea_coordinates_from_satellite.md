Final fix replacing `CURSOR_PROMPT_fix_sea_checkin_coordinates.md` and
`CURSOR_PROMPT_fix_sea_terminal_ring_validity.md` — stop chasing the polygon bug, use ground-truth
coordinates instead. Standing rules still apply: read `CLAUDE.md` / `AGENTS.md` /
`KEPI_DESIGN_LAW.md` first, minimal surgical changes, add a design law + test, `npm run test:laws
&& npm run build` before push.

## Why the last two attempts didn't work — stop this pattern

Every fix so far tried to verify hand-guessed node coordinates in `src/lib/airportNav/layouts/
sea.ts` against `SEA_OSM_FOOTPRINTS.mainTerminal` — a shape Kepi auto-derived from OpenStreetMap
and simplified. That derived shape is not reliable ground truth (it's very likely self-intersecting
— a real terminal with concourses radiating from a core doesn't reduce cleanly to one simple
outline). Testing guessed coordinates against a shape that might itself be wrong just produces more
of the same bug in a new place. **Stop using the computed terminal polygon as the source of truth
for whether a node coordinate is correct.**

## The actual fix: hand-verify every node against real satellite imagery, once

1. For every landside/routing node currently in `sea.ts`'s `NODES` array (`curb-departures`,
   `checkin-south`, `checkin-center`, `checkin-north`, `landside-hall`, `sec3-entry`, `sec3-exit`,
   `sec5-entry`, `sec5-exit`, and any gate/lounge/train nodes worth double-checking): look up the
   real physical location at Seattle-Tacoma International Airport using satellite imagery (Google
   Maps satellite view, or OpenStreetMap's own editor which is satellite-aligned) and read off the
   actual real-world latitude/longitude at that exact spot — not an estimate, the real coordinate
   the mapping tool reports for that pixel.
2. Cross-reference against the reference screenshots already gathered this project (the Atrius-
   powered flysea.org map, which shows real door numbers, airline names, and checkpoint names/
   locations) to know exactly which real-world spot corresponds to "Alaska check-in / Door 1,"
   "Security Checkpoint 3," etc. — use that only to know *where to look*, not as a coordinate
   source itself (still don't copy Atrius's data — this is about finding the real physical location
   on a map you're allowed to read coordinates from, same as always).
3. Replace the current guessed numbers in `sea.ts` with these real, verified coordinates. Comment
   each one with how it was verified (e.g. "verified via satellite view, aligned to Door 1 entrance,
   2026-07-xx") so a future editor knows this was checked, not guessed.
4. **Do not re-run the point-in-polygon test against `SEA_OSM_FOOTPRINTS.mainTerminal` as a
   pass/fail gate for these coordinates.** The terminal ring is decorative background at this point,
   not validation. If a verified real coordinate happens to fall slightly outside the (possibly
   still-buggy) rendered terminal shape, that's a separate, lower-priority cosmetic issue with the
   ring — it must never block or override a verified real-world coordinate.
5. Once all nodes are hand-verified this way, do a full visual pass on the live map at a zoom where
   all of them are visible, and confirm every dot sits on the correct real building/door, not just
   "inside some shape."

## Fix the terminal ring shape too, but as separate, lower-priority cleanup

The self-intersection risk in `SEA_OSM_FOOTPRINTS.mainTerminal` is still worth fixing so the
building looks right — check with `@turf/kinks` as described in the ring-validity prompt, and clean
it up if broken. But this is now purely cosmetic backdrop work, decoupled from whether the routing
dots are correct. Do not let this block or gate the node-coordinate fix above.

## What to build going forward — the repeatable per-airport process

This hand-verify-from-satellite-imagery method is the actual scalable process for adding detail to
any future airport, not a one-off. Document it as such:

- Add a short section to whatever admin curation docs/UI exist for `AirportLayoutPackage` describing
  this exact method: for every check-in/door/checkpoint node, look up the real coordinate via
  satellite imagery, verify against a reference map if available, hand-enter it, comment how it was
  verified.
- This is not "build an auto-detection engine" — that would need to reliably read floor plans/
  imagery per airport and has no solid open data source to draw from (confirmed earlier: OSM has no
  security-checkpoint tagging at all, and check-in-counter-level detail is inconsistent even where
  present). Hand-verified entry, once per airport, through the existing curation pipeline is the
  right scope for now.

## Execution order

1. Re-derive real coordinates for every SEA landside node via satellite imagery, one at a time,
   commenting each with how it was verified.
2. Replace the values in `sea.ts`.
3. Do NOT gate this on the terminal-ring point-in-polygon test.
4. Separately (lower priority), check/fix the terminal ring's self-intersection per the previous
   prompt, purely for visual correctness of the backdrop shape.
5. Full visual check on the live map: every check-in counter, door, and checkpoint sits on the
   correct real building.
6. Add a comment/doc note capturing this as the repeatable method for future airports.
7. Run `npm run test:laws && npm run build` before push.

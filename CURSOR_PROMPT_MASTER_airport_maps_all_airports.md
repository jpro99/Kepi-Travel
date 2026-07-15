MASTER PROMPT — this is the one to hand to Cursor now. It consolidates every airport-map decision
from this session into one spec, generalized to every airport Kepi supports, not just SEA. Start by
telling Cursor: **"Use the kepi-airport-bot skill for this — read
`.cursor/skills/kepi-airport-bot/SKILL.md`, `CLAUDE.md`, `AGENTS.md`, and `KEPI_DESIGN_LAW.md`
first."** Standing rules: minimal surgical changes, add a design law + test per behavior change,
`npm run test:laws && npm run build` before push, push directly to `main`.

## The one rule underneath everything below

**Never claim precision Kepi hasn't earned, for any airport, ever.** Where real ground truth exists
(OSM-tagged gates/doors/building shapes), use it exactly, hard-enforced. Where it can never exist
(security checkpoints — confirmed structurally excluded from every public indoor-mapping source,
including Apple's own IMDF standard, as a deliberate security policy, not a data gap) — say so
honestly and never guess. This must work identically whether it's airport #1 or #100: the *rules*
never change per airport, only how much of each airport's *data* currently passes them.

## 1. This must be airport-agnostic from day one — verify, don't rebuild

The architecture already supports this — confirm it stays this way, don't special-case SEA:

- `LAYOUT_REGISTRY` in `src/lib/airportNav/layouts/index.ts` is keyed by IATA code. Adding an
  airport is a new registry entry, never new bespoke logic.
- `AirportLayoutPackage` (`airportLayoutPackage.ts`) — draft/published lifecycle, `precisionGrade`,
  `previewConfirmedAt` gate — already generic per IATA code.
- `osmImport.ts` — Overpass-based import, already generic.
- Every rule below is implemented once, in shared code, and applies to whatever airport is being
  processed. If an airport's real data can't satisfy a rule, that airport stays at a lower precision
  grade — the rule is never loosened to make an airport look finished.

## 2. Gates, check-in, lounges, doors — must be ground-truthed AND kept current

**Ground-truth conformance gate (build this as a permanent, hard, cross-airport validator):**

- **Gate ref exact match.** Any POI with `category: "gate"` must sit at the exact coordinate of the
  matching real OSM node tagged `aeroway=gate` with that `ref` for that airport. No approximation.
  If an airport's OSM data doesn't tag gate refs cleanly, that airport cannot claim
  `precisionGrade: "surveyed"` for gates — it stays schematic, full stop, for that airport only.
- **Curb/drop-off road proximity.** Curb/drop-off nodes must be within a small, named-constant
  distance (e.g. 40m) of a real OSM `highway=*` way, via `@turf/point-to-line-distance` (turf is
  already a dependency).
- **Landside/airside topology, structurally enforced.** No node with `airside: false` may connect
  directly to a node with `airside: true` except via a `security_transition` edge. This makes
  "security past the gates" impossible to produce, not just visually wrong.
- **Cross-category collision check.** For every POI, find the nearest independently-tagged real OSM
  feature within a small radius. If its category/name doesn't match the POI's own claim (a "Gate 9"
  sitting on a restaurant's real coordinate, or on a different gate's real ref), **fail**. General
  rule, not a one-off special case for restaurants.
- **Terminal footprint containment** via `booleanPointInPolygon`, but only once that airport's
  building ring is confirmed non-self-intersecting via `@turf/kinks` first. Don't gate on an
  unverified ring — skip this specific check for that airport until the ring passes, rely on the
  other checks meanwhile.

**Keeping it current — this data changes in the real world (renovations, gate reassignments,
airlines moving terminals) and must not silently go stale:**

- Add/confirm a `verifiedAt` (or reuse `AirportLayoutPackage.updatedAt` if it's already
  per-verification, not just per-edit) timestamp per airport package, and ideally per-node/POI if the
  schema can carry it without a large migration.
- Add a staleness threshold (pick a sane default, e.g. 6-12 months, named constant, easy to tune) —
  past that, surface the airport in the admin curation queue as "needs re-verification," not silently
  keep serving old data as if current.
- Re-running the OSM import for an already-published airport should produce a new **draft**, diffed
  against the current published version, so a curator sees exactly what changed (a gate reassigned,
  a lounge closed) before it overwrites live data — never auto-publish a re-import over a
  human-verified airport.

## 3. Every real, tagged coordinate on the map is fair game — promote it, don't re-derive it

General principle, not a fixed list: **anything on the map that has a real OSM tag and a real
coordinate is usable, if it helps a Kepi traveler.** Shops, banks, restaurants, and toilets are the
confirmed example (2026-07-13 OSM verification counted 53 shops/74 food/53 toilets at SEA alone —
see `KEPI_PROJECT_MEMORY.md` — this data was already fetched and never finished being used), but
don't stop at that list. The same rule extends to every other real, named, coordinate-tagged
feature already present in the same Overpass data: elevators, escalators, moving walkways, ATMs,
charging stations, family/nursing rooms, pet relief areas, information desks, baggage carousels,
water fountains, wheelchair/accessibility points — whatever OSM already tags with a real coordinate
at that airport. If it's real, tagged data and it would help a traveler, promote it. If it isn't
tagged at that airport, it simply doesn't show for that airport — never invent it to fill a gap.

- Extend `osmImport.ts`'s conversion step (not the Overpass query — that part already pulls most of
  this) to turn every named, coordinate-tagged feature into a real `PoiDefinition` + `GraphNode`,
  using its exact real OSM coordinate — no re-deriving, no AI-visual-guessing off a screenshot, just
  read the coordinate that's already there in the data already being fetched. Expand the Overpass
  query itself if a useful tag category (e.g. `amenity=charging_station`, `amenity=baggage_claim`,
  `highway=elevator`) isn't already being pulled.
- These get the same `precisionGrade: "surveyed"` treatment as gates/doors when the OSM tag +
  coordinate is present and clean — this category doesn't have the "no ground truth exists" problem
  gates initially seemed to (before doors were confirmed), or the permanent problem security has.
  Don't under-grade data that's actually there.
- Apply the same cross-category collision check from section 2 across all of these too — the general
  rule (nearest real tagged feature must match what a POI claims to be) applies uniformly, not just
  to the gate-vs-restaurant example that motivated it.
- This applies to every airport in the registry automatically, via the same shared import code — not
  a SEA-specific addition, and not a hardcoded category list that needs manual updating per airport.

## 4. Security checkpoints — permanently approximate, and say so plainly (legal + honesty)

This is now a settled, permanent design decision, not an open research question:

- **Never claim an exact security checkpoint coordinate, for any airport, ever.** No public
  indoor-mapping source has this data anywhere (confirmed: OSM has zero checkpoint tagging at every
  airport checked; Apple's own IMDF standard explicitly excludes the security-screening area from
  what it publishes, as deliberate policy). This is not solvable by finding a better data source —
  design around it permanently.
- Render security as an **approximate zone/area**, not a precise pin — e.g. a soft-edged marker or
  small radius circle around the best-known general area (landside, near the relevant hall), not a
  sharp dot implying exact placement.
- **Mandatory UI disclaimer wherever a security checkpoint is shown**, plain language, something
  like: *"Approximate security screening area — exact checkpoint location and lane setup can change
  without notice. Follow posted airport signage."* This protects a traveler from being told
  confidently "it's exactly here" when it's moved, and protects Kepi from that liability. Do not
  soften or bury this disclaimer.
- Security nodes still get the checks from section 2 that *can* apply without needing exact
  ground-truth: landside-before-airside topology, reasonable proximity to a real terminal entrance,
  tight entry/exit pairing distance. They just never get `precisionGrade: "surveyed"` or an exact-
  match claim.
- Do not keep researching "one more website" for checkpoint coordinates — treat this as closed. The
  only path to a checkpoint being *more* precise than "approximate zone" is a human physically
  confirming it via the click-to-place tool (section 5), airport by airport, and even then it should
  probably stay labeled approximate given real-world checkpoints do get relocated during renovations
  without any dataset being updated.

## 5. Human verification tool — the correction path for anything not ground-truthable

Build (if not already built from the earlier standalone prompt) an interactive click-to-place mode
in `src/app/admin/airport-editor/page.tsx`:

- A MapLibre map showing the airport's current real basemap + curated data.
- Click-to-capture-coordinate (MapLibre gives real `lngLat` on any click, no computation needed).
- On capture: category, name, airline (drives the existing Duffel logo lookup in `poiDetail.ts`),
  door label.
- Goes into the existing draft → preview-confirm → publish flow — no second publish path.
- Works for any airport code already in (or addable to) the registry — not hardcoded to SEA.
- This is the correction/verification mechanism for security zones and anything curve-interpolated
  (section 6) — a human glances and confirms or nudges, rather than placing from a blank map.

## 6. Control-point georeferencing — the "instant draft" engine, 2D not just 1D

Generalizes the original curve-through-doors idea into a real, standard GIS technique:
georeferencing an image via control points. Where a public reference image (e.g. an airport's own
wayfinding map) shows named features, and enough of those same features already have a real,
independently-verified Kepi coordinate (doors, gates), compute a 2D transform (affine at minimum;
projective/rubber-sheet if the reference image has perspective distortion) from the matched pairs,
then use it to estimate a real coordinate for every *other* labeled feature in that same reference
image — ticket counters, elevators, kiosks, anything. **This never reads or copies a competitor's
coordinate — it computes Kepi's own estimate from Kepi's own verified anchors; the reference image
only tells you which named thing corresponds to which pixel.**

- **Anchor coverage matters — pool every real, tagged category, not just doors.** A set of anchors
  clustered along one line (e.g. just the ticketing-hall doors) is only reliable for interpolating
  *along that same line* — it under-determines position for anything set back from it (deeper gates,
  side corridors, upper levels). Before trusting 2D estimates broadly, pool **every** real,
  independently-tagged coordinate the airport's OSM data has — doors, gates, lounges, and also
  elevators (`highway=elevator`) and escalators (conveying-tagged features), which are commonly
  mapped and, importantly, sit at different depths through the terminal rather than along one curb
  line. More categories pooled together means better-distributed real anchors, which is what makes
  the transform trustworthy away from the door row, not just along it. Confirm which of these
  categories actually exist per airport before assuming coverage — same "verify, don't assume" rule
  as everywhere else.
- **This estimates position, not shape.** The transform gives a trustworthy point — where a counter
  or feature is — not its real footprint/orientation/size, unless that shape is separately and
  reliably tagged in OSM (uncommon). Render these as points (a labeled icon/pin, airline logo where
  applicable via the existing Duffel lookup), not as a claimed accurate desk outline — don't oversell
  a point estimate as more than it is.
- **Coverage must be complete, not just the airlines already hardcoded.** Currently only a handful
  of airlines (Alaska, Delta, United, Air Canada, Emirates) have curated check-in POIs — every other
  airline visible on the airport's own public wayfinding reference (American, Frontier, Sun Country,
  etc.) is missing entirely, which is the actual cause of "airline X isn't showing / is showing in
  the wrong place." Use this same control-point method to place every airline shown on that public
  reference, not just the ones already coded — completeness is part of the fix, not an afterthought.
- Every position produced this way is `precisionGrade: "schematic"` — this is instant-draft
  generation, not verification. It must go through the click-to-place tool (section 5) for a human
  quick-confirm/nudge before being treated as final, same as the original curve interpolation.
- Flag any estimate produced by extrapolating outside the convex hull of the known anchors as lower
  confidence than one produced by interpolating between/among anchors.
- This is generic, reusable code (a control-point transform function + a "map labeled reference
  points to draft coordinates" step), not a SEA-specific script — build it once, apply per airport
  wherever a public reference image + enough real anchors exist.

## 7. Routing — honest by default, everywhere

- `AirportLayout.routeGrade` (already shipped) defaults to `"schematic"`. A drawn, turn-by-turn
  walking route only renders when an airport is explicitly `"surveyed"` — real, verified corridor
  data, which currently doesn't exist anywhere yet. Keep the existing `routeGradeHonesty.test.ts`
  build-gate that prevents flipping this without real data.
- Until an airport is `"surveyed"`: accurate pins + an honestly-labeled approximate time estimate
  computed from real straight-line distance between verified points (not the old fake
  straight-to-centroid logic) — confirm this explicitly, don't assume it's already fixed.

## What NOT to do

- Do not build anything SEA-specific — every piece of code here must take an IATA code as a
  parameter and work the same way for any airport in the registry.
- Do not give security checkpoints exact-match treatment or drop the disclaimer, ever, for any
  airport.
- Do not auto-publish a re-import over a human-verified airport without a diffed draft + review.
- Do not let an unverified terminal ring gate anything (section 2's footprint check specifically).
- Do not present a passing M29 routing-logic audit as proof of real-world accuracy — they are
  separate checks; both must pass before anything is marked verified.

## Execution order

1. Confirm current state: which of sections 2–7 are already shipped (routeGrade honesty and the
   admin click-to-place tool may partly exist from earlier work) vs. still needed. Report honestly
   before building, don't assume.
2. Build/finish the ground-truth conformance validator (section 2) as shared, cross-airport code.
3. Add the staleness/re-verification workflow (section 2) — timestamp, threshold, diffed re-import
   drafts.
4. Promote shops/banks/food/toilets/lounges from already-fetched OSM data into real, named,
   coordinate-precise POIs (section 3) — this is data already being pulled, just not converted yet.
5. Implement the security approximate-zone rendering + mandatory disclaimer (section 4) — this
   should be quick, it's a rendering + copy change plus removing any exact-match logic for security.
6. Finish the click-to-place admin tool (section 5) if not already done.
7. Confirm curve interpolation (section 6) is gated behind human confirmation, not auto-published.
8. Confirm the time-estimate math (section 7) uses real distance, not the old fake centroid path.
9. Add/confirm design laws for each rule above (gate ground-truth match, shop/lounge promotion,
   security-approximate-only, staleness re-verification, route-grade honesty) and add every new test
   to the test index.
10. Run `npm run test:laws && npm run build` before push.

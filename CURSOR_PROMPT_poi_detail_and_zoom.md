You are working on Kepi Travel's airport map POI detail. Standing rules apply: read
`CLAUDE.md` / `AGENTS.md` / `KEPI_DESIGN_LAW.md` first, diagnose before editing, minimal surgical
changes over rewrites, add a design law + test per behavior change, `npm run test:laws && npm run
build` before push, push directly to `main`.

This is a separate, independent piece of work from `CURSOR_PROMPT_map_aided_dead_reckoning.md`
(that one is live position tracking; this one is static map detail/zoom behavior) and from
whichever option was chosen off `CURSOR_PROMPT_osm_realmap_pipeline.md` / the basemap label fix
(that's the tile/label rendering layer this renders on top of). Do not merge scope across these.

## Why this exists

Owner wants Kepi's own airport maps to reach the same level of detail as commercial airport-map
products (Atrius-style): at high zoom, see individual airline check-in counters and their real
logos (United, Emirates, Air Canada, etc.), named security checkpoints, numbered doors — not just
zone outlines. Tapping/zooming should feel like the real airport, not a schematic.

**Important boundary, already discussed and settled — do not re-litigate:** we are not copying
Atrius's map data or scraping their live checkpoint wait-time numbers. Physical layout facts
(where United's counter actually is) aren't anyone's property and get hand-curated into Kepi's own
`AirportLayoutPackage` data, same as everything else in this pipeline. Airline logos are used the
same way TripIt/Flighty/Google Maps use them — to label an airline's own real counter, not implying
partnership. Live wait-time estimates are explicitly out of scope for this prompt (that's a future,
harder project once Kepi has enough traveler traffic through an airport to estimate it honestly —
log it as a "revisit later" item in `KEPI_PROJECT_MEMORY.md` the same way VPS was logged, don't
build a fake number now).

## What exists today (read these first, trace the real flow before changing anything)

- `src/lib/airportNav/types.ts` — `PoiCategory` is currently a fixed enum: `gate | checkin |
  security | lounge | restroom | train | baggage`. `PoiDefinition` has `id, nodeId, category, name,
  airline?, lanes?, notes?` — no logo/icon field, no door-number field distinct from `name`.
  `GraphNode.kind` already includes `door`, `checkin`, `security_entry`, `security_exit`, etc.
- `src/lib/airportNav/airportLayoutPackage.ts` — the Zod schema (`AirportLayoutPackageSchema`)
  mirrors `AirportLayout`/`PoiDefinition` exactly; any new POI field must be added here too, kept in
  sync, or the schema validation will reject curated data.
- `src/components/travelAssistant/AirportNavigatorMap.tsx`:
  - `airportPoiIsVisible()` (used at both ~line 228 and ~line 359) filters visible POIs by
    `detailMode`, airline relevance, and gate — **there is no zoom-level filtering today.** Every
    visible-per-mode POI renders regardless of how far zoomed out the map is. This is the actual
    gap to close for "zoom in to see counter-level detail."
  - The `selectedPoi` block (~line 540 onward) already renders the tap-to-see-detail leader-line +
    label callout (point → polyline → label rect/text). Reuse this exact pattern for logo display —
    add an optional logo image into that same callout, don't build a new UI.
  - POI markers are colored by category via `POI_COLOR[definition.category]` (~line 509) — this is
    the existing dot-per-category rendering to extend, not replace.
- `src/app/api/admin/airport-layout/route.ts` and `queue/route.ts`, `airportLayoutStore.ts` — the
  existing admin curation + review-queue backend for `AirportLayoutPackage` drafts. New POI fields
  (logo, door number) get entered here, through whatever admin editor UI already exists for this —
  find it before assuming one needs to be built.
- `src/lib/airportNav/osmImport.ts` — currently does not import shop/operator/brand tags from OSM.
  Out of scope to change for this task; airline check-in counters are hand-curated data, not
  auto-imported, same as the rest of the POI set.

## What to build

1. **Zoom-tiered POI visibility.** Add a `minZoomToShow` (or equivalent) concept so POIs render in
   tiers: terminal/zone shapes always visible; major anchors (gates, security checkpoints, lounges)
   visible at a middle zoom; individual airline check-in counters, doors, and smaller POIs only
   appear once zoomed in close, matching how the Atrius reference map (and real-world expectation)
   progressively reveals detail. Wire this into `airportPoiIsVisible()` alongside a zoom value read
   from the MapLibre map instance (`map.getZoom()`) — check how zoom changes are already listened to
   in this file (there's a `zoom.on`-style pattern already present for the live map) before adding a
   new listener.
2. **Airline logo support on check-in/gate POIs.** Add an optional field to `PoiDefinition` (and the
   matching Zod schema in `airportLayoutPackage.ts`) — e.g. `logoUrl?: string` or `airlineIataCode?:
   string` if resolving to a logo asset by carrier code is cleaner. Render it in the `selectedPoi`
   callout (and optionally as a small badge on the marker itself at high zoom) next to the counter
   name, e.g. "United — Door 7."
3. **Logo sourcing — do this as a real sub-step, don't skip it.** Do not hotlink or copy logo image
   files from Atrius's map or any other single map vendor's rendered tiles. Find a clean source:
   airlines' own public brand/press assets, or a maintained, license-clear airline-logo icon set.
   Confirm licensing terms before committing image assets to the repo. Where no clean logo asset
   exists for a given carrier, fall back to a plain text label — never block on missing logos.
4. **Door numbers and named checkpoints as their own visible labels**, matching the reference
   screenshot ("Door 7," "Door 11," "Security Checkpoint 3," "TSA PreCheck"). Check whether
   `GraphNode.landmark` or the existing `door` node kind already carries this, or whether it needs a
   `label` field added to nodes/POIs — decide based on the actual schema, not assumption.
5. **Curate this per airport through the existing admin flow**, not a bulk auto-generator — this is
   the same "one-time pipeline, then repeatable curation per airport" pattern already established
   for `AirportLayoutPackage`. Confirm SEA (or whichever airport is done first) matches the reference
   screenshot's level of completeness before calling it done, then treat subsequent airports as a
   content pass using the same admin tool.

## What NOT to do

- Do not touch or reference Atrius's live map, its wait-time numbers, or any of its rendered image
  tiles as a data/asset source.
- Do not build a live crowd-sourced wait-time feature in this pass — that's explicitly deferred; log
  it as a future item if it comes up, don't half-build it.
- Do not touch indoor positioning / dead-reckoning code — that's `CURSOR_PROMPT_map_aided_dead_
  reckoning.md`'s scope, not this one.
- Do not change the basemap tile/label rendering — that's the separate basemap-fix scope already in
  motion. This prompt only adds POI-level detail and zoom behavior on top of whatever basemap is in
  place.
- Do not add a new POI callout UI pattern — extend the existing `selectedPoi` leader-line/label
  block.

## Execution order (verify between steps, don't deliver all at once)

1. Read `types.ts`, `airportLayoutPackage.ts`, the `airportPoiIsVisible` call sites, the
   `selectedPoi` render block, and the admin airport-layout routes/UI. Summarize the current POI
   render/curation flow in plain English before writing code.
2. Add the schema fields (`minZoomToShow` or equivalent, logo/airline field, door/checkpoint label)
   to `types.ts` and `airportLayoutPackage.ts` together, kept in sync.
3. Wire zoom-based filtering into `airportPoiIsVisible()` and the map's zoom-change handling.
4. Add logo/label rendering to the `selectedPoi` callout and (if in scope) the marker itself.
5. Source and license-check logo assets per the constraint above; wire a text-only fallback.
6. Curate SEA's check-in counters/doors/checkpoints through the existing admin flow as the first
   real test case; compare visually against the reference screenshot.
7. Add tests: zoom-tier visibility thresholds, schema validation with/without the new optional
   fields, fallback-to-text-label behavior when no logo is set.
8. Add a design law in `KEPI_DESIGN_LAW.md` documenting the zoom-tiered POI visibility rule and the
   "no scraping vendor map data/logos" sourcing rule. Add the test file to the test index.
9. Run `npm run test:laws && npm run build` and confirm passing before push.

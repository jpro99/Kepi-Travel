You are adding a click-to-place POI curation tool to Kepi Travel's airport admin editor. This is
the generalized, reusable "engine" for hand-curating any airport's check-in counters, doors, and
security checkpoints going forward — not a one-off for SEA. Standing rules apply: read `CLAUDE.md`
/ `AGENTS.md` / `KEPI_DESIGN_LAW.md` first, minimal surgical changes, add a design law + test,
`npm run test:laws && npm run build` before push.

## Why this exists

Recent SEA debugging established that guessed lng/lat coordinates for check-in counters and
security checkpoints keep landing in the wrong place, and that verification methods must use real
ground truth, not eyeballed numbers. OSM's `entrance`/door-ref nodes cover doors well (already
ground-truthed this session via Overpass). But there's no ground-truth source for *which specific
spot inside a shared hall* an individual airline's counter sits, or where a security checkpoint's
queue entrance actually is — that detail has to be placed by a human who can see the real airport,
against Kepi's own real, accurate map.

**The mechanism:** Kepi's live map is already true GPS-based (MapLibre, real basemap, real
OSM-derived building shapes). A curator doesn't need to align two separate images — they just need
to click the correct real-world spot directly on Kepi's own live map while cross-referencing a
reference source (Google Maps, the airport's own public wayfinding page, physical signage/door
numbers), and MapLibre returns the exact `lngLat` of that click for free. This is standard, already
available functionality — not new capability to invent.

## What exists today (read before building)

- `src/app/admin/airport-editor/page.tsx` — the existing admin curation UI: review queue
  (`loadQueue`, `selectRequest`, `dismissRequest`), OSM import trigger (`handleImportFromOsm`),
  validate/preview flow (`handleValidateAndPreview`). **There is currently no interactive map or
  click-to-capture-coordinate tool in this file** — confirmed by search, this is the real gap.
- `src/lib/airportNav/airportLayoutPackage.ts` — the `AirportLayoutPackage` schema (draft/published,
  `previewConfirmedAt`/`previewConfirmedBy` gate before publish) that any new POI must be added
  through, same validation path as existing curated data.
- `src/app/api/admin/airport-layout/route.ts`, `queue/route.ts`, `import/route.ts` — existing admin
  API routes for this package lifecycle; extend, don't replace.
- `src/components/travelAssistant/AirportNavigatorMap.tsx` — the live map component already knows
  how to render zones/nodes/POIs from an `AirportLayout`; the admin tool should reuse the same
  MapLibre setup/rendering conventions (inline style objects only per CSP — see `CLAUDE.md`'s
  MapLibre rule) rather than build a second, different map stack for the editor.
- `src/lib/airportNav/types.ts` — `PoiDefinition`, `GraphNode` shapes new POIs must conform to.

## What to build

1. **Interactive map in the admin editor.** Add a MapLibre map instance to `airport-editor/page.tsx`
   (or a new sub-component it renders) showing the airport's current real basemap + whatever
   zones/nodes are already curated, centered on the airport being edited.
2. **Click-to-place mode.** A toggle ("Add counter/door/checkpoint") that, when active, listens for
   a map click and captures the exact `lngLat` at that point (MapLibre gives this natively via the
   click event — no computation needed).
3. **Naming + categorization form on click.** On capture, prompt for: category (`checkin` |
   `security` | `gate` | `lounge` | `restroom` | `train` | `baggage`), name, airline (optional,
   drives the Duffel logo lookup already built in `poiDetail.ts`), airline IATA code, door label
   (optional). Save as a new `PoiDefinition` + `GraphNode` pair, following the exact shape already
   used in `sea.ts`.
4. **Reference-image assist (optional but valuable):** let the curator paste in a reference image
   URL or upload a screenshot (e.g. the airport's public wayfinding map) to display alongside the
   live map in a split view, purely as a human visual aid for "where does this go" — this is not
   image alignment/overlay, just a side-by-side reference panel.
5. **Reuse the existing draft → preview → confirm → publish flow** — new POIs go into a draft
   `AirportLayoutPackage`, require the existing visual-preview confirmation before publishing, same
   as OSM-imported data. Don't create a second publish path.
6. **Make it airport-agnostic from day one.** This tool must work for any IATA code already in (or
   addable to) `LAYOUT_REGISTRY`/`AirportLayoutPackage`, not hardcoded to SEA — confirm the editor
   already supports selecting/switching airports (it should, given the review-queue is generic) and
   wire the new map/click tool the same way.

## What NOT to do

- Do not build image alignment/homography/warping between a reference screenshot and Kepi's map —
  unnecessary and much more error-prone than clicking directly on Kepi's own already-accurate map.
- Do not let this bypass the existing preview-confirmation gate before publish.
- Do not hardcode this to SEA — every part of this must work by airport code, generically.
- Do not remove or replace the existing OSM-import/review-queue flow — this is an addition to it,
  for the detail OSM can't provide (specific counter/checkpoint placement within a hall).

## Execution order

1. Read `airport-editor/page.tsx`, `airportLayoutPackage.ts`, the admin API routes, and
   `AirportNavigatorMap.tsx`'s MapLibre setup conventions. Summarize the current editor flow in
   plain English before building.
2. Add the interactive map + click-to-place mode to the editor.
3. Wire the naming/category form and POI creation, following existing `PoiDefinition`/`GraphNode`
   shapes exactly.
4. Wire new POIs into the existing draft → preview-confirm → publish flow — no new publish path.
5. Add the optional reference-image side panel.
6. Confirm it works for SEA first (finish the doors/counters/checkpoints still wrong), then confirm
   the same tool works if pointed at a second airport with no code changes — only data changes.
7. Add tests: click capture produces valid `PoiDefinition`/`GraphNode` shapes, draft/publish gating
   still enforced, airport-agnostic behavior (works with any registered IATA code).
8. Add a design law documenting this as the standard method for hand-curating counter/checkpoint-
   level detail per airport going forward. Add the test file to the test index.
9. Run `npm run test:laws && npm run build` before push.

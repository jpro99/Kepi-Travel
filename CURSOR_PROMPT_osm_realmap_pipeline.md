# Real airport maps from OpenStreetMap — verify first, then build

Source: product discussion 2026-07-06 (OSM-based real-map proposal, reviewed against Atrius
research). The underlying idea is good and worth pursuing — replace square-box schematics with
the airport's real shape, for free, and keep Kepi's routing brain as the actual differentiator.
But the plan as originally written assumes OpenStreetMap already has rich, shop-level indoor data
for most major airports. Real-world OSM indoor coverage is inconsistent and often sparse even at
big hubs, and there isn't yet a settled community tagging convention for something as basic as a
security checkpoint. **That assumption is unverified and load-bearing — verify it before writing
any import tooling, not after.**

Route through `kepi-conductor` → `kepi-map-bot` / `kepi-airport-bot`. Standing rules: read
`CLAUDE.md` / `AGENTS.md` / `KEPI_DESIGN_LAW.md` first, diagnose before editing, design law + test
per behavior change, `npm run test:laws && npm run build` before push. Do not proceed to the next
phase until the current one's findings/checks are in hand.

---

## Phase 0 — VERIFIED (2026-07-06, owner spot-check) — proceed to Phase 1

Owner manually checked openstreetmap.org for two airports directly:
- **LAX (large hub):** rich indoor data — numbered gates, real named tenants (Starbucks, See's
  Candies, Wolfgang Puck, Hudson Booksellers, etc.), terminal building shapes, parking structures.
  Matches or exceeds the original pitch's assumption.
- **PSP / Palm Springs (small regional):** sparser, but real building shapes for Center Terminal
  and Bono Concourse plus several named amenities are present. Confirmed finding: a small airport
  doesn't need much data to be useful — one terminal, one security checkpoint, a handful of
  airlines is inherently a simpler wayfinding problem than a hub, so "thin" data is sufficient
  here, not a blocker.

**Conclusion: proceed to Phase 1.** Coverage is good at hubs and workable at small airports.
Still worth a quick same-style check on any specific airport before importing it for the first
time (cheap, five minutes, same method — look it up on openstreetmap.org zoomed to the terminal),
but this is no longer an open research question blocking the whole plan.

Original Phase 0 instructions (kept for reference / for spot-checking future airports):

- Query OpenStreetMap directly for SEA (via the Overpass API or by inspecting openstreetmap.org
  zoomed into the airport) for what indoor-relevant tags actually exist: `indoor=*`,
  `aeroway=gate`, `aeroway=terminal`, `level=*`, security-related tags, shop/POI tags inside the
  terminal.
- Report honestly: is there a real indoor graph (gates, levels, security areas, shops) or mostly
  just the outdoor terminal building footprint? Compare against what the original pitch assumed
  ("down to shop level").
- Do the same quick check for one or two other airports Kepi cares about, so the finding isn't
  just "SEA specifically is good or bad" — get a sense of the realistic spread across airports.
- **Decision point:**
  - If indoor data is genuinely rich → proceed to Phase 1 as originally envisioned (real import +
    cleanup pipeline).
  - If indoor data is thin (real building shape, but little/no gate/security/shop detail) → the
    honest version of this project is "use OSM's real outdoor/building shape as a much better
    visual base than square boxes, for free, and continue hand-curating the indoor routing graph
    on top of it" via the existing `AirportPackage` admin curation workflow
    (`CURSOR_PROMPT_airport_package_pipeline.md`) — not a fully-automated per-airport import.
    Say so plainly rather than forcing the original pitch to fit.

## Phase 1 — Import pipeline (only if Phase 0 confirms real indoor data exists)

- Build a one-time OSM-to-`AirportLayout` import step: pull the real terminal/concourse building
  shapes, gates, and whatever indoor detail genuinely exists, and convert into Kepi's existing
  `AirportLayout` model (zones, nodes, edges) — reuse the existing types, don't invent a parallel
  geometry model.
- This feeds the `AirportPackage` pipeline already planned — imported/cleaned data becomes a
  draft package that still goes through the existing admin validation + **visual preview
  confirmation** step before publish (per `CURSOR_PROMPT_airport_package_pipeline.md` — that
  requirement stands regardless of data source; imported OSM geometry needs the same human sanity
  check as hand-curated data, maybe more so since it wasn't Kepi-authored).
- Attribution: store and surface "Map data © OpenStreetMap contributors" per package, satisfying
  the ODbL attribution requirement.
- **Before shipping, do a quick real read of OpenStreetMap's ODbL license text** (not just assume
  "attribution and you're clean") — specifically the distinction between a "produced work"
  (rendering a map, which likely only needs attribution) and a "derivative database" (extracting
  and restructuring OSM's data into Kepi's own routing graph, which may carry share-alike
  obligations on that structured data). This is a five-minute check, not a blocker, but it
  shouldn't be skipped before this ships commercially.
- Fallback ladder stays: OSM-derived real map → Kepi hand-curated schematic → official
  `OfficialAirportMapLink` out → honest "not available" state. Never silently fall back further
  than the traveler can tell.

## Phase 2 — The direction arrow and honest position UX (buildable regardless of Phase 0's outcome)

This is the standout idea in the original pitch and doesn't depend on OSM data quality — it's UI
polish on top of whatever route/position data already exists.

- Add a compass-heading-driven direction arrow: use the phone's compass heading (not just the
  route polyline) so the on-screen arrow points the way the traveler is actually facing —
  "turn this way," not a line they have to mentally rotate against their own orientation.
- Landmark-based instructions ("120 feet, bear left past the coffee shop, checkpoint ahead") —
  check whether `RouteInstruction`/`TurnInstruction`'s existing `landmark` field already supports
  this before adding new fields.
- **Tap-a-marker-for-info callout, on the real map too:** the schematic view already renders this
  — a point with a leader line elbowing out to a label bubble (see `AirportSchematicLayer`'s
  `selectedPoi` block in `AirportNavigatorMap.tsx`). Extend that exact pattern to render over the
  OSM-derived real map rather than building a new callout system. Tapping "Alaska Airlines" (or a
  gate, or the one security checkpoint at a small airport like PSP) should show the same kind of
  label: what it is, and — where relevant — what to do there ("this is the ticket counter,"
  "PreCheck lane here," "your gate — boards in 45 min").
- "I'm here" tap-to-confirm: this is largely already the right shape in the existing honesty-first
  position logic (`positionFusion.ts` — `user_confirmed` fixes already get the highest
  confidence). Confirm what's missing is specifically the *UI gesture* (tap a gate/checkpoint on
  the map to lock in position) rather than assuming new confidence-scoring logic is needed —
  extend, don't duplicate.
- Fix the "destination label disappears on tap" bug Jeff hit previously — reproduce it first, find
  root cause, then patch (per this repo's standard diagnose-before-edit rule).
- Add a design law + test for the direction-arrow behavior and the tap-to-confirm gesture.

## Phase 3 — Only after Phases 0–2 are real, decide on "every airport follows the same recipe"

Do not promise or plan for full-coverage rollout until Phase 0's finding is known across more than
one airport. If data richness varies a lot by airport (likely), the realistic plan is a per-airport
decision — some get the full OSM-import treatment, others get "better base shape + hand-curated
graph," others stay pure schematic — not a single uniform recipe applied blindly everywhere.

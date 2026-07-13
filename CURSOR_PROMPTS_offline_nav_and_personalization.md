# Cursor build prompts — offline nav, walking-time learning, booking briefing, input personalization

Source: product discussion 2026-07-06. Each section below is a **self-contained prompt** —
paste one at a time into Cursor (route through `kepi-conductor` first; it should hand off to
the relevant domain bot). Do them in the listed order — later prompts assume earlier ones
exist. Every prompt inherits the repo's standing rules: read `CLAUDE.md`, `AGENTS.md`,
`KEPI_DESIGN_LAW.md` first; discuss-and-propose for anything ambiguous; add a design law +
test for each new behavior; `npm run test:laws && npm run build` must pass before push; commit
and push directly to `main` per owner preference.

Already shipped this session (context, not a to-do): forwarded-reservation confidence/plausibility
gate, dinner/excursion type detection, `/api/ocr` stub fix — see `KEPI_DESIGN_LAW.md` D10–D13.

---

## Prompt 1 — Offline airport map prefetch + lifecycle

Route to: `kepi-airport-bot`

We want the curated airport layout (`AirportLayout` / `AirportTerminal3DModel` in
`src/lib/airportNav/types.ts`) available on-device *before* the traveler needs it, and cleaned
up when it's no longer needed — not because storage is tight (these are small vector/graph
files, not imagery), but because airport WiFi/cell coverage is unreliable exactly where
navigation matters most (international arrivals, jetbridges, basements).

Requirements:
- When a trip has a confirmed itinerary with known airport IATA codes, prefetch each airport's
  curated layout **24–48 hours before the scheduled arrival** at that airport (use existing
  trip/flight timing data — `flightArrivalAirport`, scheduled arrival time).
- Cache client-side so navigation still works with no network (reuse the existing offline
  infrastructure pattern already in the repo — see `offlineOutbox.ts` /
  `offline-outbox-replay.spec.ts` — don't invent a second offline-storage mechanism).
- **Eviction rule — check the rest of the itinerary, not just "did we leave":** only delete a
  cached airport layout once that IATA code does not appear in any *remaining* leg of the same
  trip. A layover or a round-trip through the same hub must not get its map deleted after the
  first departure only to be re-downloaded a few hours later.
- If an airport wasn't prefetched (unplanned diversion, last-minute change), fall back to a live
  fetch if network allows; if no network and no cached layout, fall back to text-only
  instructions (the data model already supports this — `landmark` fields, `RouteInstruction.text`).
- No layout exists yet for most airports (only SEA is curated) — this prompt is about the
  prefetch/eviction *mechanism*, not authoring new airport layouts.

Add a design law (`KEPI_DESIGN_LAW.md`, DATA/API or a new AIRPORT NAV section) documenting the
prefetch window and the "check remaining itinerary before evicting" rule, with a test.

---

## Prompt 2 — Offline destination city map (works without cell data, using the phone's own GPS)

Route to: `kepi-map-bot`

Same idea as Prompt 1, one level up: when someone lands, they may have no cellular data (no
roaming, dead zone, cheap local SIM not active yet) but their phone's GPS chip still works fine
completely offline — GPS is a passive satellite signal, only the *map tiles* require a network
fetch. So: pre-download a regional map bundle for the destination city before the trip, and
position the live GPS fix against that already-downloaded map instead of fetching tiles live.

Requirements:
- For each trip leg's destination city (not just the airport — the city/region covering the
  itinerary's hotel and points of interest), prefetch a regional offline map bundle in the same
  24–48h pre-arrival window as Prompt 1.
- Respect the existing MapLibre constraint in this repo (`CLAUDE.md`: "MapLibre: inline style
  objects only (CSP)") — use whatever MapLibre-compatible offline mechanism fits that constraint
  (e.g. a self-hosted regional vector tile bundle such as PMTiles/MBTiles cached via IndexedDB).
  Propose the specific mechanism before implementing — don't assume one without checking it's
  compatible with the CSP rule.
- The phone's live GPS should render against the cached offline bundle when there's no network,
  falling back to normal live tiles when connectivity is available.
- Same eviction rule as Prompt 1: evict a city's cached map only once that city doesn't appear
  again later in the same trip.

Add a design law + test documenting this (which map layer is offline-capable, the eviction rule).

---

## Prompt 3 — Learn real walking times and security wait times from actual usage

Route to: `kepi-airport-bot`

`GraphEdge.traverseSeconds` / `NavGraphEdge.traverseSeconds` are currently hand-estimated at
curation time. `SecurityLaneDef.estimatedWaitMin` already has a `source: "crowd"` option that's
unused. Real travelers moving through the airport with the nav UI open already generate the
signal needed to calibrate both — no new instrumentation category needed, just persistence.

Requirements:
- The journey state machine (`journeyMachine.ts`) already produces timestamped, confirmed
  waypoint events (`user_confirmed` position fixes, phase transitions, `arrived_at_route_end`).
  Persist elapsed time between consecutive confirmed waypoints per trip, keyed to the graph
  edges/segments traversed.
- Aggregate to a median (or a low/typical/high spread, which maps directly onto the existing
  `"sprint" | "default" | "accessible"` route profiles) per edge — never store or expose an
  individual's raw trajectory; this is aggregate calibration data, not per-person tracking.
- Trim outliers before aggregating (someone who stopped at a shop mid-walk shouldn't skew the
  edge's typical time) — apply the same plausibility-check discipline already used for
  reservation parsing this session (`reservationPlausibility.ts` is the pattern to follow, not
  reuse directly).
- Do not let a single-airport, single-user sample override the curated default — require a
  minimum sample count per edge (propose a number, e.g. 5–10 confirmed traversals) before a
  learned value is trusted over the hand-curated one. Below that threshold, keep using the
  curated estimate.
- Feed the same confirmed-waypoint timestamps into `estimatedWaitMin` for security lanes
  (time between `security_entry` and `security_exit` confirmation), populating the existing
  unused `"crowd"` source.

Add a design law + test for: the minimum-sample gate, and "learned values never silently
override curated ones below the threshold."

---

## Prompt 4 — Two-stage post-booking briefing (credentials/lounge/checkpoint)

Route to: `kepi-conductor` (spans points/card + airport bots)

Requirements:
- **Stage 1, right after booking:** an eligibility overview only — "you have TSA PreCheck and
  Clear," "you have lounge access via [card/membership]" — using existing
  `TravelerCredentials` / `loungeMemberships` data. Do not name specific checkpoints, lanes, or
  gates at this stage — they aren't reliably known this far out.
- **Stage 2, closer to departure** (check-in opens or gate is assigned): the specific,
  actionable version — which checkpoint and lane to use and where it is, which lounge and where
  it sits relative to the gate, using the existing `LoungeEligibilityResult` /
  `SecurityLaneDef` / landmark data. Fall back to plain text directions when the map can't show
  something (data model already supports this via `landmark`/`spokenText`).
- Stage 2 must **regenerate if the gate or lounge assignment changes** after it was first shown
  — never leave a stale specific instruction displayed.

Add a design law covering the two-stage timing rule (don't show specific locations before
gate assignment) + a test.

---

## Prompt 5 — Learn how each traveler prefers to input information (not just what they prefer)

Route to: `kepi-conductor` → likely `kepi-points-bot` or wherever `traveler-genome` lives

This is a different layer from travel preference learning (Travel Fit / `traveler-genome`
already covers "what hotels/airlines does this person like"). This is about *how* a person
prefers to give Kepi information at all.

Requirements:
- For every reservation/note a user creates, record (alongside the data itself): which channel
  it came through (email-forward, gmail-import, manual typed note, voice, scan), and whether it
  needed correction after parsing (reuse the review-queue/gate data already being captured per
  this session's work — `evaluateForwardedReservationGate`, `reasons` array — as the correction
  signal).
- Build a per-user profile of input style over time (preferred channel, typical verbosity,
  correction rate by channel) — extend `traveler-genome`, don't create a parallel profile store.
- **Require repeated evidence before treating a pattern as real** — one voice note doesn't mean
  someone prefers voice. Propose a minimum occurrence count (mirrors the min-sample-size gate in
  Prompt 3) before surfacing anything based on this profile.
- Once a pattern clears that bar, **suggest, never silently change**: e.g. "you usually just
  forward the email — want to do that instead?" The UI must not rearrange input options or
  change tone automatically without the user seeing and accepting the suggestion — this
  preserves the calm/predictable product feel (`KEPI_DESIGN_LAW.md` G4).

Add a design law covering "personalization based on behavior must be offered, never silently
applied" + a test for the minimum-evidence gate.

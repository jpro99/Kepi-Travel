# Official airport map vendor embed — research task, then a gated Cursor prompt

**STATUS (2026-07-06): DEPRIORITIZED.** Atrius pricing is enterprise-sales-only with no public
rate card; case studies are all major-hub/airline-scale deals (Heathrow, JFK, Dublin,
Austin-Bergstrom) — likely not accessible at Kepi's current scale. One no-cost outreach email
was sent (see below) and that's the full extent of effort for now. **Do not pursue Part 2, and
do not restart Part 1 as an active research push,** until Atrius responds with real terms or
Kepi's scale changes meaningfully. See `KEPI_PROJECT_MEMORY.md` for the standing decision.

Source: product discussion 2026-07-06, prompted by the flysea.org (Atrius) screenshots. This is
two stages, in strict order. **Do not start the Cursor prompt in Part 2 until Part 1 is
answered** — the integration approach depends entirely on what the research finds.

---

## Part 1 — Research & outreach task (do this first — not a coding task)

Goal: find out whether Kepi can embed a professional indoor-mapping vendor's live map and
positioning (like the Atrius map at SEA) instead of trying to build photorealistic, storefront-
accurate maps in-house — and what that would actually cost and require.

### What to find out

1. **Vendor landscape.** Atrius (part of Acuity Brands) is confirmed at SEA, JFK, Heathrow,
   Dublin, and Austin-Bergstrom. Check which other airports on Kepi's likely traveler routes have
   an Atrius deployment (look for the "Atrius" or "maps.[airportcode]airport.com" pattern, or the
   small Atrius logo on the airport's own map page). Also check for competing indoor-mapping
   vendors at airports Atrius doesn't cover (Mappedin, Jibestream/Esri Indoors, and others) — this
   isn't a one-vendor answer, coverage will be a patchwork across different airports.
2. **Partner/embed terms.** Atrius markets a "Wayfinder Mobile SDK" / "Embedded Maps" feature
   explicitly for third-party apps (already used by airline apps for "mobile app-led personalized
   travel itineraries"). Find out: cost structure, minimum commitment, whether it's available to
   a company Kepi's size (vs. only airline/airport-scale contracts), contract length, and any
   exclusivity restrictions.
3. **What data actually comes with the embed.** This is the most important technical question.
   Does the SDK hand over just a rendered visual map (a picture you can show, with no routable
   data underneath), or does it expose actual POI/geometry data Kepi could route against? If it's
   visual-only, Kepi's own credential-aware routing logic (PreCheck/Clear lane selection, lounge
   eligibility routing — the actual differentiator) still needs to run on Kepi's own schematic
   model underneath or alongside the embedded visual, not replace it.
4. **Positioning.** Atrius Navigator is a separate indoor-positioning product. Find out if it's
   bundled with the map embed or licensed separately, and what infrastructure it depends on
   (Bluetooth beacons installed by the airport, WiFi RTT, etc.) — if the live dot depends on
   infrastructure Kepi doesn't control, confirm it's genuinely available per-airport, not just in
   Atrius's marketing materials.
5. **Cost/coverage reality check.** Given Kepi's current scale, is this financially realistic now,
   or is it a "revisit once Kepi has real usage volume" decision? Be honest about this rather than
   assuming yes.

### Deliverable

A short written comparison memo — not code — covering: which vendor (if any) covers which
airports Kepi's travelers actually use, what the embed/API terms and cost look like, whether
routable data comes with it or just visuals, whether positioning is included, and a clear
recommendation: pursue now / pursue later / not worth it at current scale. Bring this back before
any of Part 2 gets built.

---

## Part 2 — Cursor prompt: gated embed integration (only after Part 1 has real answers)

Route to: `kepi-map-bot` / `kepi-airport-bot` via `kepi-conductor`. Standing rules apply: read
`CLAUDE.md` / `AGENTS.md` / `KEPI_DESIGN_LAW.md` first, diagnose before editing, minimal surgical
changes, design law + test per behavior change, `npm run test:laws && npm run build` before push.

**Do not run this until Part 1's memo exists and names at least one real, confirmed vendor
relationship with known terms.** This prompt assumes that answer is in hand.

### What to build

- Kepi already has `OfficialAirportMapLink` (linking out to an airport's official map) and the
  self-curated `AirportPackage` pipeline (see `CURSOR_PROMPT_airport_package_pipeline.md`) for
  airports Kepi curates itself. This adds a third source, not a replacement for either: a
  **vendor-embedded map** for airports where Part 1 confirmed a licensable relationship.
- First, read the current `OfficialAirportMapLink` component and the `AirportPackage` model
  (`source: "seed" | "db"`) to understand exactly what exists before adding to it. Extend the
  `source` field to include `"vendor_embed"`, with vendor name and embed config, rather than
  building a parallel map-selection system.
- **Resolution order stays: does this airport have a licensed vendor embed? → does Kepi have a
  curated package (seed or db)? → officialAirportMapLink out → 404.** Do not regress any existing
  path — the vendor embed is additive.
- If the vendor's data is visual-only (per Part 1's finding): the embedded vendor map becomes the
  *visual* layer the traveler sees and interacts with for detail/browsing, while Kepi's own
  schematic/graph model — already built — continues to own the actual routing decision (which
  security lane, which lounge, credential-aware). Do not silently drop Kepi's routing logic in
  favor of the vendor's map just because it looks better; the routing intelligence is what Kepi
  offers that the vendor's own map doesn't.
- If the vendor's SDK does expose positioning (per Part 1's finding): wire it in as a new
  `IndoorPositionFix.source` alongside the existing `"os_indoor" | "gps_snap" | "dead_reckoning" |
  "user_confirmed"` — same honesty rules apply (never silently trust a fix that hasn't earned
  confidence, per the existing `positionFusion.ts` logic). Do not bypass that calibration just
  because the new source sounds more precise on paper — confirm it in practice first.
- Add a design law documenting: which airports use the vendor embed, the resolution order, and
  the rule that Kepi's own routing logic stays authoritative even when a vendor map is shown. Add
  a test for the resolution-order logic.

### What NOT to do

- Do not sign or imply any commercial commitment in code — this prompt is purely the integration
  work assuming Part 1's business terms are already settled by the owner.
- Do not remove the existing self-curated `AirportPackage` pipeline or `OfficialAirportMapLink` —
  this is additive, for whichever airports have a confirmed vendor relationship. Most airports
  still won't, and Kepi's own schematic + curation pipeline remains the primary path.

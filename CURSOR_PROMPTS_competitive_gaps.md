# Cursor build prompts — closing competitive gaps (flight-status speed, wallet handoff, ground transport)

Source: competitive research + product discussion 2026-07-06 (TripIt, Flighty, App in the Air,
Mindtrip, Zenvoya, TripsHub reviewed). Paste one at a time into Cursor, route through
`kepi-conductor` first. Same standing rules as always: read `CLAUDE.md` / `AGENTS.md` /
`KEPI_DESIGN_LAW.md` first, diagnose before editing, minimal surgical changes, add a design law
+ test per behavior change, `npm run test:laws && npm run build` before push, push directly to
`main`.

Do these in order — Prompt 1 is the highest-value, do it first.

---

## Prompt 1 — Upgrade flight-status speed/accuracy to close the gap with Flighty

Route to: `kepi-flight-bot`

Flighty's whole edge over every other trip app is speed and authority of flight-status data —
it uses FAA data and ADS-B signals directly, so it flags delays, gate changes, and cancellations
before the airline's own notification goes out. That's the single clearest gap Kepi has against
a best-in-class competitor, and disruption handling is core to the product promise ("you don't
have to think about anything at the airport") — being slow to notify undercuts that promise more
than any missing feature would.

Requirements:
- **First, diagnose before changing anything:** read `src/lib/travelAssistant/flightStatusProvider.ts`
  and the `providers/` directory to confirm the current data source (engineering notes reference
  `AVIATIONSTACK_API_KEY`) and its actual update latency and gate-change accuracy. Don't assume —
  verify what we have today.
- Research and propose (don't just implement) whether a faster/more authoritative source is
  realistic to add or switch to — e.g. an ADS-B-based feed (FlightAware AeroAPI or similar) or a
  direct airline data feed where available. Compare cost and latency against the current source
  before recommending a change.
- Preserve the existing `flightStatusProvider` interface/abstraction — this should be a provider
  swap or a secondary source merged in, not a parallel system. If multiple sources disagree,
  prefer whichever is more authoritative/fresher, and log the discrepancy (this is exactly the
  kind of "trigger" signal from the earlier plausibility-check/data-engine discussion — worth
  capturing for future calibration, not just resolving silently).
- Add a design law documenting the chosen source and the freshness/latency bar it must meet, with
  a test.

---

## Prompt 2 — Wallet-pass handoff at check-in and boarding

Route to: `kepi-flight-bot` / `kepi-conductor`

The actual scannable boarding-pass barcode is a standardized format (Apple/Google Wallet passes,
IATA barcode) that airlines mostly don't expose to third parties — Kepi shouldn't try to
reinvent or fake this. The realistic, honest win is owning the moment *around* it: know exactly
when check-in opens, prompt for it, and hand off cleanly into the traveler's native wallet
instead of making them go find the airline app themselves.

Requirements:
- Detect when check-in opens for a booked flight (typically 24h before departure — confirm the
  real rule per airline if it varies) and surface a clear, timely prompt: "Check-in is open for
  [flight] — check in now."
- Where the airline/provider (Duffel, etc.) can hand back a wallet-pass-compatible boarding pass
  after check-in, wire that straight into Apple Wallet / Google Wallet from inside Kepi. Where it
  can't (most airlines), deep-link into the airline's own check-in flow instead of leaving the
  user to search for it themselves.
- Once a boarding pass exists (in Wallet or otherwise), surface it as a prominent one-tap card on
  Home during the airport/boarding phases — Kepi should be the thing that gets you to your pass
  fastest, even if it doesn't render the scannable barcode itself.
- Be explicit in the UI about what Kepi does and doesn't hold (don't imply Kepi has a boarding
  pass it doesn't actually have) — this is a trust issue, not just a UX one.
- Add a design law + test for the check-in-window detection timing rule.

---

## Prompt 3 — Native ground-transport booking (Uber/Lyft), not just tracking

Route to: `kepi-map-bot` / `kepi-conductor`

`rideStatusProvider` already exists for tracking ride-type reservations. Uber has a partner
ride-request API — booking a ride directly inside Kepi (not just deep-linking out to the Uber
app) is realistic and removes one more app from the stack.

Requirements:
- First read the existing `rideStatusProvider.ts` / `ride` reservation type handling to confirm
  what's tracked today vs. what would need to change for actual in-app booking.
- Propose (before implementing) whether to integrate Uber's partner API directly, or start with
  a well-placed deep link that at least pre-fills pickup/dropoff from the trip's known airport
  and hotel locations — the deep-link version is a much smaller, faster win and may be the right
  first step even if full native booking comes later.
- If proceeding with native booking: reuse the existing reservation data model (pickup/dropoff,
  timing) rather than building a parallel ride-booking flow.
- Add a design law + test once the approach is decided.

---

## Prompt 4 — Scope-only memo: group planning and conversational booking (no code yet)

Route to: `kepi-conductor`

Both Mindtrip (group collaboration, shared itineraries) and Zenvoya/Mindtrip-style conversational
natural-language booking are real capabilities competitors have that Kepi doesn't. Neither should
be built yet — both are big enough decisions (audience scope for group planning; a real UX shift
for conversational booking on top of the existing Duffel/LiteAPI search-and-book flow) that they
need an explicit go/no-go, not a default build.

Requirements:
- Do not write implementation code for this prompt.
- Produce a short written memo (per `CLAUDE.md`'s discuss-before-code rule) covering, for each of
  the two capabilities: what it would take to build (rough scope), what it would cost in
  engineering time, whether it fits Kepi's current premium solo/family-traveler audience or would
  require broadening scope, and a recommendation (build now / build later / don't build).
- Wait for explicit approval on the memo before any of it becomes a build prompt.

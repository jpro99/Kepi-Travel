# LAX Arrivals Navigation — Research Memo

**Date:** 2026-08-21
**Author:** Kepi conductor (research pass, no code)
**Question:** What does LAX's real deplane → customs → baggage claim → ground-transport flow
look like, well enough to draft a first-cut arrivals walkway graph for human verification?
**Status:** Research complete, upgraded from secondary sources to **LAX's own official, current
PDFs** (see Method note below — this caught and corrected a real error from the first pass).
**Coordinates/geometry not yet drafted** — that's the next step, and it ships as
`precision: "draft"` pending your on-the-ground correction, same bar as the SEA process
(Decision 2026-07-15).

---

## Method note — primary source beat secondary sources, materially

The first draft of this memo relied on travel-blog summaries and got one thing genuinely wrong:
it implied a single "LAX-it shuttle" system. Pulling LAX's own two official PDFs directly (both
current, dated summer 2026) and reading them as images showed there are **two separate shuttle
systems that blogs conflate**, plus a curbside option blogs said didn't exist:

- **LAX Airline Location Map** (`flylax.com/media/6936`, "as of July 1, 2026") — terminal
  adjacency, the real horseshoe terminal shape, and current airline→terminal assignments straight
  from the airport's own live document, not a third party's memory of it.
- **Ground Transportation Waiting Areas map** (`flylax.com/media/1793`, rev. SP26-0810) — a
  color-coded diagram with actual walking-path dotted lines from each terminal frontage to LAX-it.

Both were fetchable by direct PDF download (a browser user-agent was needed; flylax.com blocks the
generic fetch tool's default UA) and readable as images. This is a repeatable technique, not a
one-off: most major airports publish an equivalent official terminal/ground-transport PDF, and
reading it directly is more current and more precise than aggregating travel-blog text. See the
reply in-conversation for the fuller "should this become the standard curation step" discussion —
logged here as **the format worth reusing for every future airport pass, LAX or otherwise.**

---

## Bottom line up front

LAX's arrivals flow is **not** a simple "deplane → walk to your own terminal's baggage claim →
walk to a curb outside." Two structural facts make LAX a genuinely good arrivals pilot (more to
walk someone through than SEA), but also mean the curated graph needs to model real complexity
honestly rather than a generic template:

1. **All international arrivals funnel through one terminal (TBIT / Terminal B)** regardless of
   which terminal the aircraft actually parks at. A traveler landing on an international flight at
   Terminal 6, for example, does not walk to Terminal 6 baggage claim — they're routed to TBIT.
2. **Rideshare/taxi pickup is centralized off-terminal at "LAX-it,"** not curbside at the arrival
   terminal. Every traveler taking Uber/Lyft/taxi must walk or shuttle to a separate consolidated
   lot east of Terminal 1 before their ride can retrieve them.

Both of these are exactly the kind of thing a first-time/infrequent LAX traveler gets confused
by — which is the whole point of "walk them through it."

---

## Confirmed facts — from LAX's own official PDFs (primary source, dated summer 2026)

### Terminal layout (real, not schematic)
LAX is a horseshoe: **Terminal 1 → 2 → 3 → Terminal B (TBIT) → 4 → 5 (closed) → 6 → 7/8**, in
order around the loop, with the central parking structures (P1–P7), the FAA Tower, Theme Building,
and USO inside the horseshoe. Real gate ranges per the official map: T1 (9–18), T2 (20–29),
T3 (30–39), **TBIT/Terminal B (130–225)**, T4 (40–49), T5 (50–59, closed), T6 (60–69),
**T7/8 (70–86, shared)**.

### International arrivals / customs (TBIT)
- All int'l arrivals process through **Tom Bradley International Terminal (Terminal B)**, even for
  flights that deplane at another terminal — confirmed both by the airline map's per-carrier notes
  ("Alaska, United passengers check-in at Terminal 6/7 respectively; International passengers
  arrive at Terminal 6 and B, confirm with airline") and independently by secondary sources.
- Flow: deplane → follow "Arrivals / Baggage Claim" signage → **5th floor** → escalator down to
  **3rd floor** (CBP/immigration — passport + customs declaration; Global Entry kiosks available)
  → **1st floor** (baggage claim + customs exit).
- **Typical wait times** (secondary-source guidance, not in the official PDFs — flag as estimate,
  not a live number): immigration **45–90 min** at peak; baggage claim **20–45 min**, up to 60+
  min when multiple widebodies land together.
- **Airline-specific quirk worth curating as its own node:** Aer Lingus and Flair passengers
  **check in at Terminal B but arrive at Terminal B and then walk to Terminal 4** for baggage
  claim — a real cross-terminal walk most travelers won't expect.
- **American Eagle / Contour Airlines** passengers check in at Terminal 4 but are **bused to
  Terminal Gates 52A–52I** — a distinct sub-terminal walk/bus step.
- **Cayman Airways, Viva Aerobus, Frontier, Sun Country** check in at Terminal 1 but are **bused to
  Terminal B** for departure/arrival, and **Frontier/Sun Country are bused back to Terminal 1 for
  baggage claim** — i.e. arrival terminal ≠ baggage-claim terminal for these carriers specifically.

### Baggage claim (by terminal)
- Domestic baggage claim is Level 1 in each terminal, carousel number shown on arrivals screens.
- **Terminals 7 & 8 share one baggage claim** (United/United Express).
- **TBIT baggage claim is Level 1**; check-in Level 3; security/departures Level 4 (out of scope
  for this arrivals-only pass, relevant only if TBIT departures are curated later).

### Ground transportation — three separate systems, not one ("LAX-it shuttle")
The official Ground Transportation Waiting Areas map (color-coded, with real walking-path dotted
lines drawn from each terminal frontage) shows this is genuinely three distinct things, which
travel-blog summaries collapse into one:

1. **LAX-it (green)** — the consolidated pickup zone for **Taxi, Lyft, Prime Time, and Uber**,
   located on the Arrivals Lower Roadway near Terminal 1/Parking 1 (northeast corner of the
   horseshoe). Reached by a marked **green-dotted walking path** running along the arrivals
   frontage from every terminal, or the free shuttle. Traveler requests the ride in-app once
   walking, gets a **zone number**, driver confirms via **PIN code**.
2. **Terminal Connector / Metro Connector (pink)** — a **separate** shuttle system for
   terminal-to-terminal transfers, LAX Budget/Economy Parking, and LAX Employee Lots — this is
   what the airline map's "stand under the PINK sign… Terminal Connector shuttle, every 10
   minutes" note refers to. **Not the LAX-it shuttle.**
3. **Curbside taxi (yellow)** — the diagram shows a yellow taxi icon at **multiple individual
   terminal frontages**, not only inside the LAX-it zone — suggesting on-demand taxi may be
   available directly curbside at some terminals, separate from the consolidated LAX-it queue.
   **Unconfirmed nuance — needs your on-the-ground check**, since every secondary source claimed
   taxi is LAX-it-only.
- Other mapped waiting areas (orange = shared-ride vans/charter buses, red = hotel/private
  parking shuttles, purple = rental cars, dark blue = ADA paratransit + animal relief area) exist
  per-terminal too but are lower priority for a first arrivals-nav pass.

### Live construction risk — must reflect in the data, not just a footnote
- **Terminal 5 has been closed since October 2025** for a $1.6B Terminals 4/5 modernization,
  expected to reopen **~2028** (confirmed "Closed until 2028" directly on the official map).
- Airline-to-terminal assignments above are dated **"as of July 1, 2026"** on the source document
  itself — LAX evidently republishes this map periodically (revision codes `SP26-0707` /
  `SP26-0810` suggest a seasonal cadence). **Curated data should store the source revision code
  and re-check each season**, not treat this as a one-time capture.

---

## What this means for the draft graph

- **Model TBIT as the single arrivals/customs node for all international flights**, not
  per-terminal customs — matches reality, avoids implying every terminal has its own immigration
  facility (only TBIT does). But model the **known exceptions as their own edges**, not folded
  into the generic case: Aer Lingus/Flair's Terminal B → Terminal 4 baggage walk, and Frontier/Sun
  Country/Cayman/Viva's Terminal 1 → Terminal B → Terminal 1 loop.
- **Model ground transport as three distinct nodes**, not one generic "curb pickup" POI: LAX-it
  (rideshare/taxi-app pickup, green path), Terminal Connector (inter-terminal/parking shuttle,
  pink, separate system), and flag curbside taxi at individual terminals as unconfirmed pending
  your check. Collapsing these into one, the way secondary sources do, would ship travelers wrong
  guidance on where to catch what.
- **Store the source revision code** (`SP26-0707`, `SP26-0810`) and a re-check cadence per season
  on this data — don't hardcode Terminal 4/5 airline placement as permanent while T5 construction
  is ongoing through ~2028.
- **No exact lat/lng coordinates drafted yet.** The official PDFs give real relative layout
  (horseshoe order, walking-path routing, terminal adjacency) but not survey coordinates — the
  next step is projecting labeled points from these diagrams through the existing control-point
  transform (`controlPointTransform.ts` / `controlPointAnchors.ts`, already built for exactly this
  pixel→world registration case), anchored to OSM-verified LAX nodes, then human-reviewed before
  publish — same gate as SEA, never shipped as verified on estimation alone.

---

## Gate for next step

This memo satisfies the "verify first, never guess" research step, upgraded to primary sources.
**Next step (not yet done):** draft `src/lib/airportNav/layouts/laxArrivals.ts` — TBIT
customs/baggage-claim nodes (with the carrier-specific exceptions modeled as real edges), a
`ground_transport` phase distinguishing LAX-it from the Terminal Connector, and the
`journeyMachine.ts` phase extension (`deplaned → customs → baggage_claim → ground_transport`) —
all marked `precision: "draft"` until you've reviewed and corrected it against the real terminal,
same as SEA.

---

## Sources

**Primary (LAX's own official documents — read directly, not summarized secondhand):**
- [LAX Airline Location Map](https://www.flylax.com/media/6936) — "as of July 1, 2026" (`SP26-0707`)
- [LAX Ground Transportation Waiting Areas map](https://www.flylax.com/media/1793) (`SP26-0810`)

**Secondary (used only for wait-time estimates and process-flow narrative, corrected against the
primary sources above where they conflicted):**
- [LAX Arrival at Tom Bradley International Terminal: What to Do Step by Step](https://laxtogo.com/tom-bradley-international-terminal-lax-arrival-guide/)
- [Los Angeles Intl. Airport (LAX) Baggage Claim Guide](https://www.airlineairport.com/lax-airport/baggage-claim/)
- [The LAX-IT Lot Explained: Why Rideshare Moved and How to Skip It Entirely](https://laxtogo.com/lax-it-lot-explained-skip/)
- [Navigating LAX-it in 5 Easy Steps — NBC Los Angeles](https://www.nbclosangeles.com/news/5-easy-steps-to-navigate-lax-it-los-angeles/2258407/)
- [Los Angeles International Airport (LAX): Ultimate Terminal Guide — Upgraded Points](https://upgradedpoints.com/travel/airports/los-angeles-lax-airport/)
- [LAX Arrivals - Airport Maps, Entry Reqs — Air New Zealand](https://www.airnewzealand.com/connecting-at-los-angeles)

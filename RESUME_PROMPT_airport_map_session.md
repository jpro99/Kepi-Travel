# Resume prompt — paste this into a new Cowork session with Claude

I'm Jeff, owner of Kepi Travel (kepitravel.com, repo `jpro99/Kepi-Travel`, deployed on
Vercel). I've been working with you on a long debugging session about our airport indoor
maps and the conversation got too long/compacted. Read this, then read
`CURSOR_PROMPT_MASTER_airport_maps_all_airports.md` and `KEPI_PROJECT_MEMORY.md`
(both in the repo root) for full detail — this is just the summary to get you oriented.

## The core problem we've been solving

Our SEA (Seattle) airport map kept showing things in the wrong place — check-in counters,
gates, security in the middle of parking lots/roads. Root cause, found in stages:

1. Individual wrong coordinates.
2. A possibly self-intersecting terminal building polygon.
3. The real root cause: the "walkway" lines connecting points were a fake straight line
   drawn to the building's centroid — not real corridor data at all. That explains every
   symptom (curbs at building centers, floating security, gates on the apron).

## The permanent rule we landed on (already locked into Cursor's own memory)

**Never claim precision Kepi hasn't earned, for any airport, ever.**

- Where real ground truth exists (OSM-tagged gates/doors/shops/building shapes) — use it
  exactly, hard-enforced by a validator.
- Where it can never exist (security checkpoint exact location — confirmed structurally
  excluded from every public indoor-mapping source, including Apple's own IMDF standard,
  as deliberate policy, not a data gap) — say so honestly, never guess. Approximate zone +
  mandatory disclaimer only.
- No drawn walking route/line unless an airport's `routeGrade` is `"surveyed"` (real
  verified corridor data) — which is currently true for zero airports. Until then: accurate
  pins + honest approximate time estimate, no line.
- This applies identically whether it's airport #1 or #100 — the rules never change per
  airport, only how much of that airport's data currently passes them.

This is written up in full as `CURSOR_PROMPT_MASTER_airport_maps_all_airports.md` (repo
root), and is now wired into Cursor's own persistent systems in three places: the
`kepi-airport-bot` skill (`.cursor/skills/kepi-airport-bot/SKILL.md`), a Cursor rule
(`.cursor/rules/60-airport-map-master-prompt.mdc`), and `KEPI_PROJECT_MEMORY.md`.

## Where we are on shipping this

Confirmed shipped (verified directly against the repo, not just Cursor's say-so):
- M33 ground-truth conformance gate (gate-ref exact match, curb/road proximity,
  landside/airside topology, cross-category collision check, footprint containment gated
  on ring validity) — `osmGroundTruth.ts` + tests.
- The fake centroid-line walkway removed; `routeGrade` defaults to schematic (M30).
- The Alaska Airlines check-in node fixed to its correct real door (Door 24, north end) —
  confirmed via `sea.ts`.
- The Atrius official-map handoff feature (`OfficialAirportMapLink.tsx` +
  `officialWayfinding.ts`) — opens SEA's real Atrius map in a new tab when Atrius already
  covers an airport well, honest tiered messaging, Google-search fallback for airports with
  no curated resource. This already works; no new engineering needed here.

**Not yet confirmed shipped** (last check showed these still open):
- §3 of the master prompt: promoting real OSM-tagged shops/banks/restaurants/lounges into
  first-class map POIs (data already fetched via Overpass, just never converted into POIs).
- §5: the click-to-place admin correction tool in `admin/airport-editor`.
- §6: full 2D control-point georeferencing "instant draft" engine + complete airline
  coverage (we know of at least American, Frontier, Icelandair, Air France missing from the
  currently-hardcoded airline set of Alaska/Delta/United/Air Canada/Emirates).

## Key files

- `CURSOR_PROMPT_MASTER_airport_maps_all_airports.md` — the standing spec, read this first
  for anything airport-map related.
- `src/lib/airportNav/layouts/sea.ts` / `seaFootprints.ts` — SEA's curated layout + OSM
  building footprints.
- `src/lib/airportNav/osmImport.ts`, `osmGroundTruth.ts` — Overpass import + the M33
  validator.
- `src/lib/airportNav/officialWayfinding.ts`, `src/components/travelAssistant/OfficialAirportMapLink.tsx`
  — the Atrius/official-map handoff.
- `.cursor/skills/kepi-airport-bot/SKILL.md` — the dedicated bot that owns all indoor
  airport map work. Deliberately separate from `kepi-map-bot`, which owns the unrelated
  family/live-GPS map feature — do not comingle the two.

## Standing project rules (from CLAUDE.md — always apply)

- Diagnose before editing; minimal surgical fixes; verify after every fix.
- Discuss before code: if I ask "what's wrong" or "how should this look," analyze and
  propose only — no edits/push until I explicitly approve, unless I say "fix/push" in that
  same message.
- Always commit and push directly to `main` — no PRs/feature branches.
- `npm run test:laws && npm run build` must pass before every push.
- Add a design law + test for every behavior change.
- I'm not a developer — I build via Cursor, not directly. You (Claude/Cowork) diagnose,
  discuss, and write precise prompt `.md` files for me to hand to Cursor; you don't edit
  the live repo yourself for this project's app code.

## The open question right now

I compared Atrius's map (SEA's paid indoor-map vendor) against real OpenStreetMap.org data
at the same physical spot near the terminal. OSM showed shop/bakery names (Hudson, Alki
Bakery, Sourced Market, etc.); Atrius showed that same area as an airline zone. I asked
whether this means Kepi's data is wrong. Claude's answer: this doesn't threaten Kepi's
approach, since Kepi only uses OSM data internally (never Atrius's), and OSM's own shop
tags and door/gate tags share one coordinate system — they can't be "wrong relative to
each other." The real risk is narrower: specific airlines (Icelandair, Air France) likely
have no real OSM-tagged check-in coordinate at all yet, meaning whatever Kepi currently
shows for them is an unverified placeholder sitting near real shop data — not a broken data
source, just an airline-coverage gap, same category as the already-known American/Frontier
gap near Door 23.

A Cursor verification prompt for this exact question
(`CURSOR_PROMPT_verify_hudson_bakery_vs_icelandair_airfrance.md`) has been written — check
if it's already in the repo root; if not, or if you want it regenerated, ask Claude to
rewrite it.

Pick up from here — don't re-ask me to re-explain any of the above.

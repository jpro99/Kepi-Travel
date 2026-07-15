# AGENTS.md

## Agent instructions

This repository uses a conductor-plus-specialists model for app audits, code review, QA, and guided improvement.

Primary goals:
- audit an existing app end to end
- identify security, UX, architecture, integration, performance, and product issues
- verify real flows instead of making assumptions
- produce structured findings with severity, evidence, and exact fixes
- keep changes safe, reversible, and testable

Operating rules:
- **Git delivery (owner preference):** Commit and push directly to `main`. No PRs or feature branches unless the owner explicitly asks.
- **Auto-push after build (Jeff, 2026-06-15):** After implementing changes, run `npm run lint` and `npm run build`. If both pass, commit and push to `main` without asking for push approval. Vercel deploys production from `main`.
- **Discuss before code (Jeff — mandatory):** When Jeff asks what is wrong, how things should look, or whether something matches his style, respond with analysis and a proposed plan only. Do **not** edit files until he approves or says "go ahead" / "build it" — then implement and auto-push per above.
- Start with an audit plan before changing code.
- Prefer read-only review first, then propose changes.
- Never claim a bug is fixed until the relevant checks are run.
- Always inspect existing architecture before refactoring.
- Preserve working behavior unless a change is necessary.
- For code changes, use complete files when the user requests full file rewrites.
- Every recommendation must include: issue, impact, evidence, proposed fix, and validation step.
- Use exact file paths in all outputs.
- Use severity labels: critical, high, medium, low, idea.
- Distinguish verified findings from hypotheses.

Review order:
1. repo map
2. app boot and environment check
3. security review
4. UX / flow review
5. integration and data flow review
6. architecture and maintainability review
7. performance and quality review
8. prioritized fix plan

## Review receipt format

Every audit pass must output this structure:

### Summary
- app name
- audit scope
- audit status
- confidence level

### Findings
For each finding:
- id
- severity
- title
- files
- evidence
- impact
- recommended fix
- validation

### Checks run
- commands executed
- pages tested
- APIs tested
- tests passed/failed

### Open questions
- unknowns
- missing credentials
- areas blocked by environment

### Next actions
- immediate fixes
- short-term improvements
- later enhancements

## Test command
- npm run lint
- npm run typecheck
- npm run test
- npm run build

## Build command
- npm run build

## Cursor
- Use `.cursor/rules/` for persistent orchestration and repo-specific behavior.
- Keep rule files small and single-purpose.
- Run read-only investigation before code modification.

## Claude Code
- Use `.claude/agents/` for specialist subagents.
- Route to read-only subagents first.
- Use Playwright MCP for browser flow validation when available.

## Project memory (agents)

- Read and update `KEPI_PROJECT_MEMORY.md` for durable facts (provider status, completed setup, do-not-repeat advice).
- Rule: `.cursor/rules/30-project-memory.mdc` (always apply).

## Kepi Design Law

- Read `KEPI_DESIGN_LAW.md` before any UI, map, flight, hotel, or API change.
- Structure: **GLOBAL** · **FLIGHTS** · **HOTELS** · **MAP** · **DATA / API** — append laws to the correct section only.
- **Screenshot/map from user:** read `.cursor/rules/40-screenshot-triage.mdc` first — describe the image defect before coding.
- Every bug fix in a covered domain must append a one-line law and add/update a test; add a row to the Test index.
- Laws are enforced on every build: `npm run test:laws` (runs in `prebuild`). Ship gate: `npm run verify:ship`.

## Domain bot skills (Cursor)

| Skill | Path |
|-------|------|
| Conductor | `.cursor/skills/kepi-conductor/SKILL.md` |
| Hotel | `.cursor/skills/kepi-hotel-bot/SKILL.md` |
| Flight | `.cursor/skills/kepi-flight-bot/SKILL.md` |
| Airport | `.cursor/skills/kepi-airport-bot/SKILL.md` |
| Map | `.cursor/skills/kepi-map-bot/SKILL.md` |
| Points / Travel Fit | `.cursor/skills/kepi-points-bot/SKILL.md` |
| Card earn | `.cursor/skills/kepi-card-bot/SKILL.md` |

These are agent playbooks, not autonomous runtime bots. Jeff instructs the conductor; conductor routes to domain skills.

## Fix log

### 2026-07-15 (Session — Phase 2 SEA footways → routeGrade surveyed)
- **M37** `footwayGraph.ts` + `applyFootwayOverlay.ts` + `seaPedestrianWays.json` (Overpass 2026-07-15). SEA live layout snaps same-side to OSM footways, keeps security_transition/train, retains curated pier/hall bridges with an honest warning (OSM alone is not a continuous sterile graph). `routeGrade:"surveyed"` only after journey gate. LAX/ONT stay schematic.
- Honesty: do not claim pure-OSM corridors; bridges are documented in overlay warnings + M37.

### 2026-07-15 (Session — SEA OSM amenity merge into live layout)
- **134 named OSM amenities** (shop/food/bank/ATM/charging) merged into curated SEA traveler map via `seaOsmAmenities.ts` (Overpass 2026-07-15, exact coords, `precision:"surveyed"`, notes cite `OSM way/node/...`). Elevators/escalators still import-only (clutter). Contextual-pin reachability warnings expected until Phase 2 footways.

### 2026-07-15 (Session — generator hardening phase 1: registry + M36)
- **`listAllBundledLayouts()`** in `getLayout.ts` — M29/M30/M31/M32/M35 cross-airport tests loop one registry (no duplicated SEA/LAX/ONT arrays).
- **M36** `findMonotonicityOutliers` — door-ref facade order; osmImport warns; SEA anchors pass; synthetic mid-facade Door 24 fails.

### 2026-07-15 (Session — M35 verification follow-up after 79db246)
- **SEA airlines:** Icelandair → Door 7 (Port PDF cluster); Southwest Door 17 ESTIMATE; AA/F9/SY Door 21; Alaska surveyed OSM Door 22.
- **SEA_DOOR_ANCHORS** rematched to OSM entrance nodes 4/12/14/20/22 (2026-07-15).
- **M35:** traveler precision honesty tags; `LAYOUT_STALENESS_DAYS=180` + queue badge; import `vsPublished` diff; admin Reference image → draft panel.

### 2026-07-15 (Session — master prompt remaining: amenities, honesty tiers, click-to-place, control points)
- **M12 honesty:** `wayfindingHonestyTier` (`strong` | `official_static` | `weak`). `OfficialAirportMapLink` no longer presents Google venue-search as a confident gold CTA; when Kepi has a layout, Kepi is primary and the external link is secondary. Fallback checklist leads when weak.
- **M34 amenity promotion:** `osmImport` converts named shops/food/banks/ATMs/elevators/escalators/charging/baggage to surveyed POIs; Overpass pulls entrances + those tags.
- **Control-point pooling:** `controlPointAnchors.ts` + `controlPointTransform.ts` (affine + hull grade). Door-only pool is insufficient for 2D.
- **Click-to-place:** `applyClickToPlace` + admin `placeMode` on `AirportNavigatorMap` (`layoutOverride` + map click). Security stays schematic.
- **SEA airline coverage:** ticketing-hall test now asserts the full carrier IATA set (25), not just a count ≥20.

### 2026-07-15 (Session — master prompt locked into agent memory)
- **Standing order:** every airport-map build starts by reading
  `CURSOR_PROMPT_MASTER_airport_maps_all_airports.md`. Wired into
  `.cursor/skills/kepi-airport-bot/SKILL.md` (REQUIRED FIRST READ),
  `.cursor/rules/60-airport-map-master-prompt.mdc`, and
  `KEPI_PROJECT_MEMORY.md` Decision 2026-07-15. Master prompt file is now tracked
  in the repo (was untracked scratch).
- **M33 also shipped this session (ground-truth conformance validator):** shared
  `osmGroundTruth.ts::checkOsmGroundTruth` — gate-ref exact match, curb→road
  proximity, cross-category collision, footprint containment (kinks-gated). Wired
  into `osmImport.ts` (warnings on draft). Test `osmGroundTruth.test.ts`.

### 2026-07-15 (Session — ground-truth conformance foundation, M31/M32)
- **Master-prompt execution, step 1 (audit) + first invariants.** Confirmed the airport engine is already IATA-keyed/airport-agnostic (`getLayout.ts::LAYOUTS` is the live 2D registry the map uses; `layouts/index.ts::LAYOUT_REGISTRY` is a separate legacy 3D model, SEA-only — not rebuilt). Then shipped the two safest, foundational conformance invariants as **shared cross-airport code** in `validateAirportLayoutGraph` (runs at parse + publish for every IATA):
  - **M31 — landside↔airside only via `security_transition`.** Any edge whose endpoints differ in `airside` must be `kind:"security_transition"`, else the layout fails to parse/publish. Makes "security past the gates" structurally impossible, not just visually wrong.
  - **M32 — security is permanently approximate.** A `security` POI may never carry `precision:"surveyed"` (checkpoints have zero public ground truth — OSM tags none; Apple IMDF excludes the screening area by policy). Settled decision; stop researching checkpoint coordinates.
  - Test `src/lib/airportNav/groundTruthConformance.test.ts` (bundled SEA/LAX/ONT pass; synthetic violations rejected). Bundled layouts already satisfied both — no data changes.
- **Still pending from master prompt (honest status, not yet built):** cross-airport ground-truth-vs-OSM validator (gate-ref exact match, curb→road proximity via turf point-to-line, cross-category collision, footprint containment gated behind a `@turf/kinks` ring check); staleness/`verifiedAt` + diffed re-import drafts; security approximate-**zone rendering + mandatory UI disclaimer** (M32's render half); admin **click-to-place** correction tool; confirm curve-interpolation stays human-gated. Route-grade honesty (M30) already shipped.

### 2026-07-15 (Session — admin airport verify + honest routes, M30)
- **Admin can open/verify any airport map on demand:** `/admin/airport-editor` gained a "Bundled airports — open & verify" gallery (SEA/LAX/ONT with M29 audit health badges) that embeds the **real** `AirportNavigatorMap` (OSM basemap, pins, logos) — Plan/At-airport toggle + gate picker, credentials pre-seeded so no security modal. New read-only API `GET /api/admin/airport-layout/bundled` (list + `?iata=` full layout & audit). The old schematic wire diagram is demoted to a collapsible.
- **M30 — never draw a route we can't stand behind:** added `AirportLayout.routeGrade` (`"surveyed"` | `"schematic"`, default schematic). Every current airport is a straight-line skeleton, so we now draw **no** walking line (it cut through terminals/roads/parking, per Jeff's LAX screenshot); the map shows accurate pins + an *approximate* time estimate + an "Approximate layout — pins from OpenStreetMap" banner. Only `"surveyed"` (graph rebuilt from real OSM footways — Phase 2) draws turn-by-turn. Gated in `AirportNavigatorMap` (route source + schematic layer + directions panel). Test: `src/lib/airportNav/routeGradeHonesty.test.ts`.
- **Phase 2 planned (Jeff approved: honest-now, then real pipeline):** `osmImport.ts` only fetches terminal/concourse/gate/toilet/lounge and synthesizes a straight-line skeleton (curb = building centroid, security = interpolated guess, gate = gate-cluster centroid on the apron). Real fix = pull `entrance=*` + `highway=footway/corridor/steps` + `railway=platform`, build the graph from real paths, curbs at real entrances, **snap every node inside a terminal footprint** (reject parking-lot nodes), honesty tiers, then flip rebuilt airports to `routeGrade:"surveyed"`.

### 2026-07-15 (Session — ONT added as airport #3 via the M29 playbook)
- **Ontario International (ONT)** — small two-terminal airport. New files: `src/lib/airportNav/layouts/ont.ts`, `ontFootprints.ts` (real OSM), `ontNodeContainment.test.ts`. Registered in `getLayout.ts`, `allAirportsQuality.test.ts`, `test:laws`.
- **SURVEYED (real OSM Overpass 2026-07-15):** T2 gate cluster (201–213), T4 gate cluster (401–414), Aspire lounge, T4 + International Arrivals footprints. **ESTIMATE:** curbs/checkpoints (T4 curb = real building centroid; T2 has NO OSM building polygon so curb estimated ~60 m north of gates; checkpoints interpolated — M15). Gates numeric → resolver `2*`→T2, `4*`→T4.
- **Overpass note:** the public endpoint timed out twice under load; retry after a few seconds (or use the kumi mirror). Not a coverage problem.

### 2026-07-14 (Session — LAX added as airport #2 via the M29 playbook)
- **First airport built with the new-airport playbook.** LAX is a horseshoe of independent terminals (T1, T2, T3, TBIT, T4, T6, T7, T8) + West Gates (Midfield Satellite, tunnel from TBIT). New files: `src/lib/airportNav/layouts/lax.ts`, `laxFootprints.ts` (real OSM rings, auto-generated + RDP-simplified), `laxNodeContainment.test.ts` (ground-truth guard). Registered in `getLayout.ts`, `allAirportsQuality.test.ts`, and `package.json` `test:laws`.
- **Honesty tiers:** gate-cluster centroids, lounges, footprints = SURVEYED (real OSM Overpass 2026-07-14, ODbL). Curbs = real OSM building centroids; checkpoints = interpolated ESTIMATES (OSM has no LAX checkpoint/curb tagging — M15). **Terminal 5 omitted** (no OSM polygon/gates yet) rather than fabricated. LAX gates are numeric (no letter prefixes); `gateNodeResolver` uses numeric prefixes with longest-prefix-wins so `130`→TBIT beats `13`→T1.
- **Auditor made multi-terminal-aware (M29 refinement):** backtracking is now judged from the destination's NEAREST curb (you're dropped at your own terminal), not one global origin walked around the horseshoe; plus an absolute floor (`MIN_BACKTRACK_METERS=120`) so a lounge a few metres past security isn't a false zigzag. SEA still 0–12%.
- **To add the next airport:** query Overpass (gates/terminals/lounges), compute per-cluster centroids, estimate curbs/checkpoints with honest labels, register in BOTH `getLayout.ts` and `allAirportsQuality.test.ts`, add a `*NodeContainment` test. See KEPI_DESIGN_LAW M29.

### 2026-07-14 (Session — airport scalability: mistakes baked into code as a gate)
- **Root question (Jeff):** "As we build each airport, will we hit the same problems? Put the mistakes into the code so we don't repeat them." **Answer:** the renderer/UX fixes already carried over (shared `AirportNavigatorMap`), but every data/graph fix was SEA-only, and `osmImport.ts` synthesizes a **star-graph-to-a-hub** skeleton — so every new airport *would* reintroduce the zigzag / route-across-tarmac / orphaned-destination / lounge-outside bugs.
- **Fix (KEPI_DESIGN_LAW M29):** new `src/lib/airportNav/layoutQuality.ts` → `auditLayoutRouting()` encodes the SEA lessons as **generic, orientation-independent invariants**: reachability of journey destinations, no-backtrack (≤50% of direct distance; SEA sits at 0–12%), and gross coordinate sanity (≤15 km from center). Wired into the **publish gate** (`createAirportLayoutPackage`, `status: "published"` only — reads/drafts not gated) and a **build gate** (`allAirportsQuality.test.ts` iterates every bundled layout).
- **The audit found a real latent bug on first run:** 6 SEA amenity pins (McDonald's, Salty's, …) were nodes with **no edges** → unreachable. Classified as contextual pins → warning (not a ship-blocker), since connecting them needs per-airport corridor data (verify-first). Do NOT guess edges for them.
- **Scaling rule:** accuracy is still per-airport OSM ground-truth (a `*NodeContainment` test); the audit only catches the structural failure modes. New-airport playbook is in M29 — register each airport in BOTH `getLayout.ts` and `allAirportsQuality.test.ts`.

### 2026-07-12 (Session — lifetime invite + travel-assistant crash)
- **Lifetime invite auto-install:** Email link `?redeem=` / `?code=` now redeems on travel-assistant load via `useAutoRedeemInviteFromUrl`; onboarding skip/complete also redeems; `/redeem` redirects signed-in users straight to travel-assistant. Shared helper: `redeemInviteCodeClient`.
- **Production crash `onCreateTrip is not defined`:** `DesktopTripHomeView` hero button referenced `onCreateTrip` but the prop is `onStartNewTrip` — users saw lifetime work briefly then crash when home view rendered after onboarding. **Do not rename props in JSX without updating all references; run `tsc` grep for `TS2304` in travel-assistant before ship.**
- **Missing import:** `resolveBookingWizardPhase` used in `page.tsx` without import — fixed (dead callback today, but would crash if called).
- **Returning users forced through onboarding / empty trips flash:** Onboarding PUT used to `kvStoreDel(onboarding-complete)` on every progress save (including invite redeem + notifications), resetting veterans. Fixed: never wipe complete for returning users; auto-complete onboarding when `listTrips(userId).length > 0`; only mount `OnboardingFlow` after `!tripsLoading`; retry trip GET on degraded empty responses.

### 2026-07-06 (Session 6)
- **Shared booking pricing (G14):** multi-leg flights on one confirmation or forwarded email share trip-level pricing — sibling legs no longer each flag "need pricing" when the booking total is already logged.

### 2026-07-06 (Session 5)
- **Trip truth loop:** boarding pass URL extraction from forwarded emails, merged flight-lookup GET route, Trip Health gap actions open Book → Hotels with city/dates prefilled, Europe 2026 unit pass tests. Laws F11, G13.

### 2026-07-06 (Session 4)
- **Competitive gaps batch:** phase-aware flight status polling (90s within 6h, 5m otherwise), AeroDataBox + optional FlightAware merge with discrepancy logging, 2-min Inngest server sweep, honest check-in/Wallet handoff card on Home, Uber/Lyft deep links on Travel Day. Laws F9–F10, M9. Group planning + NL booking memo — build later / don't build now.

### 2026-07-06 (Session 3)
- **Offline nav + personalization (5-prompt batch):** itinerary-scoped offline cache (48h prefetch, leg-based eviction), pilot offline city GeoJSON bundles + Live Map offline fallback, airport nav walk/security timing calibration from journey telemetry, two-stage post-booking briefing card in Airport Mode, input-style personalization (genome + Plan tab suggestion — suggest never silent apply). Design laws D14–D18 + law tests in `test:laws`.

### 2026-07-06 (Session 2)
- **ML readiness scaffolding** — parser version, correction triplets on review accept, active-learning review queue sort, held-out parse fixtures, few-shot AI fallback, suggestion outcome stub on Trip health.
- **CI typecheck fix:** `app-sitter/regression-qa-pass2.spec.ts` was written without TypeScript types; strict `tsc` failed in the ci-review workflow while `npm run build` passed. All `app-sitter/*.spec.ts` files must use explicit types (`Page`, typed arrays). Scratch folders `files-from-claude*` excluded from root tsconfig.

### 2026-07-06
- **Forwarded reservations no longer bypass review:** `drainForwardReviewQueue` was auto-promoting every email-forward/gmail-import review item straight to live reservations regardless of confidence ("no confirm step"), both server-side and on every client trip-state load. Added `evaluateForwardedReservationGate` (confidence + missing-field + plausibility check) in the ingestion route; low-confidence/implausible drafts now carry `reasons` and `drainForwardReviewQueue` never auto-promotes an item with `reasons` set.
- **New `checkReservationPlausibility`:** deterministic checks (real IATA codes, arrival ≠ departure, sane date window, checkout after check-in, non-negative price) run independent of parser confidence.
- **`emailForwardParser` gained "dinner" type detection:** restaurant reservations, tours, excursions, boat trips previously had no keyword pattern and fell through to the "ride" default. Regex table + AI fallback prompt + `normalizeType` all updated together (see D12).
- **`/api/ocr` was a mock stub returning fake receipt data** ("Dinner with clients", $123.45) on every call regardless of the photo. Now returns an explicit 501/"not available yet" instead of fabricating data. Real OCR wiring deferred — not yet a product priority.
- See `KEPI_DESIGN_LAW.md` D10–D13.

### 2026-06-15
- Hotel stay profile, trip stay planner, LiteAPI fallback, `KEPI_PROJECT_MEMORY.md`
- Duffel Stays emails already sent by owner — do not re-suggest unless asked
- Travelpayouts Drive skipped (no sitewide install)
- **Award/points flights:** trip spend counts miles without requiring cash; drawer cash field optional; don't impute ticket value when miles + $0 due

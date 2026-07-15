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

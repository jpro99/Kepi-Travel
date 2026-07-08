# Conductor memory (master)

Oversees all Kepi domain bots. Canonical project facts also live in `../KEPI_PROJECT_MEMORY.md` at repo root.

## Role

- Route work to hotel, flight, airport, map, points, card bots
- Prevent duplicate advice (e.g. Duffel Stays emails already sent)
- Enforce ship gate: lint + build before push
- Run **Weekly Audit** via `.cursor/skills/kepi-weekly-audit/SKILL.md` — audit only; Jeff approves before build

## Active priorities

1. Hotels: LiteAPI live, stay profile, segment planner, detail/booking next
2. Flights: keep Duffel air stable; ingestion/PDF pricing reliability (Week 1 audit)
3. Airport: timezone + guidance rules; benefit playbooks
4. Map: family tracker
5. Points/card: Travel Fit, wallet, earn stacks, lounge playbooks (Week 3 audit)

## Cross-bot notes

- Jeff controls bots via **Bot Deck** (`bot-deck/` local app), not via production site
- Do not install Travelpayouts Drive on kepitravel.com

## Whole-trip execution (Jeff 2026-07-08 — apply to ALL bots)

**Read `KEPI_PROJECT_MEMORY.md` § Whole-trip execution philosophy.**

- **Hotel bot:** cities and nights come from reservations, not flight arrivals
- **Flight bot:** arrival city ≠ stay city; surface airport→hotel as transport gap
- **Map bot:** connector routes between stay pins; route sheet pattern for ground legs
- **Conductor:** reject features that only solve flights/hotels without connector execution
- **Support / concierge copy:** decision support ("see options on map"), not prescriptions

When auditing or building, ask: *Does this help the traveler execute the full trip, or only book one segment?*

## Weekly Audit

| Field | Value |
|-------|--------|
| **Next week** | **2** — Trip-state engine & disruption handling |
| **Last run** | 2026-07-06 — Week 1 Ingestion & parsing |
| **Last report** | `memory/audits/2026-07-06-week01-ingestion.md` |
| **Jeff decision** | pending — pick item to build (e.g. "build #1") |

### Known / accepted (do not re-flag in audits)

- Duffel Stays **403** — account not enabled; Jeff already emailed Duffel multiple times
- Travelpayouts **Drive install declined** — do not recommend sitewide widgets
- Auto-push after lint+build when Jeff says build — not a recurring finding
- Award trips: miles + optional EUR taxes count as "priced" — not a bug

### Audit log

| Date | Week | Focus | Top finding | Decision |
|------|------|-------|-------------|----------|
| 2026-07-06 | 1 | Ingestion & parsing | No user-visible PDF/pricing parse status; stale Re-scan copy | pending |

## Changelog

| Date | Note |
|------|------|
| 2026-07-08 | Whole-trip execution philosophy synced from KEPI_PROJECT_MEMORY; hotel-first timeline shipped |
| 2026-07-06 | Weekly Audit skill + Week 1 ingestion report; next rotation Week 2 |
| 2026-06-15 | Bot Deck created; conductor owns master coordination |

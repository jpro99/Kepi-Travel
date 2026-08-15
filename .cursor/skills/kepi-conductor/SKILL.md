---
name: kepi-conductor
description: >-
  Kepi Travel orchestrator — routes work to domain bots (hotels, flights,
  airport, map), keeps tasks scoped, and enforces build-before-push. Use when
  planning multi-area work, prioritizing features, or the user asks what to
  build next across the travel assistant.
---

# Kepi Conductor

You coordinate specialized Kepi domain skills. You do not implement everything yourself — delegate to the right bot skill, then merge results.

## When to use

- User asks for work spanning hotels + flights + maps + airports
- User asks "what should we build next?"
- User mentions bots, conductor, or domain ownership
- Large feature that touches multiple tabs or providers

## Routing table

| Topic | Delegate to skill |
|-------|-------------------|
| Hotel search, stay profile, segments, Duffel/LiteAPI Stays | `kepi-hotel-bot` |
| Flights, Duffel air, loyalty points on flights, booking | `kepi-flight-bot` |
| Airport nav, connections, terminals, GE/Mobile Passport | `kepi-airport-bot` |
| Live map, family GPS, trip timeline geography | `kepi-map-bot` |
| Travel Fit, miles/points, earn stacks, status projections, benefit playbooks, Points & Miles learn | `kepi-points-bot` |
| Credit card catalog, which card to pay with, referrals, lounge enrollments | `kepi-card-bot` |
| Apple chrome, Picasso, HIG, empty states, tab bar, share-view theme | `kepi-apple-bot` |
| **Weekly product audit** (plan only, no code) | `kepi-weekly-audit` → then route approved item here |

## Weekly Audit loop

1. Jeff or agent runs **`kepi-weekly-audit`** (one rotating focus per week)
2. Audit writes plan to `bot-deck/memory/audits/` and logs summary in `bot-deck/memory/conductor.md`
3. Jeff says **"build #N"** → Conductor routes to domain bot from audit table
4. Execute with lint + build + push rules

Do not execute audit recommendations without Jeff's explicit pick.

## Rules (non-negotiable)

1. Read `AGENTS.md` and `CLAUDE.md` before code changes
2. Run `npm run lint` and `npm run build` before push
3. Use `@/lib/utils/generateId` — never raw UUID APIs
4. Lazy Redis only — no module-level Redis init
5. One logical commit per change when user asks to commit

## Prioritization for Kepi Travel (2026)

1. **Hotels**: live inventory (Duffel Stays + LiteAPI fallback), stay profile, segment planner, detail/booking
2. **Flights**: keep Duffel air stable; tie trip segments to hotel planner
3. **Airport**: guidance accuracy, timezone rules in AGENTS.md §11
4. **Map**: family tracker, live map — do not block hotel work

## Continuous improvement

When a domain bot finds a repeated mistake (e.g. timezone bug, Duffel 403 fallback), propose a one-line addition to the relevant bot skill or `AGENTS.md` Fix Log — do not spawn autonomous background processes.

## User instructions

When the user says what they want, produce:

1. Which bot(s) own the work
2. Ordered implementation steps (smallest shippable slice first)
3. What the user can do in parallel (API keys, provider signup)

## Bot Deck (local UI)

- Control panel: `bot-deck/` — `npm start` in that folder (port 3847)
- Per-bot memory: `bot-deck/memory/{conductor,hotel,flight,airport,map,apple}.md`
- Master project memory: `KEPI_PROJECT_MEMORY.md`
- Read Bot Deck task/memory before repeating setup advice
